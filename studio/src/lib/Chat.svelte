<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { AgentClient, type AgentEvent, type AgentClientState } from "./chat";
  import {
    chatMessages,
    chatSessionActive,
    clearChatHistory,
    rightPanelOpen,
    refreshFiles,
    pendingAgentPrompt,
    type ChatMessage,
  } from "./stores/layout";
  import { apiKeyOk, showApiKeyModal } from "./modals/apiKeyState";
  import { apiKeyStatus, fsWriteFile, fsReadFile } from "./tauri";
  import { openFile, activePage } from "./stores/layout";
  import iconUrl from "./brand/icon-dark.svg";
  import nameIconUrl from "./brand/name-icon-white.svg";

  export let port: number;
  export let workspace: string;

  const TOOL_COUNT = 37; // matches roscode.tools.TOOL_DEFINITIONS

  let textarea: HTMLTextAreaElement;

  // ── Chat mode ──────────────────────────────────────────────────────────────
  type ChatMode = "agentic" | "plan" | "chat";
  let chatMode: ChatMode = (() => {
    try { return (localStorage.getItem("rs-chat-mode") as ChatMode) ?? "agentic"; } catch { return "agentic"; }
  })();
  $: try { localStorage.setItem("rs-chat-mode", chatMode); } catch {}

  // Collapsible tool call/result messages
  let toolExpanded: Record<number, boolean> = {};
  function toggleTool(idx: number) { toolExpanded = { ...toolExpanded, [idx]: !toolExpanded[idx] }; }

  // Tracks auto-approved confirms in agentic mode (not added to chatMessages)
  let agenticConfirms: Array<Extract<ChatMessage, { kind: "confirm" }>> = [];

  export function fill(text: string) {
    input = text;
    tick().then(() => {
      if (textarea) {
        autoResize(textarea);
        textarea.focus();
      }
      if (connState === "open" && !$chatSessionActive) {
        submit();
      }
    });
  }

  // React to pendingAgentPrompt set from other pages (e.g. Library)
  $: if ($pendingAgentPrompt !== null) {
    const p = $pendingAgentPrompt;
    pendingAgentPrompt.set(null);
    fill(p);
  }

  let input = "";
  let connState: AgentClientState = "closed";
  let thinking = false;
  let scroller: HTMLDivElement;
  let reasoningExpanded: Record<number, boolean> = {};
  let sessionStartTime: number | null = null;
  let reasoningCollector: string[] = [];

  const shellTools = new Set([
    "workspace_build", "node_spawn", "node_kill", "package_scaffold", "relay_autotune",
  ]);

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
        reasoningCollector.push(ev.text);
        break;
      case "tool_call":
        chatMessages.update((ms) => [...ms, { kind: "tool_call", name: ev.name, args: ev.args }]);
        break;
      case "tool_result": {
        chatMessages.update((ms) => [
          ...ms,
          { kind: "tool_result", name: ev.name, result: ev.result, isError: ev.is_error },
        ]);
        const FILE_TOOLS = new Set(["write_source_file", "package_scaffold", "workspace_build"]);
        if (FILE_TOOLS.has(ev.name) && !ev.is_error) refreshFiles();
        break;
      }
      case "confirm_request": {
        const confirmEntry = {
          kind: "confirm" as const,
          id: ev.id,
          name: ev.name,
          args: ev.args,
          diffPreview: ev.diff_preview,
          resolved: "pending" as const,
        };
        if (chatMode === "agentic") {
          // Auto-approve silently — track separately for end-of-session summary
          agenticConfirms.push({ ...confirmEntry, resolved: "approved" });
          client.respondToConfirm(ev.id, true);
        } else {
          chatMessages.update((ms) => [...ms, confirmEntry]);
        }
        break;
      }
      case "agent_message":
        chatMessages.update((ms) => [...ms, { kind: "agent", text: ev.text }]);
        break;
      case "session_end": {
        chatSessionActive.set(false);
        thinking = false;
        refreshFiles();
        const durationSec = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0;
        sessionStartTime = null;
        chatMessages.update((ms) => [...ms, { kind: "session_complete", durationSec }]);
        // Files modified summary (includes agentic auto-approved)
        const _agenticSnap = [...agenticConfirms];
        agenticConfirms = [];
        chatMessages.update((ms) => {
          const confirmed = [
            ...ms.filter(
              (m): m is Extract<ChatMessage, { kind: "confirm" }> =>
                m.kind === "confirm" && m.name === "write_source_file" && m.resolved === "approved"
            ),
            ..._agenticSnap.filter((m) => m.name === "write_source_file"),
          ];
          if (confirmed.length === 0) return ms;
          const files = confirmed.map((m) => {
            const lines = (m.diffPreview ?? "").split("\n");
            const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
            const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
            const path = String(m.args?.file_path ?? m.args?.path ?? "");
            return { path, name: path.split("/").pop() ?? path, added, removed };
          });
          return [...ms, { kind: "files_summary", files }];
        });
        // Auto-save reasoning
        if (reasoningCollector.length > 0 && workspace) {
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const md = `# Agent Reasoning Log\nDate: ${new Date().toLocaleString()}\nDuration: ${durationSec}s\n\n---\n\n${reasoningCollector.join("\n\n---\n\n")}`;
          fsWriteFile(`${workspace}/.roscode-thoughts-${ts}.md`, md).catch(() => {});
          reasoningCollector = [];
        }
        break;
      }
      case "error":
        chatMessages.update((ms) => [...ms, { kind: "error", text: ev.message }]);
        chatSessionActive.set(false);
        thinking = false;
        sessionStartTime = null;
        break;
    }
    tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  }

  function submit() {
    const text = input.trim();
    if (!text || $chatSessionActive || connState !== "open") return;
    chatMessages.update((ms) => [...ms, { kind: "user", text }]);
    input = "";
    tick().then(() => { if (textarea) autoResize(textarea); });
    chatSessionActive.set(true);
    sessionStartTime = Date.now();
    reasoningCollector = [];
    agenticConfirms = [];

    let promptText = text;
    if (chatMode === "plan") {
      promptText = `[PLAN ONLY — Do NOT execute anything. Output a numbered step-by-step plan of what you would do. No file writes, no shell commands, no tool calls.]\n\n${text}`;
    } else if (chatMode === "chat") {
      promptText = `[CHAT ONLY — Do NOT use any tools. Answer conversationally only.]\n\n${text}`;
    }
    client.sendPrompt({ text: promptText, workspace });
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

  async function openFileFromChat(path: string) {
    if (!path) return;
    try {
      const content = await fsReadFile(path);
      const name = path.split("/").pop() ?? path;
      const ext = name.split(".").pop() ?? "";
      const langMap: Record<string, string> = {
        py: "python", cpp: "cpp", h: "cpp", hpp: "cpp",
        xml: "xml", yaml: "yaml", yml: "yaml", json: "json",
      };
      openFile({ path, name, content, language: langMap[ext] ?? "plaintext", dirty: false });
      activePage.set("files");
    } catch (e) {
      console.error("openFileFromChat failed:", e);
    }
  }

  function renderMarkdown(text: string): string {
    let out = text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Fenced code blocks
    out = out.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const label = lang ? `<span class="code-lang">${lang}</span>` : "";
      return `<div class="code-fence">${label}<pre class="code-pre">${code.trim()}</pre></div>`;
    });
    // Inline formatting
    out = out
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    return out;
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

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function handleInput(e: Event) {
    autoResize(e.currentTarget as HTMLTextAreaElement);
  }

  $: pendingConfirms = $chatMessages.filter(
    (m) => m.kind === "confirm" && (m as any).resolved === "pending"
  ) as Array<ChatMessage & { kind: "confirm" }>;

  function approveAll() {
    for (const m of pendingConfirms) respondConfirm(m, true);
  }
  function rejectAll() {
    for (const m of pendingConfirms) respondConfirm(m, false);
  }
</script>

<div class="chat">
  <div class="agent-head">
    <img src={iconUrl} alt="" class="mark" />
    <div class="title-block">
      <span class="title">roscode agent</span>
      <span class="subtitle">{TOOL_COUNT} tools loaded</span>
    </div>
    <span class="flex"></span>
    <button class="icon-btn" on:click={resetSession} title="Reset agent session (reconnect)" disabled={$chatSessionActive}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 4v4h-4"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 20v-4h4"/></svg>
    </button>
    <button class="icon-btn" on:click={clearChatHistory} title="Clear chat history">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
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
        <div class="msg tool-call" class:destructive={destructive.has(m.name)} class:tc-open={toolExpanded[idx]}>
          <button class="tc-head" on:click={() => toggleTool(idx)}>
            <svg class="tc-chevron" class:open={toolExpanded[idx]} width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
            <span class="tc-icon">{destructive.has(m.name) ? "✎" : "◎"}</span>
            <span class="tc-name">{m.name.replace(/_/g, " ")}</span>
            <span class="tc-hint">{Object.entries(m.args).map(([k,v]) => { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > 40 ? s.slice(0,40)+"…" : s; }).join(" · ").slice(0, 80)}</span>
          </button>
          {#if toolExpanded[idx]}
            <div class="tc-args">
              {#each Object.entries(m.args) as [k, v]}
                <div><span class="k">{k}</span>: {fmtArg(v)}</div>
              {/each}
            </div>
          {/if}
        </div>

      {:else if m.kind === "tool_result"}
        {#if shellTools.has(m.name)}
          <div class="msg tool-terminal" class:t-error={m.isError}>
            <button class="tt-header" on:click={() => toggleTool(idx)}>
              <svg class="tc-chevron" class:open={toolExpanded[idx]} width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
              <span class="tt-prompt">$</span>
              <span class="tt-cmd">{m.name.replace(/_/g, " ")}</span>
              {#if m.isError}<span class="tt-badge tt-err">ERROR</span>{:else}<span class="tt-badge tt-ok">OK</span>{/if}
            </button>
            {#if toolExpanded[idx]}
              <pre class="tt-output">{m.result.length > 2000 ? m.result.slice(0, 2000) + "\n…(truncated)" : m.result}</pre>
            {/if}
          </div>
        {:else}
          <div class="msg tool-result-wrap" class:tr-error={m.isError} class:tr-open={toolExpanded[idx]}>
            <button class="tr-head" on:click={() => toggleTool(idx)}>
              <svg class="tc-chevron" class:open={toolExpanded[idx]} width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
              <span class="tr-status">{m.isError ? "✗" : "✓"}</span>
              <span class="tr-name">{m.name.replace(/_/g, " ")}</span>
              <span class="tr-preview">{m.result.split("\n")[0].slice(0, 70)}{m.result.length > 70 ? "…" : ""}</span>
            </button>
            {#if toolExpanded[idx]}
              <pre class="tr-output">{m.result.length > 1200 ? m.result.slice(0, 1200) + "\n…(truncated)" : m.result}</pre>
            {/if}
          </div>
        {/if}

      {:else if m.kind === "agent"}
        <div class="msg agent">
          <span class="who">&gt; AGENT</span>
          <span class="text-bubble">{@html renderMarkdown(m.text)}</span>
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

      {:else if m.kind === "session_complete"}
        <div class="msg session-complete">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Worked for {m.durationSec}s
        </div>

      {:else if m.kind === "files_summary"}
        <div class="msg files-summary">
          <div class="fs-header">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="fs-label">Files Modified · {m.files.length}</span>
          </div>
          {#each m.files as f}
            <button class="fs-row" on:click={() => openFileFromChat(f.path)} title="Open {f.path}">
              <span class="fs-badge">M+</span>
              <span class="fs-name">{f.name}</span>
              <span class="fs-path">{workspace ? f.path.replace(workspace, "…") : f.path}</span>
              <span class="fs-stats">
                {#if f.added > 0}<span class="fs-add">+{f.added}</span>{/if}
                {#if f.removed > 0}<span class="fs-rem">-{f.removed}</span>{/if}
              </span>
            </button>
          {/each}
        </div>

      {:else if m.kind === "error"}
        <div class="msg error">⚠ {m.text}</div>
      {/if}
    {/each}

    {#if thinking}
      <div class="msg thinking">// thinking…</div>
    {/if}
  </div>

  <!-- Approve-all bar — shown when the agent is waiting for confirmations -->
  {#if pendingConfirms.length > 0}
    <div class="approve-bar">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span class="ab-label">{pendingConfirms.length} change{pendingConfirms.length > 1 ? "s" : ""} pending</span>
      <span style="flex:1"></span>
      <button class="ab-reject" on:click={rejectAll}>Reject all</button>
      <button class="ab-approve" on:click={approveAll}>Accept all</button>
    </div>
  {/if}

  <form class="composer" on:submit|preventDefault={submit}>
    <div class="composer-top">
      <select class="mode-select" title="Execution Mode" bind:value={chatMode}>
        <option value="agentic">Agentic</option>
        <option value="plan">Plan Mode</option>
        <option value="chat">Chat Only</option>
      </select>
      <span class="model-badge" title="Model">CLAUDE OPUS 4.7</span>
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
        on:input={handleInput}
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
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-1);
    flex-shrink: 0;
  }
  .agent-head .mark {
    width: 32px; height: 32px;
    flex-shrink: 0;
    object-fit: contain;
    margin: 0;
  }
  .title-block { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .agent-head .title { color: var(--fg-0); font-size: 13px; font-weight: 600; letter-spacing: -.2px; }
  .agent-head .subtitle { color: var(--fg-2); font-size: 10px; font-family: var(--font-mono); letter-spacing: .3px; }
  .agent-head .flex { flex: 1; }

  .icon-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 5px 7px;
    color: var(--fg-2);
    cursor: pointer;
    display: flex; align-items: center;
    transition: all 150ms;
  }
  .icon-btn:hover { color: var(--fg-0); border-color: var(--border-bright); background: var(--bg-2); }

  .agent-head .pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 999px;
    border: 1px solid var(--border-bright); color: var(--fg-2);
    font-size: 10px; letter-spacing: 0.2px;
    font-family: var(--font-mono);
  }
  .agent-head .pill .d { width: 5px; height: 5px; border-radius: 50%; background: var(--fg-2); }
  .agent-head .pill.live { color: var(--ok); border-color: rgba(108,208,107,0.35); background: rgba(108,208,107,0.08); }
  .agent-head .pill.live .d { background: var(--ok); box-shadow: 0 0 6px var(--ok); }

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
  .empty-chat-icon { width: auto; height: 60px; max-width: 140px; opacity: 0.8; margin-bottom: 12px; filter: drop-shadow(0 4px 12px rgba(242,168,59,.15)); }
  .empty-chat h3 { font-size: 16px; font-weight: 600; color: var(--fg-0); letter-spacing: -0.3px; margin: 0; }
  .empty-chat p { font-size: 12px; color: var(--fg-2); line-height: 1.5; margin: 0 0 8px; }
  .empty-suggestions { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .empty-suggestions button {
    background: var(--bg-2); border: 1px solid var(--border); padding: 10px 14px;
    border-radius: var(--radius); color: var(--fg-1); font-family: var(--font-sans); font-size: 12px;
    cursor: pointer; transition: all 150ms ease; text-align: left;
  }
  .empty-suggestions button:hover { background: var(--bg-3); border-color: var(--accent-line); color: var(--fg-0); transform: translateY(-1px); }

  .scroll {
    flex: 1;
    overflow: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-size: 13px;
    scroll-behavior: smooth;
  }

  .msg {
    flex-shrink: 0;
    line-height: 1.6;
    word-wrap: break-word;
    max-width: 94%;
    animation: slide-up 200ms ease-out;
  }
  @keyframes slide-up { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .msg .who {
    display: block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1px;
    margin-bottom: 4px;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .msg.user {
    align-self: flex-end;
    background: var(--bg-3);
    border: 1px solid var(--border-bright);
    border-radius: 12px 12px 2px 12px;
    padding: 10px 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .msg.user .who { color: var(--accent); }
  .msg.user .text { color: var(--fg-0); font-family: var(--font-sans); }

  .msg.agent {
    align-self: flex-start;
    background: transparent;
    border: none;
    padding: 0;
  }
  .msg.agent .who { color: var(--fg-2); }
  .msg.agent .text-bubble {
    color: var(--fg-1);
    font-family: var(--font-sans);
    display: block;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.03);
    padding: 12px 16px;
    border-radius: 12px;
    line-height: 1.65;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .msg.agent .text-bubble :global(strong) { font-weight: 700; color: var(--fg-0); }
  .msg.agent .text-bubble :global(em) { font-style: italic; color: var(--fg-1); }
  .msg.agent .text-bubble :global(code) {
    font-family: var(--font-mono); font-size: 11.5px;
    background: var(--bg-3); border: 1px solid var(--border);
    padding: 1px 5px; border-radius: 4px; color: var(--accent);
    word-break: break-all;
  }
  .msg.agent .text-bubble :global(.code-fence) {
    margin: 10px 0; border-radius: 6px; overflow: hidden;
    border: 1px solid var(--border);
  }
  .msg.agent .text-bubble :global(.code-lang) {
    display: block; font-family: var(--font-mono); font-size: 9px;
    color: var(--fg-2); padding: 4px 12px; background: var(--bg-3);
    text-transform: uppercase; letter-spacing: 1px;
    border-bottom: 1px solid var(--border);
  }
  .msg.agent .text-bubble :global(.code-pre) {
    display: block; margin: 0; padding: 10px 12px;
    background: #050706; font-family: var(--font-mono); font-size: 11.5px;
    color: #c9d1d9; white-space: pre; overflow-x: auto; line-height: 1.5;
  }

  .msg.status { color: var(--fg-3); font-size: 11px; font-family: var(--font-mono); opacity: 0.8; }
  .msg.step { 
    color: var(--accent); font-size: 9px; text-align: center; 
    letter-spacing: 2px; opacity: 0.5; margin: 8px 0;
    display: flex; align-items: center; gap: 8px;
  }
  .msg.step::before, .msg.step::after { content: ""; flex: 1; height: 1px; background: currentColor; opacity: 0.2; }

  /* Reasoning: collapsible */
  .msg.reasoning-wrap { 
    display: flex; flex-direction: column; gap: 4px; 
    background: rgba(0,0,0,0.15); border-radius: 8px; padding: 4px 8px;
    border: 1px solid rgba(255,255,255,0.02);
  }
  .reasoning-toggle {
    display: flex; align-items: center; gap: 6px;
    background: transparent; border: none; cursor: pointer;
    color: var(--fg-3); font-family: var(--font-mono); font-size: 10px;
    letter-spacing: 0.5px; padding: 4px 0; text-align: left;
  }
  .reasoning-toggle:hover { color: var(--accent); }
  .reasoning-label { font-style: italic; }
  .reasoning-body {
    background: var(--bg-0); border-radius: 4px;
    padding: 10px; font-size: 11px; color: var(--fg-2); line-height: 1.6;
    white-space: pre-wrap; max-height: 300px; overflow: auto;
    font-family: var(--font-mono);
    border-left: 2px solid var(--border);
  }

  /* Tool call — collapsible chip */
  .msg.tool-call {
    background: var(--bg-3);
    border: 1px solid var(--border-bright);
    border-left: 3px solid var(--accent);
    border-radius: 7px;
    overflow: hidden;
  }
  .msg.tool-call.destructive { border-left-color: var(--warn); }
  .tc-head {
    display: flex; align-items: center; gap: 8px;
    width: 100%; background: transparent; border: none;
    padding: 9px 12px; cursor: pointer; text-align: left;
    font-family: var(--font-mono);
  }
  .tc-head:hover { background: rgba(255,255,255,0.05); }
  .tc-chevron { flex-shrink: 0; color: var(--fg-2); transition: transform 140ms; }
  .tc-chevron.open { transform: rotate(90deg); }
  .tc-icon { font-size: 12px; color: var(--accent); flex-shrink: 0; }
  .msg.tool-call.destructive .tc-icon { color: var(--warn); }
  .tc-name { font-size: 12px; font-weight: 600; color: var(--fg-0); flex-shrink: 0; }
  .msg.tool-call.destructive .tc-name { color: var(--warn); }
  .tc-hint { font-size: 10.5px; color: var(--fg-2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tc-args {
    padding: 8px 12px 10px 30px;
    font-family: var(--font-mono); font-size: 11px;
    color: var(--fg-2); line-height: 1.7;
    border-top: 1px solid var(--border);
    background: rgba(0,0,0,0.25);
  }
  .tc-args .k { color: var(--fg-1); }

  /* Tool result (non-shell) — collapsible */
  .msg.tool-result-wrap {
    border: 1px solid var(--border-bright);
    border-left: 3px solid var(--ok);
    border-radius: 7px; overflow: hidden;
    background: var(--bg-3);
  }
  .msg.tool-result-wrap.tr-error { border-left-color: var(--err); }
  .tr-head {
    display: flex; align-items: center; gap: 8px;
    width: 100%; background: transparent; border: none;
    padding: 9px 12px; cursor: pointer; text-align: left;
    font-family: var(--font-mono);
  }
  .tr-head:hover { background: rgba(255,255,255,0.05); }
  .tr-status { font-size: 12px; color: var(--ok); flex-shrink: 0; font-weight: 700; }
  .msg.tool-result-wrap.tr-error .tr-status { color: var(--err); }
  .tr-name { font-size: 12px; color: var(--fg-0); font-weight: 600; flex-shrink: 0; }
  .tr-preview { font-size: 10.5px; color: var(--fg-2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tr-output {
    margin: 0; padding: 10px 12px;
    background: #050706; font-family: var(--font-mono); font-size: 11px;
    color: var(--fg-2); white-space: pre-wrap; max-height: 300px; overflow: auto;
    border-top: 1px solid var(--border);
  }

  /* Confirm / Keep-Discard */
  .msg.confirm {
    background: rgba(242, 200, 75, 0.04);
    border: 1px solid rgba(242, 200, 75, 0.2);
    border-left: 3px solid var(--warn);
    padding: 14px;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }
  .msg.confirm .head { font-weight: 700; color: var(--warn); font-size: 10px; letter-spacing: 1px; margin-bottom: 10px; font-family: var(--font-mono); }

  /* Diff view */
  .diff-view {
    margin: 8px 0 12px;
    background: #030504;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: auto;
    max-height: 300px;
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .diff-line { padding: 2px 10px; white-space: pre; line-height: 1.5; }
  .diff-add { background: rgba(139,195,74,.08); color: #a4d468; }
  .diff-remove { background: rgba(224,102,102,.08); color: #e57373; }
  .diff-hunk { color: #8ab4f8; background: rgba(138,180,248,.05); border-top: 1px solid rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.03); margin: 2px 0; }
  .diff-meta { color: var(--fg-3); opacity: 0.6; }
  .diff-normal { color: var(--fg-2); }

  .msg.confirm .args { color: var(--fg-2); font-size: 11px; line-height: 1.5; font-family: var(--font-mono); }
  .msg.confirm .args .k { color: var(--fg-3); }
  .msg.confirm .actions { display: flex; gap: 8px; margin-top: 12px; }

  .keep-btn {
    flex: 1;
    padding: 8px;
    background: var(--ok);
    border: none;
    color: #0a0d0c;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 120ms;
  }
  .keep-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }

  .discard-btn {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--err);
    color: var(--err);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 120ms;
  }
  .discard-btn:hover { background: rgba(224,102,102,0.1); }

  .resolution {
    margin-top: 10px;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 1px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 4px;
    background: rgba(255,255,255,0.03);
    display: inline-block;
  }
  .resolution[data-r="approved"] { color: var(--ok); border-left: 2px solid var(--ok); }
  .resolution[data-r="denied"] { color: var(--err); border-left: 2px solid var(--err); }
  .msg.confirm[data-resolved="denied"] { opacity: 0.5; filter: grayscale(0.5); }

  .msg.error { 
    color: var(--err); font-family: var(--font-mono); font-size: 12px;
    background: rgba(224,102,102,0.05); border: 1px solid rgba(224,102,102,0.15);
    padding: 12px; border-radius: 8px;
  }

  .msg.thinking { 
    color: var(--accent); font-family: var(--font-mono); font-size: 11px; 
    font-style: italic; opacity: 0.7;
    animation: thinking-pulse 2s ease-in-out infinite; 
  }
  @keyframes thinking-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; color: var(--purple, #a78bfa); } }

  .composer {
    display: flex; flex-direction: column; gap: 8px; padding: 16px;
    border-top: 1px solid var(--border); background: var(--bg-1);
    box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
  }
  .composer-top { display: flex; justify-content: flex-start; align-items: center; gap: 12px; }
  .composer-top select {
    background: var(--bg-2); border: 1px solid var(--border); color: var(--fg-2);
    font-family: var(--font-mono); font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.8px; cursor: pointer; padding: 4px 10px; border-radius: 6px;
    outline: none; transition: all 150ms;
  }
  .composer-top select:hover { border-color: var(--accent-line); color: var(--fg-0); background: var(--bg-3); }
  .model-badge {
    font-family: var(--font-mono); font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.8px; color: var(--accent); padding: 4px 10px;
    border: 1px solid var(--accent-line); border-radius: 6px;
    background: var(--accent-dim); user-select: none;
  }
  .input-wrap { 
    display: flex; gap: 10px; align-items: flex-end; 
    background: var(--bg-0); border: 1px solid var(--border-bright);
    border-radius: 12px; padding: 10px;
    transition: border-color 200ms, box-shadow 200ms;
  }
  .input-wrap:focus-within {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 2px var(--accent-dim);
  }
  .input-wrap .prompt { color: var(--accent); font-family: var(--font-mono); font-size: 16px; padding-bottom: 8px; opacity: 0.6; }
  .input-wrap textarea {
    flex: 1; resize: none; min-height: 24px; max-height: 160px;
    font-family: var(--font-sans); font-size: 13px; background: transparent;
    color: var(--fg-0); border: none; padding: 4px 0;
    outline: none; box-shadow: none; -webkit-appearance: none; appearance: none;
    line-height: 1.5;
  }
  .input-wrap textarea:disabled { opacity: 0.5; }
  .input-wrap button { 
    align-self: flex-end; 
    background: var(--accent); color: #1a1408;
    border: none; border-radius: 8px; padding: 8px 16px;
    font-weight: 700; font-family: var(--font-mono); font-size: 11px;
    cursor: pointer; transition: all 120ms;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  .input-wrap button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
  .input-wrap button:disabled { opacity: 0.3; filter: grayscale(1); cursor: default; }

  /* ── Session complete ── */
  .msg.session-complete {
    align-self: flex-end; display: flex; align-items: center; gap: 5px;
    font-family: var(--font-mono); font-size: 10px; color: var(--fg-3);
    letter-spacing: 0.3px; padding: 4px 0;
  }

  /* ── Files summary ── */
  .msg.files-summary {
    align-self: stretch;
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 10px; overflow: hidden;
  }
  .fs-header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-bottom: 1px solid var(--border);
  }
  .fs-label {
    font-family: var(--font-mono); font-size: 10px; color: var(--fg-2);
    letter-spacing: 1px; text-transform: uppercase;
  }
  .fs-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-bottom: 1px solid var(--border);
    background: transparent; border-left: 2px solid transparent;
    cursor: pointer; width: 100%; text-align: left; border-radius: 0;
    transition: background 80ms;
  }
  .fs-row:last-child { border-bottom: none; }
  .fs-row:hover { background: var(--bg-3); border-left-color: var(--accent); border-color: var(--border); }
  .fs-badge {
    font-family: var(--font-mono); font-size: 9px; font-weight: 700;
    padding: 2px 5px; background: rgba(242,168,59,.12); color: var(--accent);
    border: 1px solid var(--accent-line); border-radius: 3px; flex-shrink: 0;
  }
  .fs-name { font-family: var(--font-mono); font-size: 12px; color: var(--fg-0); flex-shrink: 0; font-weight: 500; }
  .fs-path { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fs-stats { display: flex; gap: 6px; flex-shrink: 0; }
  .fs-add { font-family: var(--font-mono); font-size: 11px; color: var(--ok); }
  .fs-rem { font-family: var(--font-mono); font-size: 11px; color: var(--err); }

  /* ── Terminal tool result ── */
  .msg.tool-terminal {
    background: #050706; border: 1px solid var(--border-bright);
    border-left: 3px solid var(--ok); border-radius: 8px; overflow: hidden;
  }
  .msg.tool-terminal.t-error { border-left-color: var(--err); }
  .tt-header {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 12px;
    background: rgba(255,255,255,0.03);
    width: 100%; border: none; cursor: pointer; text-align: left;
  }
  .tt-header:hover { background: rgba(255,255,255,0.06); }
  .tt-prompt { font-family: var(--font-mono); font-size: 13px; color: var(--ok); }
  .tt-cmd { font-family: var(--font-mono); font-size: 11px; color: var(--fg-1); flex: 1; letter-spacing: 0.3px; }
  .tt-badge { font-family: var(--font-mono); font-size: 9px; padding: 2px 6px; border-radius: 3px; }
  .tt-ok { color: var(--ok); border: 1px solid rgba(139,195,74,.3); }
  .tt-err { color: var(--err); border: 1px solid rgba(224,102,102,.3); }
  .tt-output {
    margin: 0; padding: 10px 14px; font-family: var(--font-mono); font-size: 11px;
    color: var(--fg-2); white-space: pre-wrap; max-height: 320px; overflow: auto;
    line-height: 1.55;
  }

  /* ── Markdown code fences inside agent bubbles ── */
  .msg.agent .text-bubble :global(.code-fence) {
    margin: 10px 0; border-radius: 6px; overflow: hidden;
    border: 1px solid var(--border);
  }
  .msg.agent .text-bubble :global(.code-lang) {
    display: block; font-family: var(--font-mono); font-size: 9px;
    color: var(--fg-2); padding: 4px 12px; background: var(--bg-3);
    text-transform: uppercase; letter-spacing: 1px;
    border-bottom: 1px solid var(--border);
  }
  .msg.agent .text-bubble :global(.code-pre) {
    display: block; margin: 0; padding: 10px 12px;
    background: #050706; font-family: var(--font-mono); font-size: 11.5px;
    color: #c9d1d9; white-space: pre; overflow-x: auto; line-height: 1.5;
  }


  /* ── Approve-all bar ── */
  .approve-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px;
    background: rgba(242,168,59,.06);
    border-top: 1px solid rgba(242,168,59,.2);
    border-bottom: 1px solid rgba(242,168,59,.1);
    flex-shrink: 0; font-size: 11px;
  }
  .approve-bar svg { color: var(--warn); flex-shrink: 0; }
  .ab-label { font-family: var(--font-mono); font-size: 10px; color: var(--warn); letter-spacing: 0.5px; }
  .ab-reject {
    padding: 5px 12px; border-radius: 6px; font-size: 10px; font-weight: 600;
    font-family: var(--font-mono); letter-spacing: 0.5px; cursor: pointer;
    background: transparent; border: 1px solid var(--border-bright); color: var(--fg-2);
  }
  .ab-reject:hover { color: var(--err); border-color: rgba(224,102,102,.4); background: rgba(224,102,102,.05); }
  .ab-approve {
    padding: 5px 14px; border-radius: 6px; font-size: 10px; font-weight: 700;
    font-family: var(--font-mono); letter-spacing: 0.5px; cursor: pointer;
    background: var(--accent); border: none; color: #1a1408;
  }
  .ab-approve:hover { opacity: 0.9; }
</style>
