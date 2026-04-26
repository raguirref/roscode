<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { AgentClient, type AgentEvent, type AgentClientState } from "./chat";
  import {
    chatMessages,
    chatSessionActive,
    clearChatHistory,
    rightPanelOpen,
    type ChatMessage,
  } from "./stores/layout";
  import { apiKeyOk, showApiKeyModal } from "./modals/apiKeyState";
  import { apiKeyStatus } from "./tauri";
  import iconUrl from "./brand/icon.svg";

  export let port: number;
  export let workspace: string;

  const TOOL_COUNT = 37; // matches roscode.tools.TOOL_DEFINITIONS

  let textarea: HTMLTextAreaElement;

  export function fill(text: string) {
    input = text;
    tick().then(() => textarea?.focus());
  }

  let input = "";
  let connState: AgentClientState = "closed";
  let thinking = false;
  let scroller: HTMLDivElement;
  let reasoningExpanded: Record<number, boolean> = {};

  let client: AgentClient;

  async function refreshApiKey() {
    try {
      const ok = await apiKeyStatus();
      apiKeyOk.set(ok);
    } catch {
      apiKeyOk.set(false);
    }
  }

  onMount(async () => {
    refreshApiKey();
    client = new AgentClient(handleEvent, (s) => (connState = s));
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
    const attempts = 8;
    for (let i = 1; i <= attempts; i++) {
      try {
        await client.connect(port);
        return;
      } catch (e) {
        if (i === attempts) {
          chatMessages.update((ms) => [
            ...ms,
            {
              kind: "error",
              text: `could not connect to ws://127.0.0.1:${port} after ${attempts} tries: ${e}`,
            },
          ]);
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
        break;
      case "status":
        chatMessages.update((ms) => [...ms, { kind: "status", text: ev.text }]);
        break;
      case "step":
        chatMessages.update((ms) => [...ms, { kind: "step", n: ev.n, total: ev.total }]);
        break;
      case "thinking_start":
        thinking = true;
        break;
      case "thinking_end":
        thinking = false;
        break;
      case "reasoning":
        chatMessages.update((ms) => [...ms, { kind: "reasoning", text: ev.text }]);
        break;
      case "tool_call":
        chatMessages.update((ms) => [...ms, { kind: "tool_call", name: ev.name, args: ev.args }]);
        break;
      case "tool_result":
        chatMessages.update((ms) => [
          ...ms,
          { kind: "tool_result", name: ev.name, result: ev.result, isError: ev.is_error },
        ]);
        break;
      case "confirm_request":
        chatMessages.update((ms) => [
          ...ms,
          {
            kind: "confirm",
            id: ev.id,
            name: ev.name,
            args: ev.args,
            diffPreview: ev.diff_preview,
            resolved: "pending",
          },
        ]);
        break;
      case "agent_message":
        chatMessages.update((ms) => [...ms, { kind: "agent", text: ev.text }]);
        break;
      case "session_end":
        chatSessionActive.set(false);
        thinking = false;
        break;
      case "error":
        chatMessages.update((ms) => [...ms, { kind: "error", text: ev.message }]);
        chatSessionActive.set(false);
        thinking = false;
        break;
    }
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  }

  function submit() {
    const text = input.trim();
    if (!text || $chatSessionActive || connState !== "open") return;
    chatMessages.update((ms) => [...ms, { kind: "user", text }]);
    input = "";
    chatSessionActive.set(true);
    client.sendPrompt({ text, workspace });
  }

  async function resetSession() {
    // Force-close the WebSocket and reconnect. Useful when the agent gets
    // wedged on a Python error mid-loop and the session_active flag stays true.
    chatSessionActive.set(false);
    thinking = false;
    try { client?.disconnect(); } catch {}
    await new Promise((r) => setTimeout(r, 200));
    try {
      client = new AgentClient(handleEvent, (s) => (connState = s));
      await client.connect(port);
    } catch (e) {
      chatMessages.update((ms) => [...ms, { kind: "error", text: `reconnect failed: ${e}` }]);
    }
  }

  function respondConfirm(msg: ChatMessage & { kind: "confirm" }, approved: boolean) {
    client.respondToConfirm(msg.id, approved);
    chatMessages.update((ms) =>
      ms.map((m) => (m === msg ? { ...msg, resolved: approved ? "approved" : "denied" } : m))
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

  const fileOps = new Set(["write_source_file"]);

  function fmtArg(value: unknown): string {
    if (typeof value === "string" && (value.includes("\n") || value.length > 80)) {
      const firstLine = value.split("\n")[0];
      const preview = firstLine.length <= 60 ? firstLine : firstLine.slice(0, 60) + "…";
      const n = value.split("\n").length;
      return `<${value.length} chars, ${n} lines> "${preview}"`;
    }
    return JSON.stringify(value);
  }

  function parseDiffLine(line: string): "add" | "remove" | "hunk" | "meta" | "normal" {
    if (line.startsWith("+") && !line.startsWith("+++")) return "add";
    if (line.startsWith("-") && !line.startsWith("---")) return "remove";
    if (line.startsWith("@@")) return "hunk";
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) return "meta";
    return "normal";
  }

  function toggleReasoning(idx: number) {
    reasoningExpanded = { ...reasoningExpanded, [idx]: !reasoningExpanded[idx] };
  }
</script>

<div class="chat">
  <div class="agent-head">
    <img src={iconUrl} alt="" class="mark" />
    <div class="title-block">
      <span class="title">Agent · Claude</span>
      <span class="subtitle">{TOOL_COUNT} tools loaded</span>
    </div>
    <span class="flex"></span>
    <button class="icon-btn" on:click={resetSession} title="Reset agent session (reconnect)" disabled={$chatSessionActive}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 4v4h-4"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 20v-4h4"/></svg>
    </button>
    <button class="icon-btn" title="Chat History">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </button>
    <span class="pill" class:live={connState === "open"}>
      <span class="d"></span>{connState === "open" ? "ready" : "offline"}
    </span>
    <button class="hide-btn" on:click={() => rightPanelOpen.set(false)} title="Hide Agent Panel" aria-label="Hide panel">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="1.5"/><line x1="15" y1="4" x2="15" y2="20"/></svg>
    </button>
  </div>

  <!-- API key warning banner -->
  {#if $apiKeyOk === false}
    <button class="key-banner" on:click={() => showApiKeyModal.set(true)}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="7.5" cy="15.5" r="3.5"/>
        <line x1="10" y1="13" x2="20" y2="3"/>
        <line x1="17" y1="6" x2="20" y2="9"/>
        <line x1="14" y1="9" x2="17" y2="12"/>
      </svg>
      <span>Add your Anthropic API key to use the agent</span>
      <span class="key-cta">Set key →</span>
    </button>
  {/if}

  <div class="scroll" bind:this={scroller}>
    {#if $chatMessages.length === 0 && !thinking && $apiKeyOk !== false}
      <div class="empty-chat">
        <img src={iconUrl} alt="Agent" class="empty-chat-icon" />
        <h3>How can I help you?</h3>
        <p>I can edit files, run shell commands, and interact with the ROS graph.</p>
        <div class="empty-suggestions">
          <button on:click={() => fill('write a node that subscribes to /cmd_vel')}>write a node that subscribes to /cmd_vel</button>
          <button on:click={() => fill('why is the robot drifting left?')}>why is the robot drifting left?</button>
          <button on:click={() => fill('add a launch file for this package')}>add a launch file for this package</button>
        </div>
      </div>
    {/if}
    {#each $chatMessages as m, idx (idx)}
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
        <div class="msg reasoning-wrap">
          <button class="reasoning-toggle" on:click={() => toggleReasoning(idx)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform:{reasoningExpanded[idx] ? 'rotate(90deg)' : 'none'};transition:transform 150ms"><polyline points="9 18 15 12 9 6"/></svg>
            <span class="reasoning-label">// thinking</span>
          </button>
          {#if reasoningExpanded[idx]}
            <div class="reasoning-body">{m.text}</div>
          {/if}
        </div>

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
          <div class="head">
            {fileOps.has(m.name) ? "✎ FILE CHANGE" : "⚠ CONFIRM"} · {m.name}
          </div>
          {#if m.diffPreview}
            <div class="diff-view">
              {#each m.diffPreview.split("\n") as line}
                {@const kind = parseDiffLine(line)}
                <div class="diff-line diff-{kind}">{line}</div>
              {/each}
            </div>
          {/if}
          <div class="args">
            {#each Object.entries(m.args) as [k, v]}
              {#if k !== "content"}
                <div><span class="k">{k}</span>: {fmtArg(v)}</div>
              {/if}
            {/each}
          </div>
          {#if m.resolved === "pending"}
            <div class="actions">
              <button class="keep-btn" on:click={() => respondConfirm(m, true)}>
                {fileOps.has(m.name) ? "KEEP" : "APPROVE"}
              </button>
              <button class="discard-btn" on:click={() => respondConfirm(m, false)}>
                {fileOps.has(m.name) ? "DISCARD" : "DENY"}
              </button>
            </div>
          {:else}
            <div class="resolution" data-r={m.resolved}>
              {m.resolved === "approved" ? "✓ KEPT" : "✗ DISCARDED"}
            </div>
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
    <div class="composer-top">
      <select class="mode-select" title="Execution Mode">
        <option>Agentic Mode</option>
        <option>Plan Mode</option>
        <option>Chat Only</option>
      </select>
      <select class="model-select" title="Model">
        <option>Claude Opus 4.7</option>
        <option>Claude 3.7 Sonnet</option>
      </select>
    </div>
    <div class="input-wrap">
      <span class="prompt">❯</span>
      <textarea
        bind:this={textarea}
        bind:value={input}
        placeholder={connState === "open"
          ? "ask agent — describe the bug, the feature, whatever"
          : `connecting to ws://127.0.0.1:${port}…`}
        disabled={connState !== "open" || $chatSessionActive}
        on:keydown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="submit" disabled={connState !== "open" || $chatSessionActive || !input.trim()}>
        {$chatSessionActive ? "WORKING…" : "SEND"}
      </button>
    </div>
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
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-1);
    flex-shrink: 0;
  }
  .agent-head .mark {
    color: var(--accent);
    width: 24px; height: 24px;
    flex-shrink: 0;
    margin-left: -2px; /* Fix offset to align with edge */
  }

  .hide-btn {
    width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: var(--fg-2); cursor: pointer;
    border-radius: 6px; padding: 0; transition: all 150ms;
    margin-left: 2px;
  }
  .hide-btn:hover { background: var(--bg-2); color: var(--fg-0); }

  /* Empty state */
  .empty-chat {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 30px 20px; text-align: center; gap: 12px; height: 100%;
  }
  .empty-chat-icon { width: 48px; height: 48px; opacity: 0.8; margin-bottom: 8px; filter: drop-shadow(0 4px 12px rgba(242,168,59,.15)); }
  .empty-chat h3 { font-size: 16px; font-weight: 600; color: var(--fg-0); letter-spacing: -0.3px; margin: 0; }
  .empty-chat p { font-size: 12px; color: var(--fg-2); line-height: 1.5; margin: 0 0 8px; }
  .empty-suggestions { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .empty-suggestions button {
    background: var(--bg-2); border: 1px solid var(--border); padding: 10px 14px;
    border-radius: var(--radius); color: var(--fg-1); font-family: var(--font-sans); font-size: 12px;
    cursor: pointer; transition: all 150ms ease; text-align: left;
  }
  .empty-suggestions button:hover { background: var(--bg-3); border-color: var(--accent-line); color: var(--fg-0); transform: translateY(-1px); }

  /* Composer */
  .composer {
    display: flex; flex-direction: column; gap: 8px; padding: 12px;
    border-top: 1px solid var(--border); background: var(--bg-1);
  }
  .composer-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .composer-top select {
    background: transparent; border: none; color: var(--fg-2);
    font-family: var(--font-mono); font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.5px; cursor: pointer; padding: 2px 4px; outline: none;
  }
  .composer-top select:hover { color: var(--fg-0); }
  .input-wrap { display: flex; gap: 8px; align-items: stretch; }
  .input-wrap .prompt { color: var(--accent); font-family: var(--font-mono); font-size: 14px; align-self: center; }
  .input-wrap textarea {
    flex: 1; resize: none; min-height: 36px; max-height: 120px;
    font-family: var(--font-mono); font-size: 12px; background: var(--bg-0);
    color: var(--fg-0); border: 1px solid var(--border-bright); border-radius: var(--radius); padding: 7px 10px;
  }
  .input-wrap textarea:disabled { opacity: 0.6; }
  .input-wrap button { align-self: stretch; }
</style>
