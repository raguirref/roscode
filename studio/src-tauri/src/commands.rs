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

/// Absolute path to the roscode Python package source tree on the host.
/// Resolved at compile time relative to this crate's manifest — the crate
/// lives at `<repo>/studio/src-tauri/`, so `../..` points at the repo root.
///
/// Day-3 reality: the binary always runs from the dev repo. When we bundle
/// for distribution this becomes a path inside the .app's Resources dir.
const REPO_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");

/// Port inside the container where `roscode.server` listens. Also forwarded
/// VM→host by Lima so the webview can open `ws://localhost:{AGENT_WS_PORT}`.
const AGENT_WS_PORT: u16 = 9000;

/// Mirrors the `RuntimeStatus` discriminated union in `src/lib/tauri.ts`.
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
#[allow(dead_code)] // `Error` is part of the DTO contract; frontend constructs it from Err returns.
pub enum RuntimeStatusDto {
    Uninitialized,
    Starting { message: String },
    Ready {
        vm_name: String,
        image: String,
        agent_ws_port: u16,
    },
    Error { message: String },
}

/// Progress events streamed during [`start_runtime`].
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

    if container_state.server_running {
        return Ok(RuntimeStatusDto::Ready {
            vm_name: lima::VM_NAME.to_string(),
            image: container::ROS_IMAGE.to_string(),
            agent_ws_port: AGENT_WS_PORT,
        });
    }
    if container_state.running {
        return Ok(RuntimeStatusDto::Starting {
            message: "container up, bootstrapping agent...".to_string(),
        });
    }
    if lima_state.vm_running {
        return Ok(RuntimeStatusDto::Starting {
            message: "VM up, waiting on container...".to_string(),
        });
    }
    Ok(RuntimeStatusDto::Uninitialized)
}

/// Bring the runtime up end-to-end. Streams progress through `channel`.
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

    stage(channel, "pulling ROS 2 Humble image", 0.35);
    container::pull_image().await.map_err(|e| e.to_string())?;
    state.container.write().await.image_pulled = true;

    stage(channel, "starting ROS container", 0.65);
    let api_key = std::env::var("ANTHROPIC_API_KEY").ok();
    if api_key.is_none() {
        log(
            channel,
            "WARNING: ANTHROPIC_API_KEY is not set on the host — chat will error until it is.".into(),
        );
    }
    container::start(workspace_path, REPO_ROOT, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    state.container.write().await.running = true;

    stage(channel, "installing agent in container", 0.85);
    container::bootstrap_agent().await.map_err(|e| e.to_string())?;
    state.container.write().await.agent_installed = true;

    stage(channel, "starting agent WebSocket server", 0.95);
    container::start_server(AGENT_WS_PORT)
        .await
        .map_err(|e| e.to_string())?;
    state.container.write().await.server_running = true;

    stage(channel, "ready", 1.0);
    Ok(RuntimeStatusDto::Ready {
        vm_name: lima::VM_NAME.to_string(),
        image: container::ROS_IMAGE.to_string(),
        agent_ws_port: AGENT_WS_PORT,
    })
}

/// Echoed for now — real chat traffic flows over the WebSocket on
/// `AGENT_WS_PORT`. Kept as a fallback for smoke-testing IPC.
#[tauri::command]
pub async fn send_chat_message(
    prompt: String,
    _state: State<'_, Arc<RuntimeState>>,
) -> Result<String, String> {
    Ok(format!("(echo) {prompt}"))
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
