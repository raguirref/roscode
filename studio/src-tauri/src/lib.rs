//! roscode studio — Tauri 2 backend entry point.
//!
//! The Rust backend owns four concerns:
//!   1. Lifecycle of the embedded Linux VM (via [`lima`]).
//!   2. Lifecycle of the ROS 2 container running inside that VM ([`container`]).
//!   3. The Tauri command surface exposed to the Svelte webview ([`commands`]).
//!   4. A small amount of shared state wrapping both ([`RuntimeState`]).
//!
//! Nothing here talks to Claude directly — the webview sends chat prompts
//! over IPC; this layer forwards them into the roscode Python agent running
//! inside the container and streams the tool-call traffic back.

mod commands;
mod container;
mod lima;

use std::sync::Arc;
use tokio::sync::RwLock;

/// Everything the Rust backend needs to know between commands. Held by Tauri
/// as managed state so every `#[tauri::command]` handler can borrow it.
#[derive(Default)]
pub struct RuntimeState {
    pub lima: RwLock<lima::LimaState>,
    pub container: RwLock<container::ContainerState>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load the repo-root .env so ANTHROPIC_API_KEY is in our process env
    // before we fork into Tauri. Fails silently if missing; the startup
    // flow later logs a warning and still brings the container up.
    let dotenv_path = std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../../.env"));
    let _ = dotenvy::from_path(&dotenv_path);

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,roscode_studio_lib=debug".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(RuntimeState::default()))
        .invoke_handler(tauri::generate_handler![
            commands::runtime_status,
            commands::start_runtime,
            commands::send_chat_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running roscode studio");
}
