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
use tauri::Manager;
use tokio::sync::RwLock;

/// Compile-time path to the repo root (two levels up from src-tauri/).
const REPO_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");

/// Everything the Rust backend needs to know between commands. Held by Tauri
/// as managed state so every `#[tauri::command]` handler can borrow it.
pub struct RuntimeState {
    pub lima: RwLock<lima::LimaState>,
    pub container: RwLock<container::ContainerState>,
    /// PID of the host-side `python -m roscode.server` process, if we spawned it.
    pub host_server_pid: std::sync::Mutex<Option<u32>>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            lima: RwLock::new(lima::LimaState::default()),
            container: RwLock::new(container::ContainerState::default()),
            host_server_pid: std::sync::Mutex::new(None),
        }
    }
}

/// Spawn `python3 -m roscode.server --port 9000` on the host so the agent
/// WebSocket is available without any extra user action.
///
/// Prefers the repo's `.venv` Python (where `roscode` is definitely installed)
/// and falls back to system `python3`. If port 9000 is already taken the
/// server exits immediately — that's fine, the existing process handles it.
async fn spawn_host_server(state: Arc<RuntimeState>) {
    let venv_py = std::path::Path::new(REPO_ROOT).join(".venv/bin/python3");
    let python = if venv_py.exists() {
        venv_py.to_string_lossy().into_owned()
    } else {
        "python3".to_string()
    };

    tracing::info!(%python, "auto-starting host WebSocket server on port 9000");

    match tokio::process::Command::new(&python)
        .args(["-m", "roscode.server", "--port", "9000"])
        .current_dir(REPO_ROOT)
        .spawn()
    {
        Ok(child) => {
            if let Ok(mut guard) = state.host_server_pid.lock() {
                *guard = child.id();
            }
            tracing::info!("host server spawned (pid={:?})", child.id());
        }
        Err(e) => {
            tracing::warn!("could not spawn host server: {e}");
        }
    }
}

/// Kill the host Python server we spawned, if any.
fn kill_host_server(state: &Arc<RuntimeState>) {
    if let Ok(guard) = state.host_server_pid.lock() {
        if let Some(pid) = *guard {
            tracing::info!(%pid, "killing host server on app close");
            let _ = std::process::Command::new("kill")
                .arg(pid.to_string())
                .status();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Augment PATH so limactl/nerdctl are found when launched from Finder
    // (GUI apps on macOS don't inherit the shell PATH).
    if let Ok(current) = std::env::var("PATH") {
        let extra = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin";
        if !current.contains("/opt/homebrew/bin") {
            std::env::set_var("PATH", format!("{extra}:{current}"));
        }
    } else {
        std::env::set_var(
            "PATH",
            "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin",
        );
    }

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
        .setup(|app| {
            let state = app.state::<Arc<RuntimeState>>().inner().clone();
            tauri::async_runtime::spawn(async move {
                spawn_host_server(state).await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.app_handle().state::<Arc<RuntimeState>>();
                kill_host_server(state.inner());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::runtime_status,
            commands::start_runtime,
            commands::send_chat_message,
            commands::pick_workspace_folder,
            commands::fs_read_dir,
            commands::fs_read_file,
            commands::fs_write_file,
            commands::ros_call_tool,
            commands::ros_node_info,
            commands::container_exec,
            commands::container_read_dir,
            commands::container_read_file,
            commands::container_write_file,
            commands::lan_scan,
            commands::api_key_status,
            commands::api_key_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running roscode studio");
}
