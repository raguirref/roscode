//! Tauri command handlers — the IPC surface exposed to the Svelte webview.
//!
//! Keep this module thin. Business logic lives in [`crate::lima`] and
//! [`crate::container`]; these handlers just wire them up and stream
//! progress events back to the webview.

use std::sync::Arc;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::{container, lima, RuntimeState};

/// Mirrors the `RuntimeStatus` discriminated union in `src/lib/tauri.ts`.
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
#[allow(dead_code)] // `Error` is part of the DTO contract; frontend constructs it from Err returns.
pub enum RuntimeStatusDto {
    Uninitialized,
    Starting { message: String },
    Ready { vm_name: String, image: String },
    Error { message: String },
}

/// Progress events streamed during [`start_runtime`]. The webview subscribes
/// via a Tauri `Channel<StartupEvent>` and renders a progress line per stage.
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum StartupEvent {
    Stage { label: String, percent: f32 },
    Log { line: String },
    Done { status: RuntimeStatusDto },
    Failed { message: String },
}

#[tauri::command]
pub async fn runtime_status(
    state: State<'_, Arc<RuntimeState>>,
) -> Result<RuntimeStatusDto, String> {
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
            message: "VM up, waiting on container...".to_string(),
        });
    }
    Ok(RuntimeStatusDto::Uninitialized)
}

/// Bring the runtime up end-to-end: detect lima → start/create VM →
/// pull ROS image → start container. Streams progress through `channel`
/// so the webview can render stages.
#[tauri::command]
pub async fn start_runtime(
    state: State<'_, Arc<RuntimeState>>,
    channel: Channel<StartupEvent>,
    workspace_path: String,
) -> Result<RuntimeStatusDto, String> {
    match start_runtime_inner(&state, &channel, &workspace_path).await {
        Ok(dto) => {
            let _ = channel.send(StartupEvent::Done {
                status: dto.clone(),
            });
            Ok(dto)
        }
        Err(msg) => {
            let _ = channel.send(StartupEvent::Failed {
                message: msg.clone(),
            });
            Err(msg)
        }
    }
}

async fn start_runtime_inner(
    state: &Arc<RuntimeState>,
    channel: &Channel<StartupEvent>,
    workspace_path: &str,
) -> Result<RuntimeStatusDto, String> {
    stage(channel, "detecting lima", 0.05);
    let detection = lima::detect().await.map_err(|e| e.to_string())?;
    log(channel, format!("lima found: {}", detection.version));
    state.lima.write().await.detected = Some(detection);

    stage(channel, "starting VM (first run ~2 min)", 0.15);
    lima::start_or_create_vm().await.map_err(|e| e.to_string())?;
    state.lima.write().await.vm_running = true;
    log(channel, "VM is Running".into());

    stage(channel, "pulling ROS 2 Humble image", 0.50);
    container::pull_image().await.map_err(|e| e.to_string())?;
    state.container.write().await.image_pulled = true;

    stage(channel, "starting ROS container", 0.85);
    container::start(workspace_path)
        .await
        .map_err(|e| e.to_string())?;
    state.container.write().await.running = true;

    stage(channel, "ready", 1.0);
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
    // Day-3 work: route the prompt into the roscode agent running inside
    // the container and stream tool calls back via another Channel. For
    // now we echo so the webview round-trip is testable.
    Ok(format!("(stub) got prompt: {prompt}"))
}

fn stage(channel: &Channel<StartupEvent>, label: &str, percent: f32) {
    tracing::info!(%label, percent, "startup stage");
    let _ = channel.send(StartupEvent::Stage {
        label: label.to_string(),
        percent,
    });
}

fn log(channel: &Channel<StartupEvent>, line: String) {
    tracing::debug!(%line, "startup log");
    let _ = channel.send(StartupEvent::Log { line });
}
