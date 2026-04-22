//! ROS 2 container lifecycle inside the embedded Lima VM.
//!
//! We don't talk to Docker on the host — the host has no Docker. All
//! container operations run *inside* the VM via `limactl shell <vm>
//! nerdctl ...` (containerd's CLI, which ships with Lima templates).
//!
//! **Day-1 scaffold:** surface-only; the real pull/run/exec land on day 2.

pub const ROS_IMAGE: &str = "osrf/ros:humble-desktop";
pub const CONTAINER_NAME: &str = "roscode-ros";

#[derive(Debug, Default)]
pub struct ContainerState {
    pub image_pulled: bool,
    pub running: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ContainerError {
    #[error("VM not ready — start Lima first")]
    VmNotReady,
    #[error("nerdctl failed ({code}): {stderr}")]
    NerdctlFailed { code: i32, stderr: String },
    #[error(transparent)]
    Lima(#[from] super::lima::LimaError),
}

/// Pull `osrf/ros:humble-desktop` inside the VM. **Stub.**
pub async fn pull_image() -> Result<(), ContainerError> {
    // TODO(day-2): limactl shell roscode nerdctl pull osrf/ros:humble-desktop
    tracing::warn!("container::pull_image() is a day-1 stub");
    Ok(())
}

/// Start the ROS container with the user's workspace bind-mounted. **Stub.**
pub async fn start(_workspace_path: &str) -> Result<(), ContainerError> {
    // TODO(day-2): nerdctl run -d --name roscode-ros -v /host/ws:/workspace \
    //              --net=host osrf/ros:humble-desktop sleep infinity
    tracing::warn!("container::start() is a day-1 stub");
    Ok(())
}

/// Run a one-shot command inside the container. **Stub for day-1.**
#[allow(dead_code)]
pub async fn exec(_cmd: &[&str]) -> Result<String, ContainerError> {
    // TODO(day-2): limactl shell roscode nerdctl exec roscode-ros bash -c "..."
    Err(ContainerError::VmNotReady)
}
