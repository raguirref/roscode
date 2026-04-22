/**
 * WebSocket client for `roscode.server`. Mirrors the JSON protocol documented
 * in `roscode/server.py`. Every frame the server sends becomes a
 * {@link AgentEvent} dispatched to the subscriber.
 */

export type AgentEvent =
  | { type: "banner"; model: string; workspace: string; container_status: string | null }
  | { type: "status"; text: string }
  | { type: "step"; n: number; total: number }
  | { type: "thinking_start"; label: string }
  | { type: "thinking_end" }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string; is_error: boolean }
  | {
      type: "confirm_request";
      id: string;
      name: string;
      args: Record<string, unknown>;
      diff_preview?: string;
    }
  | { type: "agent_message"; text: string }
  | { type: "session_end" }
  | { type: "error"; message: string };

export type AgentClientState = "connecting" | "open" | "closed";

export interface PromptOptions {
  text: string;
  workspace: string;
  model?: string;
  maxIterations?: number;
}

export class AgentClient {
  private ws: WebSocket | null = null;
  private _state: AgentClientState = "closed";
  readonly onEvent: (ev: AgentEvent) => void;
  readonly onStateChange: (s: AgentClientState) => void;

  constructor(
    onEvent: (ev: AgentEvent) => void,
    onStateChange: (s: AgentClientState) => void = () => {},
  ) {
    this.onEvent = onEvent;
    this.onStateChange = onStateChange;
  }

  get state(): AgentClientState {
    return this._state;
  }

  connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this._setState("connecting");
      // 127.0.0.1 rather than "localhost" — Lima's portForwards bind the
      // guest port to the host's IPv4 loopback only, and many browsers
      // resolve "localhost" to IPv6 (::1) first and fail the connection.
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      this.ws = ws;
      ws.onopen = () => {
        this._setState("open");
        resolve();
      };
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as AgentEvent;
          this.onEvent(ev);
        } catch (err) {
          console.error("malformed agent frame", e.data, err);
        }
      };
      ws.onclose = () => this._setState("closed");
      ws.onerror = (e) => {
        console.error("websocket error", e);
        this._setState("closed");
        reject(new Error("websocket error"));
      };
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this._setState("closed");
  }

  sendPrompt(opts: PromptOptions) {
    this._assertOpen();
    this.ws!.send(
      JSON.stringify({
        type: "prompt",
        text: opts.text,
        workspace: opts.workspace,
        model: opts.model,
        max_iterations: opts.maxIterations,
      }),
    );
  }

  respondToConfirm(id: string, approved: boolean) {
    this._assertOpen();
    this.ws!.send(JSON.stringify({ type: "confirm_response", id, approved }));
  }

  private _setState(s: AgentClientState) {
    this._state = s;
    this.onStateChange(s);
  }

  private _assertOpen() {
    if (!this.ws || this._state !== "open") {
      throw new Error("agent client is not connected");
    }
  }
}
