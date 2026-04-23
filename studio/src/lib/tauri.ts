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

export async function sendChatMessage(prompt: string): Promise<string> {
  if (!IS_TAURI) return "";
  return invoke<string>("send_chat_message", { prompt });
}
