/**
 * Thin wrapper around Tauri's invoke(). Every call from Svelte → Rust
 * goes through here so the boundary is easy to mock in tests and easy
 * to trace when debugging.
 */
import { invoke, Channel } from "@tauri-apps/api/core";

// Outside the Tauri webview (e.g. Vite browser preview), invoke() doesn't
// exist. Return safe stubs so the UI renders without crashing.
const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type RuntimeStatus =
  | { kind: "uninitialized" }
  | { kind: "starting"; message: string }
  | { kind: "ready"; vm_name: string; image: string; agent_ws_port: number }
  | { kind: "error"; message: string };

export type StartupEvent =
  | { event: "stage"; label: string; percent: number }
  | { event: "log"; line: string }
  | { event: "done"; status: RuntimeStatus }
  | { event: "failed"; message: string };

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  if (!IS_TAURI) return { kind: "uninitialized" };
  return invoke<RuntimeStatus>("runtime_status");
}

export async function startRuntime(
  workspacePath: string,
  onEvent: (ev: StartupEvent) => void,
): Promise<RuntimeStatus> {
  if (!IS_TAURI) {
    return new Promise((_, reject) =>
      reject(new Error("Tauri not available — open via the desktop app"))
    );
  }
  const channel = new Channel<StartupEvent>();
  channel.onmessage = onEvent;
  return invoke<RuntimeStatus>("start_runtime", { channel, workspacePath });
}

/** Open a native macOS folder-picker. Returns the path or null if cancelled. */
export async function pickWorkspaceFolder(): Promise<string | null> {
  if (!IS_TAURI) return null;
  return invoke<string | null>("pick_workspace_folder");
}

export async function sendChatMessage(prompt: string): Promise<string> {
  if (!IS_TAURI) return "";
  return invoke<string>("send_chat_message", { prompt });
}

// ── File-system ───────────────────────────────────────────────────────────────

export interface FsNode {
  name: string;
  path: string;
  is_dir: boolean;
}

export async function fsReadDir(path: string): Promise<FsNode[]> {
  if (!IS_TAURI) return [];
  return invoke<FsNode[]>("fs_read_dir", { path });
}

export async function fsReadFile(path: string): Promise<string> {
  if (!IS_TAURI) return "";
  return invoke<string>("fs_read_file", { path });
}

export async function fsWriteFile(path: string, content: string): Promise<void> {
  if (!IS_TAURI) return;
  return invoke<void>("fs_write_file", { path, content });
}

export async function containerReadDir(path: string): Promise<FsNode[]> {
  if (!IS_TAURI) return [];
  return invoke<FsNode[]>("container_read_dir", { path });
}

export async function containerReadFile(path: string): Promise<string> {
  if (!IS_TAURI) return "";
  return invoke<string>("container_read_file", { path });
}

export async function containerWriteFile(path: string, content: string): Promise<void> {
  if (!IS_TAURI) return;
  return invoke<void>("container_write_file", { path, content });
}

export async function fsRemove(path: string): Promise<void> {
  if (!IS_TAURI) return;
  return invoke<void>("fs_remove", { path });
}

export async function fsCreateDir(path: string): Promise<void> {
  if (!IS_TAURI) return;
  return invoke<void>("fs_create_dir", { path });
}

export async function fsRename(oldPath: string, newPath: string): Promise<void> {
  if (!IS_TAURI) return;
  return invoke<void>("fs_rename", { old_path: oldPath, new_path: newPath });
}

export async function containerRemove(path: string): Promise<void> {
  if (!IS_TAURI) return;
  return invoke<void>("container_remove", { path });
}

export async function containerCreateDir(path: string): Promise<void> {
  if (!IS_TAURI) return;
  return invoke<void>("container_create_dir", { path });
}

export async function containerRename(oldPath: string, newPath: string): Promise<void> {
  if (!IS_TAURI) return;
  return invoke<void>("container_rename", { old_path: oldPath, new_path: newPath });
}

// ── ROS tool execution ────────────────────────────────────────────────────────

export async function rosCallTool(
  tool: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  if (!IS_TAURI) throw new Error("Tauri not available");
  return invoke<string>("ros_call_tool", { tool, argsJson: JSON.stringify(args) });
}

export async function rosNodeInfo(node: string): Promise<string> {
  if (!IS_TAURI) throw new Error("Tauri not available");
  return invoke<string>("ros_node_info", { node });
}

/** Run an arbitrary shell command inside the container. Returns stdout. */
export async function containerExec(cmd: string): Promise<string> {
  if (!IS_TAURI) throw new Error("Tauri not available");
  return invoke<string>("container_exec", { cmd });
}

// ── LAN scan ─────────────────────────────────────────────────────────────────

export interface LanHost {
  ip: string;
  mac: string;
  iface: string;
}

/** Read the host's ARP cache to surface visible LAN neighbors. */
export async function lanScan(): Promise<LanHost[]> {
  if (!IS_TAURI) return [];
  return invoke<LanHost[]>("lan_scan");
}

// ── API key management ──────────────────────────────────────────────────────

export async function apiKeyStatus(): Promise<boolean> {
  if (!IS_TAURI) return false;
  return invoke<boolean>("api_key_status");
}

/** Persist an Anthropic API key to .env. Resolves to the .env path. */
export async function apiKeySave(key: string): Promise<string> {
  if (!IS_TAURI) throw new Error("Tauri not available");
  return invoke<string>("api_key_save", { key });
}

/** Parse the text output of `ros2 node info <node>` into structured data. */
export function parseNodeInfo(raw: string): {
  subscribers: { topic: string; type: string }[];
  publishers: { topic: string; type: string }[];
  serviceServers: string[];
} {
  const result = { subscribers: [] as { topic: string; type: string }[], publishers: [] as { topic: string; type: string }[], serviceServers: [] as string[] };
  let section = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "Subscribers:") { section = "sub"; continue; }
    if (trimmed === "Publishers:") { section = "pub"; continue; }
    if (trimmed === "Service Servers:") { section = "srv"; continue; }
    if (trimmed === "Service Clients:" || trimmed === "Action Servers:" || trimmed === "Action Clients:") { section = ""; continue; }
    if (!trimmed) continue;
    const m = trimmed.match(/^(\S+):\s*(.+)$/);
    if (!m) continue;
    if (section === "sub") result.subscribers.push({ topic: m[1], type: m[2] });
    else if (section === "pub") result.publishers.push({ topic: m[1], type: m[2] });
    else if (section === "srv") result.serviceServers.push(m[1]);
  }
  return result;
}

/** Parse the text output of `ros_graph()` into structured data. */
export function parseRosGraph(raw: string): {
  nodes: string[];
  topics: { name: string; type: string }[];
  services: string[];
} {
  const sections: Record<string, string[]> = { NODES: [], TOPICS: [], SERVICES: [] };
  let current = "";
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NODES:")) { current = "NODES"; continue; }
    if (trimmed.startsWith("TOPICS:")) { current = "TOPICS"; continue; }
    if (trimmed.startsWith("SERVICES:")) { current = "SERVICES"; continue; }
    if (trimmed && current) sections[current].push(trimmed);
  }
  const topics = sections.TOPICS.map((t) => {
    const m = t.match(/^(\S+)\s+\[(.+)\]$/);
    return m ? { name: m[1], type: m[2] } : { name: t, type: "unknown" };
  });
  return { nodes: sections.NODES, topics, services: sections.SERVICES };
}
