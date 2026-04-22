//! Tauri command handlers — the IPC surface exposed to the Svelte webview.
//!
//! Keep this module thin. Business logic lives in [`super::lima`] and
//! [`super::container`]; these handlers just wire them up, manage shared
//! state, and shape responses for the frontend.

use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::{container, lima, RuntimeState};

/// Mirrors the `RuntimeStatus` discriminated union in `src/lib/tauri.ts`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum RuntimeStatusDto {
    Uninitialized,
    Starting { message: String },
    Ready { vm_name: String, image: String },
    Error { message: String },
}

#[tauri::command]
pub async fn runtime_status(state: State<'_, Arc<RuntimeState>>) -> Result<RuntimeStatusDto, String> {
    let lima_state = state.lima.read().await;
    let container_state = state.container.read().await;

    if container_state.running {
        return Ok(RuntimeStatusDto::Ready {
            vm_name: lima::VM_NAME.to_string(),
            image: container::ROS_IMAGE.to_string(),
        });
    }
    if lima_state.vm_running {
        return Ok(RuntimeStatusDto::Starting {
            message: "VM up, pulling ROS image...".to_string(),
        });
    }
    Ok(RuntimeStatusDto::Uninitialized)
}

#[tauri::command]
pub async fn start_runtime(
    state: State<'_, Arc<RuntimeState>>,
) -> Result<RuntimeStatusDto, String> {
    // 1. Make sure limactl is installed — fail loudly with install instructions.
    let detection = lima::detect().await.map_err(|e| e.to_string())?;
    tracing::info!(?detection, "lima detected");
    state.lima.write().await.detected = Some(detection);

    // 2. Start the VM. Day-1 stub returns Ok() immediately; day-2 actually
    //    launches Lima and waits for readiness.
    lima::start_vm().await.map_err(|e| e.to_string())?;
    state.lima.write().await.vm_running = true;

    // 3. Pull the ROS image + start the container. Also stubs.
    container::pull_image().await.map_err(|e| e.to_string())?;
    state.container.write().await.image_pulled = true;

    container::start("/workspace").await.map_err(|e| e.to_string())?;
    state.container.write().await.running = true;

    Ok(RuntimeStatusDto::Ready {
        vm_name: lima::VM_NAME.to_string(),
        image: container::ROS_IMAGE.to_string(),
    })
}

#[tauri::command]
pub async fn send_chat_message(
    prompt: String,
    _state: State<'_, Arc<RuntimeState>>,
) -> Result<String, String> {
    // Day-3 work: route `prompt` into the roscode agent running inside the
    // container and stream tool calls back via a tauri::Channel. For the
    // day-1 scaffold we just echo so the webview round-trip is testable.
    Ok(format!("(stub) got prompt: {prompt}"))
}
