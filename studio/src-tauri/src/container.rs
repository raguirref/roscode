//! ROS 2 container lifecycle inside the embedded Lima VM.
//!
//! We don't talk to Docker on the host — the host has no Docker. All
//! container operations run **inside** the Lima VM via
//! `limactl shell roscode -- nerdctl ...`. `nerdctl` is the containerd CLI
//! that ships with Lima's `default` template (rootless).
//!
//! Network model: the ROS container runs with `--net=host`, so anything it
//! binds on port 8765/9000 in the VM is transparently forwarded to the same
//! ports on the Mac by Lima's portForwards.

use crate::lima;

pub const ROS_IMAGE: &str = "osrf/ros:humble-desktop";
pub const CONTAINER_NAME: &str = "roscode-ros";
pub const AGENT_SRC_MOUNT: &str = "/opt/roscode-src";
pub const WORKSPACE_MOUNT: &str = "/workspace";

#[derive(Debug, Default)]
pub struct ContainerState {
    pub image_pulled: bool,
    pub running: bool,
    pub agent_installed: bool,
    pub server_running: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ContainerError {
    #[error("nerdctl failed: {0}")]
    #[allow(dead_code)]
    Nerdctl(String),
    #[error(transparent)]
    Lima(#[from] lima::LimaError),
}

/// Pull `osrf/ros:humble-desktop` inside the VM. Slow first time (~2 GB).
/// Idempotent — safe to call on every startup.
pub async fn pull_image() -> Result<(), ContainerError> {
    tracing::info!(image = ROS_IMAGE, "pulling ROS image inside VM");
    let out = lima::shell_exec(&["nerdctl", "pull", ROS_IMAGE]).await?;
    tracing::debug!(%out, "nerdctl pull complete");
    Ok(())
}

/// Check whether the `roscode-ros` container is currently running in the VM.
pub async fn is_running() -> Result<bool, ContainerError> {
    let out = lima::shell_exec(&[
        "nerdctl",
        "ps",
        "--filter",
        &format!("name={CONTAINER_NAME}"),
        "--format",
        "{{.Names}}",
    ])
    .await?;
    Ok(out.lines().any(|line| line.trim() == CONTAINER_NAME))
}

/// Start the ROS container with:
///   - the user's workspace bind-mounted at `/workspace`
///   - the roscode Python source bind-mounted at `/opt/roscode-src` (ro)
///   - `ANTHROPIC_API_KEY` env var forwarded if provided
///
/// Idempotent: if a container with the same name already exists (running
/// or stopped) we reuse it — we do NOT replace the mounts. Delete the
/// container manually (`limactl shell roscode -- nerdctl rm -f roscode-ros`)
/// to force a fresh bind-mount set.
pub async fn start(
    host_workspace_path: &str,
    host_roscode_src: &str,
    anthropic_api_key: Option<&str>,
) -> Result<(), ContainerError> {
    if is_running().await? {
        tracing::info!(container = CONTAINER_NAME, "already running");
        return Ok(());
    }

    let existing = lima::shell_exec(&[
        "nerdctl",
        "ps",
        "-a",
        "--filter",
        &format!("name={CONTAINER_NAME}"),
        "--format",
        "{{.Names}}",
    ])
    .await?;

    if existing.lines().any(|l| l.trim() == CONTAINER_NAME) {
        tracing::info!(container = CONTAINER_NAME, "starting existing stopped container");
        lima::shell_exec(&["nerdctl", "start", CONTAINER_NAME]).await?;
        return Ok(());
    }

    tracing::info!(
        container = CONTAINER_NAME,
        workspace = host_workspace_path,
        src = host_roscode_src,
        "creating container"
    );

    let ws_bind = format!("{host_workspace_path}:{WORKSPACE_MOUNT}");
    let src_bind = format!("{host_roscode_src}:{AGENT_SRC_MOUNT}:ro");

    let mut args: Vec<&str> = vec![
        "nerdctl",
        "run",
        "-d",
        "--name",
        CONTAINER_NAME,
        "--net=host",
        "-v",
        &ws_bind,
        "-v",
        &src_bind,
        "-w",
        WORKSPACE_MOUNT,
    ];

    // Pass the Anthropic key through to the container so the server can
    // call Claude. If it's not set on the host, `roscode serve` will still
    // boot but every prompt will fail with a clear error — that's better
    // than refusing to start the app at all.
    let env_kv: String;
    if let Some(key) = anthropic_api_key {
        env_kv = format!("ANTHROPIC_API_KEY={key}");
        args.push("-e");
        args.push(&env_kv);
    }

    args.extend_from_slice(&[
        ROS_IMAGE,
        "sleep",
        "infinity",
    ]);

    lima::shell_exec(&args).await?;
    Ok(())
}

/// Install the roscode Python package inside the container in editable mode.
/// Idempotent — pip notices the package is already installed and exits fast.
pub async fn bootstrap_agent() -> Result<(), ContainerError> {
    tracing::info!("pip install -e /opt/roscode-src inside container");
    // `--break-system-packages` is needed on Ubuntu 22.04+ with PEP 668.
    // The container is throwaway, so polluting its system site-packages is fine.
    let out = lima::shell_exec(&[
        "nerdctl",
        "exec",
        CONTAINER_NAME,
        "bash",
        "-lc",
        "pip install --break-system-packages --quiet -e /opt/roscode-src",
    ])
    .await?;
    tracing::debug!(%out, "pip install complete");
    Ok(())
}

/// Spawn `python -m roscode.server --port 9000` as a detached process
/// inside the container. Port 9000 is mapped host ← VM ← container by
/// Lima's portForwards + the container's `--net=host`.
///
/// Writes server logs to `/tmp/roscode-server.log` inside the container.
pub async fn start_server(port: u16) -> Result<(), ContainerError> {
    // Kill any previous instance so we don't accumulate zombies across restarts.
    let _ = lima::shell_exec(&[
        "nerdctl",
        "exec",
        CONTAINER_NAME,
        "bash",
        "-lc",
        "pkill -f 'roscode.server' || true",
    ])
    .await;

    let cmd = format!(
        "nohup python3 -m roscode.server --port {port} \
         >/tmp/roscode-server.log 2>&1 &"
    );
    lima::shell_exec(&["nerdctl", "exec", CONTAINER_NAME, "bash", "-lc", &cmd]).await?;
    tracing::info!(port, "roscode server spawned inside container");
    Ok(())
}

/// Stop + remove the container. Safe to call even if nothing is running.
#[allow(dead_code)]
pub async fn stop() -> Result<(), ContainerError> {
    let _ = lima::shell_exec(&["nerdctl", "stop", CONTAINER_NAME]).await;
    let _ = lima::shell_exec(&["nerdctl", "rm", CONTAINER_NAME]).await;
    Ok(())
}

/// Run a one-shot command inside the container and return stdout.
/// Wraps the command in `bash -lc` so ROS 2 setup is sourced automatically.
#[allow(dead_code)]
pub async fn exec(cmd: &str) -> Result<String, ContainerError> {
    let wrapped = format!("source /opt/ros/humble/setup.bash && {cmd}");
    lima::shell_exec(&[
        "nerdctl",
        "exec",
        CONTAINER_NAME,
        "bash",
        "-lc",
        &wrapped,
    ])
    .await
    .map_err(Into::into)
}
