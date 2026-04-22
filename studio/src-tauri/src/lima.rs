//! Wrapper around the `limactl` CLI.
//!
//! Lima (https://github.com/lima-vm/lima) is an open-source Linux VM manager.
//! We shell out to `limactl` rather than linking anything because:
//!   1. It's the supported API surface — Lima has no stable Rust binding.
//!   2. Keeps our Rust crate small.
//!   3. Matches how Rancher Desktop and Colima use Lima internally.
//!
//! The VM we manage is named `roscode` and is built from Lima's `default`
//! template (Ubuntu 22.04 + rootless containerd + nerdctl). We add two
//! port-forwards so the host can reach services running inside the VM:
//!
//!   - 8765 — foxglove-bridge (ROS 2 WebSocket protocol)
//!   - 9000 — roscode agent WebSocket (chat IPC from the webview)

use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;
use tokio::time::sleep;

pub const VM_NAME: &str = "roscode";

/// Ports we forward VM→host. Keep in sync with the `--set` JQ expression
/// in [`start_or_create_vm`] below.
pub const FOXGLOVE_BRIDGE_PORT: u16 = 8765;
pub const ROSCODE_WS_PORT: u16 = 9000;

#[derive(Debug, Default)]
pub struct LimaState {
    pub detected: Option<Detection>,
    pub vm_running: bool,
}

#[derive(Debug, Clone)]
pub struct Detection {
    pub version: String,
    pub binary_path: String,
}

#[derive(Debug, thiserror::Error)]
pub enum LimaError {
    #[error("limactl not found on PATH — install with `brew install lima`")]
    NotInstalled,
    #[error("limactl {cmd} failed ({code}): {stderr}")]
    CommandFailed {
        cmd: &'static str,
        code: i32,
        stderr: String,
    },
    #[error("timed out waiting for VM `{vm}` to become Running (last status: {last_status})")]
    StartTimeout { vm: String, last_status: String },
    #[error("io error running limactl: {0}")]
    Io(#[from] std::io::Error),
}

/// Probe for `limactl` on PATH. Safe to call at startup; read-only.
pub async fn detect() -> Result<Detection, LimaError> {
    let which = Command::new("which")
        .arg("limactl")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await?;

    if !which.status.success() {
        return Err(LimaError::NotInstalled);
    }
    let binary_path = String::from_utf8_lossy(&which.stdout).trim().to_string();

    let version_out = Command::new(&binary_path).arg("--version").output().await?;
    if !version_out.status.success() {
        return Err(LimaError::CommandFailed {
            cmd: "--version",
            code: version_out.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&version_out.stderr).into_owned(),
        });
    }
    let version = String::from_utf8_lossy(&version_out.stdout).trim().to_string();

    Ok(Detection {
        version,
        binary_path,
    })
}

/// Current status of the roscode VM as Lima sees it.
///
/// - `None`    → VM has never been created.
/// - `Some(s)` → VM exists; `s` is one of "Running", "Stopped", "Broken", ...
pub async fn status() -> Result<Option<String>, LimaError> {
    let out = Command::new("limactl")
        .args(["list", "--format", "{{.Status}}", VM_NAME])
        .output()
        .await?;

    if !out.status.success() {
        // limactl list exits non-zero when the VM doesn't exist.
        return Ok(None);
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        Ok(None)
    } else {
        Ok(Some(s))
    }
}

/// Ensure the roscode VM is running. Creates it from Lima's `default`
/// template if it doesn't exist; starts it if it exists but is stopped;
/// no-ops if it's already running.
///
/// Blocks until the VM reports `Running` or we hit the timeout.
pub async fn start_or_create_vm() -> Result<(), LimaError> {
    let current = status().await?;
    match current.as_deref() {
        Some("Running") => {
            tracing::info!(vm = VM_NAME, "VM already running");
            return Ok(());
        }
        Some("Stopped") => {
            tracing::info!(vm = VM_NAME, "VM exists and stopped — starting");
            run_limactl(&["start", VM_NAME, "--tty=false"], "start").await?;
        }
        Some(other) => {
            tracing::warn!(vm = VM_NAME, status = other, "VM in unexpected state — attempting start anyway");
            run_limactl(&["start", VM_NAME, "--tty=false"], "start").await?;
        }
        None => {
            tracing::info!(vm = VM_NAME, "VM does not exist — creating from template:default");
            // The JQ expression:
            //   (a) appends our two port forwards on top of the default template's,
            //   (b) forces the home-directory mount to writable. Lima 2.0's
            //       default is `writable: false`, which makes `colcon build`
            //       and `write_source_file` fail with EROFS when the agent
            //       tries to modify files in the mounted workspace.
            let set_expr = format!(
                r#".portForwards += [{{"guestPort":{},"hostPort":{}}},{{"guestPort":{},"hostPort":{}}}] | .mounts[0].writable = true"#,
                FOXGLOVE_BRIDGE_PORT, FOXGLOVE_BRIDGE_PORT, ROSCODE_WS_PORT, ROSCODE_WS_PORT
            );
            // Lima 2.0 switched to the `template:` scheme — `template://` still
            // resolves but emits a deprecation warning. Use the new form.
            run_limactl(
                &[
                    "start",
                    "template:default",
                    "--name",
                    VM_NAME,
                    "--tty=false",
                    "--set",
                    &set_expr,
                ],
                "start",
            )
            .await?;
        }
    }

    wait_until_running(Duration::from_secs(180)).await
}

/// Stop the VM if it's running. Idempotent. Called from day-3 shutdown hook.
#[allow(dead_code)]
pub async fn stop_vm() -> Result<(), LimaError> {
    if matches!(status().await?.as_deref(), Some("Running")) {
        run_limactl(&["stop", VM_NAME, "--force"], "stop").await?;
    }
    Ok(())
}

/// Run a command inside the VM via `limactl shell`. Returns stdout on success.
pub async fn shell_exec(cmd: &[&str]) -> Result<String, LimaError> {
    let mut args: Vec<&str> = vec!["shell", VM_NAME];
    args.extend_from_slice(cmd);

    let output = Command::new("limactl").args(&args).output().await?;
    if !output.status.success() {
        return Err(LimaError::CommandFailed {
            cmd: "shell",
            code: output.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

async fn run_limactl(args: &[&str], label: &'static str) -> Result<(), LimaError> {
    let status = Command::new("limactl").args(args).status().await?;
    if !status.success() {
        return Err(LimaError::CommandFailed {
            cmd: label,
            code: status.code().unwrap_or(-1),
            stderr: String::new(), // inherited stdio — err already on the user's console
        });
    }
    Ok(())
}

async fn wait_until_running(timeout: Duration) -> Result<(), LimaError> {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut last_status = String::from("<unknown>");
    while tokio::time::Instant::now() < deadline {
        if let Some(s) = status().await? {
            last_status = s.clone();
            if s == "Running" {
                return Ok(());
            }
        }
        sleep(Duration::from_secs(2)).await;
    }
    Err(LimaError::StartTimeout {
        vm: VM_NAME.to_string(),
        last_status,
    })
}
