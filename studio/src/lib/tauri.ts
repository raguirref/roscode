/**
 * Thin wrapper around Tauri's invoke(). Every call from Svelte → Rust
 * goes through here so the boundary is easy to mock in tests and easy
 * to trace when debugging.
 */
import { invoke, Channel } from "@tauri-apps/api/core";

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
  return invoke<RuntimeStatus>("runtime_status");
}

export async function startRuntime(
  workspacePath: string,
  onEvent: (ev: StartupEvent) => void,
): Promise<RuntimeStatus> {
  const channel = new Channel<StartupEvent>();
  channel.onmessage = onEvent;
  return invoke<RuntimeStatus>("start_runtime", {
    channel,
    workspacePath,
  });
}

export async function sendChatMessage(prompt: string): Promise<string> {
  return invoke<string>("send_chat_message", { prompt });
}
