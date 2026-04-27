import { writable, get } from "svelte/store";

const MAX_SCROLLBACK_BYTES = 128 * 1024;

export interface TerminalSession {
  id: string;
  name: string;
  port: number;
  ws: WebSocket | null;
  connected: boolean;
  initialized: boolean;
  scrollback: Uint8Array[];
  scrollbackBytes: number;
  onData: ((d: Uint8Array) => void) | null;
  onDisconnect: (() => void) | null;
  onConnect: (() => void) | null;
}

export const terminalSessions = writable<TerminalSession[]>([]);
export const activeTerminalId = writable<string | null>(null);

let _counter = 0;

export function createTerminalSession(port: number, name?: string): string {
  _counter++;
  const id = `term-${Date.now().toString(36)}-${_counter}`;
  const existing = get(terminalSessions);
  const sessionName = name ?? `Terminal ${existing.length + 1}`;

  const session: TerminalSession = {
    id, name: sessionName, port,
    ws: null, connected: false, initialized: false,
    scrollback: [], scrollbackBytes: 0,
    onData: null, onDisconnect: null, onConnect: null,
  };

  terminalSessions.update(s => [...s, session]);
  activeTerminalId.set(id);
  return id;
}

export function connectSession(id: string) {
  const session = _get(id);
  if (!session) return;
  if (session.ws && session.ws.readyState !== WebSocket.CLOSED && session.ws.readyState !== WebSocket.CLOSING) return;

  const ws = new WebSocket(`ws://127.0.0.1:${session.port}`);
  session.ws = ws;

  ws.onopen = () => {
    session.connected = true;
    session.onConnect?.();
    terminalSessions.update(s => [...s]);
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "terminal_output") {
        const data = new Uint8Array(msg.data);
        _appendScrollback(session, data);
        session.onData?.(data);
      }
    } catch {}
  };

  ws.onclose = () => {
    session.connected = false;
    session.initialized = false;
    session.onDisconnect?.();
    terminalSessions.update(s => [...s]);
  };

  ws.onerror = () => {
    session.connected = false;
    terminalSessions.update(s => [...s]);
  };

  terminalSessions.update(s => [...s]);
}

export function attachView(id: string, handlers: {
  onData: (d: Uint8Array) => void;
  onDisconnect: () => void;
  onConnect: () => void;
}) {
  const session = _get(id);
  if (!session) return;
  session.onData = handlers.onData;
  session.onDisconnect = handlers.onDisconnect;
  session.onConnect = handlers.onConnect;

  // If already connected, fire onConnect immediately so the view can init
  if (session.ws?.readyState === WebSocket.OPEN) {
    handlers.onConnect();
  }
  terminalSessions.update(s => [...s]);
}

export function detachView(id: string) {
  const session = _get(id);
  if (!session) return;
  session.onData = null;
  session.onDisconnect = null;
  session.onConnect = null;
  terminalSessions.update(s => [...s]);
}

export function getScrollback(id: string): Uint8Array[] {
  return _get(id)?.scrollback ?? [];
}

export function markInitialized(id: string) {
  const session = _get(id);
  if (session) {
    session.initialized = true;
    terminalSessions.update(s => [...s]);
  }
}

export function sendInput(id: string, data: string) {
  const session = _get(id);
  if (session?.ws?.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({
      type: "terminal_input",
      data: Array.from(new TextEncoder().encode(data)),
    }));
  }
}

export function resizeSession(id: string, cols: number, rows: number) {
  const session = _get(id);
  if (session?.ws?.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ type: "terminal_resize", cols, rows }));
  }
}

export function openSession(id: string, cols: number, rows: number) {
  const session = _get(id);
  if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) return;
  if (!session.initialized) {
    session.ws.send(JSON.stringify({ type: "terminal_open", cols, rows }));
    session.initialized = true;
    terminalSessions.update(s => [...s]);
  } else {
    resizeSession(id, cols, rows);
  }
}

export function reconnectSession(id: string) {
  const session = _get(id);
  if (!session) return;
  session.ws?.close();
  session.ws = null;
  session.initialized = false;
  connectSession(id);
}

export function closeSession(id: string) {
  const session = _get(id);
  if (session) {
    session.ws?.close();
  }
  terminalSessions.update(s => s.filter(sess => sess.id !== id));
  const remaining = get(terminalSessions);
  activeTerminalId.update(cur => {
    if (cur !== id) return cur;
    return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
  });
}

export function renameSession(id: string, name: string) {
  terminalSessions.update(s => s.map(sess => sess.id === id ? { ...sess, name } : sess));
}

function _get(id: string): TerminalSession | undefined {
  return get(terminalSessions).find(s => s.id === id);
}

function _appendScrollback(session: TerminalSession, data: Uint8Array) {
  session.scrollback.push(data);
  session.scrollbackBytes += data.length;
  while (session.scrollbackBytes > MAX_SCROLLBACK_BYTES && session.scrollback.length > 1) {
    const removed = session.scrollback.shift()!;
    session.scrollbackBytes -= removed.length;
  }
}
