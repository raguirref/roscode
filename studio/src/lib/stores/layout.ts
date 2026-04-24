import { writable, get } from "svelte/store";

function persist<T>(key: string, init: T) {
  const stored = localStorage.getItem(key);
  const val = stored !== null ? (JSON.parse(stored) as T) : init;
  const store = writable<T>(val);
  store.subscribe((v) => localStorage.setItem(key, JSON.stringify(v)));
  return store;
}

export type ActivityPanel = "home" | "editor" | "graph" | "nodes" | "topics" | "packages" | "terminal" | "chat" | "settings";
export type BottomTab = "terminal" | "chat" | "graph";

export const sidebarWidth = persist("rs-sidebar-width", 260);
export const bottomPanelHeight = persist("rs-bottom-height", 280);
export const activePanel = persist<ActivityPanel>("rs-activity-panel", "packages");
export const activeBottomTab = persist<BottomTab>("rs-bottom-tab", "chat");

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
