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

#[derive(Debug, Default)]
pub struct ContainerState {
    pub image_pulled: bool,
    pub running: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ContainerError {
    #[error("nerdctl failed: {0}")]
    #[allow(dead_code)] // Reserved for day-3 when we parse nerdctl stderr ourselves.
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

/// Start the ROS container with the user's workspace bind-mounted at
/// `/workspace`. Idempotent: if a container with the same name already
/// exists (running or stopped) we reuse it.
///
/// `host_workspace_path` is the path on the **Mac**. Lima mounts the
/// user's home into the VM at the same path, so we pass the same string
/// into nerdctl and the container sees the directory.
pub async fn start(host_workspace_path: &str) -> Result<(), ContainerError> {
    if is_running().await? {
        tracing::info!(container = CONTAINER_NAME, "already running");
        return Ok(());
    }

    // If a stopped container by this name exists, start it. Otherwise create fresh.
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

    tracing::info!(container = CONTAINER_NAME, workspace = host_workspace_path, "creating container");
    let bind = format!("{host_workspace_path}:/workspace");
    lima::shell_exec(&[
        "nerdctl",
        "run",
        "-d",
        "--name",
        CONTAINER_NAME,
        "--net=host",
        "-v",
        &bind,
        "-w",
        "/workspace",
        ROS_IMAGE,
        "sleep",
        "infinity",
    ])
    .await?;
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
