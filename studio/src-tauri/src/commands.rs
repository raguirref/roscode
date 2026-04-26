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

// ── File-system helpers ───────────────────────────────────────────────────────

/// Expand `~/…` using $HOME. Returns an absolute PathBuf.
fn expand_home(path: &str) -> std::path::PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return std::path::Path::new(&home).join(rest);
        }
    }
    std::path::PathBuf::from(path)
}

/// Encode bytes as lowercase hex (avoids all shell-quoting issues).
fn hex_encode(s: &str) -> String {
    s.bytes().map(|b| format!("{b:02x}")).collect()
}

#[derive(Debug, Clone, Serialize)]
pub struct FsNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

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
    // First check in-memory state from a completed start_runtime.
    {
        let container_state = state.container.read().await;
        if container_state.server_running {
            return Ok(RuntimeStatusDto::Ready {
                vm_name: lima::VM_NAME.to_string(),
                image: container::ROS_IMAGE.to_string(),
                agent_ws_port: AGENT_WS_PORT,
            });
        }
    }

    // On app restart the in-memory state is reset, so probe port 9000 directly.
    // If the agent WebSocket is already listening (from a previous session or the
    // container startup), we can skip the whole boot sequence and go straight to Ready.
    if tokio::net::TcpStream::connect(("127.0.0.1", AGENT_WS_PORT)).await.is_ok() {
        // Sync in-memory state so future calls and start_runtime know we're live.
        state.lima.write().await.vm_running = true;
        {
            let mut cs = state.container.write().await;
            cs.running = true;
            cs.image_pulled = true;
            cs.agent_installed = true;
            cs.server_running = true;
        }
        return Ok(RuntimeStatusDto::Ready {
            vm_name: lima::VM_NAME.to_string(),
            image: container::ROS_IMAGE.to_string(),
            agent_ws_port: AGENT_WS_PORT,
        });
    }

    let lima_state = state.lima.read().await;
    let container_state = state.container.read().await;
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

// ── Workspace picker ─────────────────────────────────────────────────────────

/// Open the macOS native folder-picker dialog and return the chosen path.
/// Returns `null` if the user cancelled.
///
/// We call `choose folder` directly (NOT via "System Events") so the dialog
/// runs in osascript's own process and doesn't need Accessibility permission.
#[tauri::command]
pub async fn pick_workspace_folder() -> Option<String> {
    let out = tokio::process::Command::new("osascript")
        .args([
            "-e",
            "POSIX path of (choose folder with prompt \"Select your ROS 2 workspace\")",
        ])
        .output()
        .await
        .ok()?;

    if out.status.success() {
        let path = String::from_utf8_lossy(&out.stdout)
            .trim()
            .trim_end_matches('/')
            .to_string();
        if path.is_empty() { None } else { Some(path) }
    } else {
        None // user cancelled or osascript failed
    }
}

// ── File-system commands ──────────────────────────────────────────────────────

/// List one directory level. Returns entries sorted dirs-first, alphabetically.
/// Hidden entries (starting with `.`) are omitted.
#[tauri::command]
pub async fn fs_read_dir(path: String) -> Result<Vec<FsNode>, String> {
    let full = expand_home(&path);
    let rd = std::fs::read_dir(&full)
        .map_err(|e| format!("fs_read_dir({path}): {e}"))?;
    let mut nodes: Vec<FsNode> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                return None;
            }
            Some(FsNode {
                name,
                path: e.path().to_string_lossy().to_string(),
                is_dir: meta.is_dir(),
            })
        })
        .collect();
    nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(nodes)
}

/// Read a UTF-8 text file from the host filesystem.
#[tauri::command]
pub async fn fs_read_file(path: String) -> Result<String, String> {
    let full = expand_home(&path);
    std::fs::read_to_string(&full)
        .map_err(|e| format!("fs_read_file({path}): {e}"))
}

/// Write UTF-8 content to a file on the host filesystem.
#[tauri::command]
pub async fn fs_write_file(path: String, content: String) -> Result<(), String> {
    let full = expand_home(&path);
    std::fs::write(&full, content)
        .map_err(|e| format!("fs_write_file({path}): {e}"))
}

// ── Container filesystem (reads directly from the ROS container) ─────────────

/// List a directory inside the running ROS container at the given path.
/// Path must be absolute (e.g. "/workspace", "/workspace/src/my_pkg").
#[tauri::command]
pub async fn container_read_dir(
    path: String,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<Vec<FsNode>, String> {
    let container_state = state.container.read().await;
    if !container_state.running {
        return Err("runtime not ready".to_string());
    }
    drop(container_state);

    let path_hex = hex_encode(&path);
    let script = format!(
        "python3 -c \"\
import os, json; \
p=bytes.fromhex('{path_hex}').decode(); \
entries=[]; \
[entries.append({{'name':n,'path':os.path.join(p,n),'is_dir':os.path.isdir(os.path.join(p,n))}}) \
 for n in sorted(os.listdir(p)) if not n.startswith('.')]; \
entries.sort(key=lambda x: (not x['is_dir'], x['name'])); \
print(json.dumps(entries))\""
    );

    let out = container::exec(&script)
        .await
        .map_err(|e| e.to_string())?;

    let nodes: Vec<serde_json::Value> =
        serde_json::from_str(out.trim()).map_err(|e| format!("parse error: {e}"))?;

    Ok(nodes
        .into_iter()
        .filter_map(|v| {
            Some(FsNode {
                name: v["name"].as_str()?.to_string(),
                path: v["path"].as_str()?.to_string(),
                is_dir: v["is_dir"].as_bool().unwrap_or(false),
            })
        })
        .collect())
}

/// Write content to a file inside the running ROS container.
#[tauri::command]
pub async fn container_write_file(
    path: String,
    content: String,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<(), String> {
    let container_state = state.container.read().await;
    if !container_state.running {
        return Err("runtime not ready".to_string());
    }
    drop(container_state);

    let path_hex = hex_encode(&path);
    let content_hex = hex_encode(&content);
    let script = format!(
        "python3 -c \"\
p=bytes.fromhex('{path_hex}').decode(); \
c=bytes.fromhex('{content_hex}').decode(); \
open(p,'w').write(c)\""
    );
    container::exec(&script)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Read a file from inside the running ROS container.
#[tauri::command]
pub async fn container_read_file(
    path: String,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<String, String> {
    let container_state = state.container.read().await;
    if !container_state.running {
        return Err("runtime not ready".to_string());
    }
    drop(container_state);

    let path_hex = hex_encode(&path);
    let script = format!(
        "python3 -c \"\
p=bytes.fromhex('{path_hex}').decode(); \
print(open(p).read(),end='')\""
    );

    container::exec(&script).await.map_err(|e| e.to_string())
}

// ── ROS tool execution ────────────────────────────────────────────────────────

// ── API key management ────────────────────────────────────────────────────────

/// Returns true if ANTHROPIC_API_KEY is set (and looks like a valid prefix).
#[tauri::command]
pub async fn api_key_status() -> bool {
    match std::env::var("ANTHROPIC_API_KEY") {
        Ok(v) => v.starts_with("sk-ant-") && v.len() > 20,
        Err(_) => false,
    }
}

/// Persist the API key to the repo's .env file (creating it if needed) and
/// inject it into the current process env so subsequent container starts pick
/// it up. Returns the absolute path of the .env file written.
#[tauri::command]
pub async fn api_key_save(key: String) -> Result<String, String> {
    let key = key.trim().to_string();
    if !key.starts_with("sk-ant-") || key.len() < 20 {
        return Err("That doesn't look like an Anthropic API key (expected sk-ant-…).".into());
    }

    let env_path = std::path::PathBuf::from(REPO_ROOT).join(".env");
    let existing = std::fs::read_to_string(&env_path).unwrap_or_default();

    // Replace or append the line.
    let mut found = false;
    let mut out_lines: Vec<String> = Vec::new();
    for line in existing.lines() {
        if line.trim_start().starts_with("ANTHROPIC_API_KEY=") {
            out_lines.push(format!("ANTHROPIC_API_KEY={key}"));
            found = true;
        } else {
            out_lines.push(line.to_string());
        }
    }
    if !found {
        if !out_lines.is_empty() && !out_lines.last().map(|s| s.is_empty()).unwrap_or(true) {
            out_lines.push(String::new());
        }
        out_lines.push(format!("ANTHROPIC_API_KEY={key}"));
    }
    let mut body = out_lines.join("\n");
    if !body.ends_with('\n') { body.push('\n'); }

    std::fs::write(&env_path, body).map_err(|e| format!("write {}: {e}", env_path.display()))?;

    // Also update the running process so a fresh container start sees it.
    unsafe { std::env::set_var("ANTHROPIC_API_KEY", &key); }

    Ok(env_path.to_string_lossy().into_owned())
}

// ── LAN scan ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct LanHost {
    pub ip: String,
    pub mac: String,
    pub iface: String,
}

/// Run `arp -a` on the host and parse the ARP cache into a list of LAN hosts.
/// This is best-effort: it shows hosts that have recently exchanged ARP traffic
/// with this machine. It is NOT a full subnet scan — but it surfaces real
/// neighbors without needing root or any extra dependency.
#[tauri::command]
pub async fn lan_scan() -> Result<Vec<LanHost>, String> {
    let out = tokio::process::Command::new("arp")
        .arg("-a")
        .output()
        .await
        .map_err(|e| format!("arp failed: {e}"))?;

    if !out.status.success() {
        return Err(format!(
            "arp returned {:?}: {}",
            out.status.code(),
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut hosts: Vec<LanHost> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Lines look like:
    //   ? (192.168.2.30) at 94:2b:68:8:3a:6 on en0 ifscope [ethernet]
    //   hostname.local (192.168.2.10) at 6e:a:ed:dd:fc:e0 on en1 ...
    for line in text.lines() {
        let ip_start = match line.find('(') { Some(i) => i + 1, None => continue };
        let ip_end = match line[ip_start..].find(')') { Some(i) => ip_start + i, None => continue };
        let ip = line[ip_start..ip_end].to_string();

        let after_at = match line.find(" at ") { Some(i) => i + 4, None => continue };
        let mac_end = line[after_at..].find(' ').map(|i| after_at + i).unwrap_or(line.len());
        let mac = line[after_at..mac_end].to_string();

        if mac == "(incomplete)" { continue; }

        let iface = if let Some(on_idx) = line.find(" on ") {
            let s = on_idx + 4;
            let e = line[s..].find(' ').map(|i| s + i).unwrap_or(line.len());
            line[s..e].to_string()
        } else {
            String::new()
        };

        let key = format!("{ip}-{mac}");
        if seen.insert(key) {
            hosts.push(LanHost { ip, mac, iface });
        }
    }

    Ok(hosts)
}

/// Run an arbitrary shell command inside the container and return stdout.
/// Used by the terminal page and any UI that needs raw shell access.
/// Hex-encoded for shell-quoting safety.
#[tauri::command]
pub async fn container_exec(
    cmd: String,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<String, String> {
    let container_state = state.container.read().await;
    if !container_state.running {
        return Err("runtime not ready".to_string());
    }
    drop(container_state);

    let cmd_hex = hex_encode(&cmd);
    // Decode hex inside bash via printf so any special chars survive shell parsing
    let wrapped = format!(
        "eval \"$(printf '%s' '{cmd_hex}' | xxd -r -p)\""
    );
    container::exec(&wrapped).await.map_err(|e| e.to_string())
}

/// Run `ros2 node info <node>` inside the container and return the stdout.
#[tauri::command]
pub async fn ros_node_info(
    node: String,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<String, String> {
    let container_state = state.container.read().await;
    if !container_state.running {
        return Err("runtime not ready".to_string());
    }
    drop(container_state);

    let node_hex = hex_encode(&node);
    let cmd = format!(
        "ros2 node info \"$(python3 -c \"print(bytes.fromhex('{node_hex}').decode())\")\""
    );
    container::exec(&cmd).await.map_err(|e| e.to_string())
}

/// Run a roscode Python tool inside the container and return its stdout.
/// `tool` is the function name (e.g. `"ros_graph"`), `args_json` is a JSON
/// object of keyword arguments (e.g. `"{}"`).
///
/// Both strings are hex-encoded before embedding in the shell command so
/// that shell-quoting is never an issue regardless of content.
#[tauri::command]
pub async fn ros_call_tool(
    tool: String,
    args_json: String,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<String, String> {
    let container_state = state.container.read().await;
    if !container_state.running {
        return Err("runtime not ready".to_string());
    }
    drop(container_state);

    let tool_hex = hex_encode(&tool);
    let args_hex = hex_encode(&args_json);

    // Hex-decode inside Python to avoid ALL shell-quoting edge-cases.
    // set_workspace must be called before any tool that touches the FS.
    let cmd = format!(
        "python3 -c \"\
import json; \
from roscode.tools import TOOL_MAP, set_workspace; \
set_workspace('/workspace'); \
tool=bytes.fromhex('{tool_hex}').decode(); \
args=json.loads(bytes.fromhex('{args_hex}').decode()); \
print(TOOL_MAP[tool](**args))\""
    );

    container::exec(&cmd).await.map_err(|e| e.to_string())
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
