<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { AgentClient, type AgentEvent, type AgentClientState } from "./chat";

  export let port: number;
  export let workspace: string;

  let textarea: HTMLTextAreaElement;

  export function fill(text: string) {
    input = text;
    tick().then(() => textarea?.focus());
  }

  type Message =
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

  let messages: Message[] = [];
  let input = "";
  let connState: AgentClientState = "closed";
  let thinking = false;
  let sessionActive = false;
  let scroller: HTMLDivElement;

  let client: AgentClient;

  onMount(async () => {
    client = new AgentClient(handleEvent, (s) => (connState = s));
    // Retry the WebSocket connection a few times: the server spawn is
    // detached and may still be binding when we mount. 8 × 750ms = 6s
    // of patience before giving up.
    const attempts = 8;
    for (let i = 1; i <= attempts; i++) {
      try {
        await client.connect(port);
        return;
      } catch (e) {
        if (i === attempts) {
          messages = [
            ...messages,
            {
              kind: "error",
              text: `could not connect to ws://127.0.0.1:${port} after ${attempts} tries: ${e}`,
            },
          ];
        } else {
          await new Promise((r) => setTimeout(r, 750));
        }
      }
    }
  });

  onDestroy(() => client?.disconnect());

  function handleEvent(ev: AgentEvent) {
    switch (ev.type) {
      case "banner":
        // Header renders this — skip duplication in the chat log.
        break;
      case "status":
        messages = [...messages, { kind: "status", text: ev.text }];
        break;
      case "step":
        messages = [...messages, { kind: "step", n: ev.n, total: ev.total }];
        break;
      case "thinking_start":
        thinking = true;
        break;
      case "thinking_end":
        thinking = false;
        break;
      case "reasoning":
        messages = [...messages, { kind: "reasoning", text: ev.text }];
        break;
      case "tool_call":
        messages = [...messages, { kind: "tool_call", name: ev.name, args: ev.args }];
        break;
      case "tool_result":
        messages = [
          ...messages,
          {
            kind: "tool_result",
            name: ev.name,
            result: ev.result,
            isError: ev.is_error,
          },
        ];
        break;
      case "confirm_request":
        messages = [
          ...messages,
          {
            kind: "confirm",
            id: ev.id,
            name: ev.name,
            args: ev.args,
            diffPreview: ev.diff_preview,
            resolved: "pending",
          },
        ];
        break;
      case "agent_message":
        messages = [...messages, { kind: "agent", text: ev.text }];
        break;
      case "session_end":
        sessionActive = false;
        thinking = false;
        break;
      case "error":
        messages = [...messages, { kind: "error", text: ev.message }];
        sessionActive = false;
        thinking = false;
        break;
    }
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  }

  function submit() {
    const text = input.trim();
    if (!text || sessionActive || connState !== "open") return;
    messages = [...messages, { kind: "user", text }];
    input = "";
    sessionActive = true;
    client.sendPrompt({ text, workspace });
  }

  function respondConfirm(msg: Message & { kind: "confirm" }, approved: boolean) {
    client.respondToConfirm(msg.id, approved);
    messages = messages.map((m) =>
      m === msg ? { ...msg, resolved: approved ? "approved" : "denied" } : m,
    );
  }

  const destructive = new Set([
    "write_source_file",
    "workspace_build",
    "node_spawn",
    "node_kill",
    "param_set",
    "package_scaffold",
  ]);

  function fmtArg(value: unknown): string {
    if (typeof value === "string" && (value.includes("\n") || value.length > 80)) {
      const firstLine = value.split("\n")[0];
      const preview = firstLine.length <= 60 ? firstLine : firstLine.slice(0, 60) + "…";
      const n = value.split("\n").length;
      return `<${value.length} chars, ${n} lines> "${preview}"`;
    }
    return JSON.stringify(value);
  }
</script>

<div class="chat">
  <div class="agent-head">
    <span class="mark">✦</span>
    <span class="title">AGENT · CLAUDE</span>
    <span class="flex"></span>
    <span class="pill" class:live={connState === "open"}>
      <span class="d"></span>{connState === "open" ? "READY" : "OFFLINE"}
    </span>
  </div>

  <div class="scroll" bind:this={scroller}>
    {#each messages as m (m)}
      {#if m.kind === "user"}
        <div class="msg user">
          <span class="who">&gt; USER</span>
          <span class="text">{m.text}</span>
        </div>
      {:else if m.kind === "status"}
        <div class="msg status">▸ {m.text}</div>
      {:else if m.kind === "step"}
        <div class="msg step">─── STEP {m.n}/{m.total} ───</div>
      {:else if m.kind === "reasoning"}
        <div class="msg reasoning">// {m.text}</div>
      {:else if m.kind === "tool_call"}
        <div class="msg tool-call" class:destructive={destructive.has(m.name)}>
          <span class="head">
            {destructive.has(m.name) ? "✎" : "◎"}
            {m.name}
          </span>
          <div class="args">
            {#each Object.entries(m.args) as [k, v]}
              <div><span class="k">{k}</span>: {fmtArg(v)}</div>
            {/each}
          </div>
        </div>
      {:else if m.kind === "tool_result"}
        <pre class="msg tool-result" class:error={m.isError}>
{m.isError ? "✗ " : "✓ "}{m.name}

{m.result.length > 1200 ? m.result.slice(0, 1200) + "\n…(truncated)" : m.result}</pre>
      {:else if m.kind === "agent"}
        <div class="msg agent">
          <span class="who">&gt; AGENT</span>
          <span class="text">{m.text}</span>
        </div>
      {:else if m.kind === "confirm"}
        <div class="msg confirm" data-resolved={m.resolved}>
          <div class="head">⚠ CONFIRM · {m.name}</div>
          {#if m.diffPreview}
            <pre class="diff">{m.diffPreview}</pre>
          {/if}
          <div class="args">
            {#each Object.entries(m.args) as [k, v]}
              <div><span class="k">{k}</span>: {fmtArg(v)}</div>
            {/each}
          </div>
          {#if m.resolved === "pending"}
            <div class="actions">
              <button on:click={() => respondConfirm(m, true)}>APPROVE</button>
              <button class="danger" on:click={() => respondConfirm(m, false)}>DENY</button>
            </div>
          {:else}
            <div class="resolution">{m.resolved.toUpperCase()}</div>
          {/if}
        </div>
      {:else if m.kind === "error"}
        <div class="msg error">⚠ {m.text}</div>
      {/if}
    {/each}
    {#if thinking}
      <div class="msg thinking">// thinking…</div>
    {/if}
  </div>

  <form class="composer" on:submit|preventDefault={submit}>
    <span class="prompt">❯</span>
    <textarea
      bind:this={textarea}
      bind:value={input}
      placeholder={connState === "open"
        ? "ask agent — describe the bug, the feature, whatever"
        : `connecting to ws://127.0.0.1:${port}…`}
      disabled={connState !== "open" || sessionActive}
      on:keydown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    />
    <button type="submit" disabled={connState !== "open" || sessionActive || !input.trim()}>
      {sessionActive ? "WORKING…" : "SEND"}
    </button>
  </form>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg-1);
  }

  .agent-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    background: var(--bg-1);
  }
  .agent-head .mark { color: var(--accent); font-size: 13px; }
  .agent-head .title { color: var(--fg-0); }
  .agent-head .flex { flex: 1; }
  .agent-head .pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 8px; border-radius: var(--radius);
    border: 1px solid var(--border-bright); color: var(--fg-2);
    font-size: 9px; letter-spacing: 0.6px;
  }
  .agent-head .pill .d { width: 5px; height: 5px; border-radius: 50%; background: var(--fg-2); }
  .agent-head .pill.live { color: var(--ok); border-color: rgba(139,195,74,0.35); background: rgba(139,195,74,0.08); }
  .agent-head .pill.live .d { background: var(--ok); box-shadow: 0 0 6px var(--ok); }

  .scroll {
    flex: 1;
    overflow: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 12.5px;
  }

  .msg {
    line-height: 1.5;
    word-wrap: break-word;
    font-family: var(--font-mono);
  }

  .msg .who {
    display: inline-block;
    min-width: 60px;
    margin-right: 8px;
    font-size: 10px;
    letter-spacing: 1px;
    color: var(--fg-2);
  }

  .msg.user {
    align-self: flex-end;
    max-width: 88%;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
  }
  .msg.user .who { color: var(--fg-2); display: block; margin-bottom: 4px; }
  .msg.user .text { color: var(--fg-0); font-family: "Geist", "Inter", system-ui, sans-serif; }

  .msg.status { color: var(--fg-2); font-size: 11px; letter-spacing: 0.5px; }
  .msg.step { color: var(--fg-2); font-size: 10px; text-align: center; letter-spacing: 2px; }
  .msg.reasoning { color: var(--fg-1); font-size: 11px; }

  .msg.tool-call {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-left: 2px solid var(--accent);
    padding: 8px 10px;
    border-radius: var(--radius);
  }
  .msg.tool-call.destructive { border-left-color: var(--warn); }
  .msg.tool-call .head { font-weight: 600; font-size: 11px; letter-spacing: 0.4px; color: var(--accent); text-transform: uppercase; }
  .msg.tool-call.destructive .head { color: var(--warn); }
  .msg.tool-call .args { color: var(--fg-1); font-size: 11px; margin-top: 6px; line-height: 1.6; }
  .msg.tool-call .args .k { color: var(--fg-2); }

  pre.msg.tool-result {
    margin: 0;
    padding: 8px 10px;
    background: #0a0d0c;
    border: 1px solid var(--border);
    border-left-width: 2px;
    border-left-color: var(--ok);
    border-radius: var(--radius);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--fg-1);
    white-space: pre-wrap;
    max-height: 240px;
    overflow: auto;
  }
  pre.msg.tool-result.error { border-left-color: var(--err); color: var(--err); }

  .msg.agent {
    padding: 2px 2px;
  }
  .msg.agent .who { color: var(--accent); display: block; margin-bottom: 4px; }
  .msg.agent .text { color: var(--fg-0); font-family: "Geist", "Inter", system-ui, sans-serif; }

  .msg.confirm {
    background: rgba(242, 200, 75, 0.06);
    border: 1px solid rgba(242, 200, 75, 0.28);
    border-left: 2px solid var(--warn);
    padding: 10px 12px;
    border-radius: var(--radius);
  }
  .msg.confirm .head { font-weight: 600; color: var(--warn); font-size: 11px; letter-spacing: 0.5px; }
  .msg.confirm .diff {
    margin: 8px 0;
    padding: 8px 10px;
    background: #0a0d0c;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--font-mono);
    font-size: 10.5px;
    max-height: 220px;
    overflow: auto;
    white-space: pre;
  }
  .msg.confirm .actions { display: flex; gap: 6px; margin-top: 8px; }
  .msg.confirm .resolution { margin-top: 6px; font-size: 10px; color: var(--fg-2); letter-spacing: 1px; }
  .msg.confirm[data-resolved="denied"] { opacity: 0.55; }

  .msg.error { color: var(--err); }

  .msg.thinking { color: var(--fg-2); animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

  .composer {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--border);
    background: var(--bg-1);
    align-items: stretch;
  }
  .composer .prompt {
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 14px;
    align-self: center;
  }
  .composer textarea {
    flex: 1;
    resize: none;
    min-height: 36px;
    max-height: 120px;
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--bg-0);
    color: var(--fg-0);
    border: 1px solid var(--border-bright);
    border-radius: var(--radius);
    padding: 7px 10px;
  }
  .composer textarea:disabled { opacity: 0.6; }
  .composer button { align-self: stretch; }

  .msg.confirm .actions button { background: transparent; border-color: var(--border-bright); }
  .msg.confirm .actions button:last-child {
    background: var(--err);
    color: #1a0a0a;
    border-color: var(--err);
  }
</style>
