import { writable } from "svelte/store";

export type TerminalEntry =
  | { kind: "cmd"; text: string; ts: string }
  | { kind: "out"; text: string; isErr: boolean }
  | { kind: "system"; text: string };

export const terminalEntries = writable<TerminalEntry[]>([
  { kind: "system", text: "roscode container shell — type a command and press ⏎. Try: ros2 node list, ros2 topic list, env | grep ROS" },
]);

export const terminalHistory = writable<string[]>([]);
export const terminalInput = writable<string>("");
