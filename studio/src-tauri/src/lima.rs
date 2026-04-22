//! Wrapper around the `limactl` CLI.
//!
//! Lima (https://github.com/lima-vm/lima) is an open-source Linux VM manager.
//! We shell out to `limactl` rather than linking anything because (a) it's
//! the supported API surface, (b) it keeps our Rust crate small, and (c) it
//! matches how Rancher Desktop and Colima use Lima internally.
//!
//! **Day-1 scaffold:** the functions below define the surface we'll fill in on
//! day 2. They currently check for the binary and report status; starting a
//! VM is stubbed out with a TODO that will call `limactl start` with a
//! generated template.

use std::process::Stdio;
use tokio::process::Command;

pub const VM_NAME: &str = "roscode";

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
    #[error("limactl returned non-zero ({code}): {stderr}")]
    CommandFailed { code: i32, stderr: String },
    #[error("io error running limactl: {0}")]
    Io(#[from] std::io::Error),
}

/// Probe for `limactl` on PATH. Returns the detected binary + version or
/// `NotInstalled`. Safe to call at startup; doesn't mutate anything.
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

    let version_out = Command::new(&binary_path)
        .arg("--version")
        .output()
        .await?;
    if !version_out.status.success() {
        return Err(LimaError::CommandFailed {
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

/// Start the roscode VM. **Stub** — day 2 will: generate a Lima YAML template
/// (Alpine + containerd + port-forward for foxglove-bridge), run
/// `limactl start --tty=false --name=roscode <template>`, poll until ready.
pub async fn start_vm() -> Result<(), LimaError> {
    // TODO(day-2): generate lima.yaml, `limactl start`, wait for SSH.
    tracing::warn!("lima::start_vm() is a day-1 stub — VM is not actually started yet");
    Ok(())
}

/// Run a command inside the VM via `limactl shell`. Returns combined
/// stdout+stderr. Stub for day-1; safe to call because `limactl shell` will
/// simply fail fast if the VM isn't running.
#[allow(dead_code)]
pub async fn shell_exec(cmd: &[&str]) -> Result<String, LimaError> {
    let output = Command::new("limactl")
        .arg("shell")
        .arg(VM_NAME)
        .args(cmd)
        .output()
        .await?;

    if !output.status.success() {
        return Err(LimaError::CommandFailed {
            code: output.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
