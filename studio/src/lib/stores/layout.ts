import { writable, derived } from "svelte/store";
import type { RuntimeStatus } from "../tauri";

function persist<T>(key: string, init: T) {
  const stored = localStorage.getItem(key);
  const val = stored !== null ? (JSON.parse(stored) as T) : init;
  const store = writable<T>(val);
  store.subscribe((v) => localStorage.setItem(key, JSON.stringify(v)));
  return store;
}

export type ActivePage =
  | "home"
  | "files"
  | "network"
  | "nodes"
  | "topics"
  | "library"
  | "terminal"
  | "settings";

/** Migrate any legacy persisted "newproject" page to "home" so old localStorage doesn't break. */
const _legacyPage = localStorage.getItem("rs-active-page");
if (_legacyPage && _legacyPage.includes("newproject")) {
  localStorage.setItem("rs-active-page", JSON.stringify("home"));
}

// keep old name for components that still reference it
export type ActivityPanel = ActivePage;
export type BottomTab = "terminal" | "chat" | "graph";

export const activePage = persist<ActivePage>("rs-active-page", "home");
export const activePanel = activePage; // alias for backwards compat
export const activeBottomTab = persist<BottomTab>("rs-bottom-tab", "chat");
export const leftPanelOpen = persist<boolean>("rs-left-panel-open", false);

export type ToolKind = "nodes" | "topics" | "params" | "map" | "network";

export interface DroppedTool {
  id: string;
  kind: ToolKind;
}

export const droppedTools = persist<DroppedTool[]>("rs-dropped-tools", []);

export function addToolToPanel(kind: ToolKind) {
  droppedTools.update((tools) => {
    const id = `${kind}-${Date.now().toString(36)}`;
    return [...tools, { id, kind }];
  });
}

export function removeToolFromPanel(id: string) {
  droppedTools.update((tools) => tools.filter((t) => t.id !== id));
}

export function reorderTools(fromIdx: number, toIdx: number) {
  droppedTools.update((tools) => {
    const next = [...tools];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return next;
  });
}

export const sidebarWidth = persist("rs-sidebar-width", 260);
export const bottomPanelHeight = persist("rs-bottom-height", 320);

// ── Resizable panel sizes (px) ────────────────────────────────────────────────
export const leftPanelWidth = persist<number>("rs-left-panel-w", 220);
export const rightPanelWidth = persist<number>("rs-right-panel-w", 340);
export const rightPanelOpen = persist<boolean>("rs-right-open", true);

export interface FileTab {
  path: string;
  name: string;
  language: string;
  content: string;
  dirty: boolean;
}

export const openFiles = writable<FileTab[]>([]);
export const activeFile = writable<string | null>(null);

export function openFile(tab: FileTab) {
  openFiles.update((tabs) => {
    if (tabs.find((t) => t.path === tab.path)) return tabs;
    return [...tabs, tab];
  });
  activeFile.set(tab.path);
}

export function closeFile(path: string) {
  openFiles.update((tabs) => {
    const remaining = tabs.filter((t) => t.path !== path);
    activeFile.update((cur) => {
      if (cur !== path) return cur;
      return remaining.length ? remaining[remaining.length - 1].path : null;
    });
    return remaining;
  });
}

export function updateFileContent(path: string, content: string) {
  openFiles.update((tabs) =>
    tabs.map((t) => (t.path === path ? { ...t, content, dirty: true } : t))
  );
}

export function markFileSaved(path: string) {
  openFiles.update((tabs) =>
    tabs.map((t) => (t.path === path ? { ...t, dirty: false } : t))
  );
}

// ── Chat history (persists across tab switches within a session) ──────────────

export type ChatMessage =
  | { kind: "user"; text: string }
  | { kind: "status"; text: string }
  | { kind: "step"; n: number; total: number }
  | { kind: "reasoning"; text: string }
  | { kind: "tool_call"; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; name: string; result: string; isError: boolean }
  | { kind: "agent"; text: string }
  | { kind: "error"; text: string }
  | {
      kind: "confirm";
      id: string;
      name: string;
      args: Record<string, unknown>;
      diffPreview?: string;
      resolved: "pending" | "approved" | "denied";
    };

export const chatMessages = writable<ChatMessage[]>([]);
export const chatSessionActive = writable<boolean>(false);

export function clearChatHistory() {
  chatMessages.set([]);
  chatSessionActive.set(false);
}

// ── Runtime state ─────────────────────────────────────────────────────────────

export const runtimeStatus = writable<RuntimeStatus>({ kind: "uninitialized" });

export const isRuntimeReady = derived(
  runtimeStatus,
  ($s) => $s.kind === "ready",
);

// ── Workspace ─────────────────────────────────────────────────────────────────

export const workspacePath = writable<string>("");

/** Persistent list of recently opened workspace paths (most-recent first, max 10). */
export const recentWorkspaces = persist<string[]>("rs-recent-ws", []);

// ── Modals / overlays ─────────────────────────────────────────────────────────

export const showNewPackageModal = writable<boolean>(false);
export const showCommandPalette = writable<boolean>(false);
export const bottomPanelOpen = persist<boolean>("rs-bottom-open", false);

export function addRecentWorkspace(path: string) {
  recentWorkspaces.update((list) => {
    const filtered = list.filter((p) => p !== path);
    return [path, ...filtered].slice(0, 10);
  });
}
