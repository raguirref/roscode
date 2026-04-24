<script lang="ts">
  import { onMount } from "svelte";
  import type { SvelteComponent } from "svelte";
  import {
    getRuntimeStatus,
    startRuntime,
    type RuntimeStatus,
    type StartupEvent,
  } from "./lib/tauri";
  import { activePanel, activeBottomTab } from "./lib/stores/layout";

  import Splash from "./lib/Splash.svelte";

  // Layout components
  import ActivityBar from "./lib/layout/ActivityBar.svelte";
  import SidePanel from "./lib/layout/SidePanel.svelte";
  import PackageTree from "./lib/layout/PackageTree.svelte";
  import FileTree from "./lib/layout/FileTree.svelte";
  import BottomPanel from "./lib/layout/BottomPanel.svelte";
  import StatusBar from "./lib/layout/StatusBar.svelte";

  // Editor
  import MonacoEditor from "./lib/editor/MonacoEditor.svelte";

  // ── Runtime state ──
  let status: RuntimeStatus = { kind: "uninitialized" };
  let booting = false;
  let stageLabel = "";
  let stagePercent = 0;
  let logLines: string[] = [];
  let workspacePath = "";
  let splashDone = false;

  // Forwarded from BottomPanel so Packages can fill chat
  let chatRef: (SvelteComponent & { fill: (text: string) => void }) | undefined;

  onMount(async () => {
    workspacePath = `${
      (window as any).__ROSCODE_HOME__ ?? "/Users/rickyaguirre"
    }/development/roscode/demos/demo_drift/workspace`;
    // Hold splash for at least 1.6s so the animation completes nicely
    const [s] = await Promise.all([
      getRuntimeStatus().catch(() => ({ kind: "uninitialized" }) as RuntimeStatus),
      new Promise((r) => setTimeout(r, 1600)),
    ]);
    status = s as RuntimeStatus;
    splashDone = true;
  });

  async function boot() {
    booting = true;
    logLines = [];
    stageLabel = "";
    stagePercent = 0;
    try {
      status = await startRuntime(workspacePath, handleEvent);
    } catch (e) {
      status = { kind: "error", message: String(e) };
    } finally {
      booting = false;
    }
  }

  function handleEvent(ev: StartupEvent) {
    switch (ev.event) {
      case "stage":  stageLabel = ev.label; stagePercent = ev.percent; break;
      case "log":    logLines = [...logLines, ev.line].slice(-30); break;
      case "done":   status = ev.status; break;
      case "failed": status = { kind: "error", message: ev.message }; break;
    }
  }

  function handleNodeSelect(e: CustomEvent) {
    activeBottomTab.set("chat");
    chatRef?.fill(e.detail.prompt);
  }

  $: statusImage = status.kind === "ready" ? status.image : "";
</script>

<Splash done={splashDone} />

<div class="ide-root">
  <!-- ══ HEADER ══ -->
  <header class="ide-header">
    <div class="brand">
      <svg class="brand-mark" width="22" height="22" viewBox="0 0 32 32" fill="none">
        <rect x="4" y="4" width="24" height="24" rx="4" stroke="#f2a83b" stroke-width="1.5"/>
        <circle cx="16" cy="16" r="3.5" fill="#f2a83b"/>
        <path d="M16 8v-3M16 27v-3M8 16h-3M27 16h-3" stroke="#f2a83b" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span class="brand-name">ROSCODE<span class="brand-sep">/</span>STUDIO</span>
    </div>

    <button class="cmd-btn" title="Command Palette (⌘K)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="4" y="5" width="16" height="14" rx="2"/>
        <line x1="8" y1="10" x2="16" y2="10"/>
        <line x1="8" y1="14" x2="12" y2="14"/>
      </svg>
      <span>⌘K</span>
    </button>

    <div class="status-pill" data-kind={status.kind}>
      <span class="dot"></span>
      <span class="status-label">
        {#if status.kind === "uninitialized"}RUNTIME · OFFLINE
        {:else if status.kind === "starting"}STARTING…
        {:else if status.kind === "ready"}{(statusImage || "READY").toUpperCase()}
        {:else if status.kind === "error"}ERROR
        {/if}
      </span>
    </div>

    <!-- spacer so the start button floats right -->
    <div class="header-spacer"></div>

    {#if status.kind !== "ready"}
      <button class="start-btn" on:click={boot} disabled={booting || !workspacePath}>
        {#if booting}
          <span class="spinner"></span> STARTING…
        {:else}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          START
        {/if}
      </button>
    {:else}
      <span class="ready-badge">■ LIVE</span>
    {/if}
  </header>

  <!-- ══ BOOT PROGRESS ══ -->
  {#if booting || status.kind === "starting"}
    <div class="progress-wrap">
      <div class="progress-fill" style="width:{Math.round(stagePercent * 100)}%"></div>
    </div>
    <div class="progress-info">
      <span>{stageLabel || "initializing…"}</span>
      <span class="pct">{Math.round(stagePercent * 100)}%</span>
    </div>
    {#if logLines.length}
      <pre class="boot-log">{logLines.join("\n")}</pre>
    {/if}
  {/if}

  <!-- ══ IDE SHELL ══ -->
  <div class="ide-shell">
    <!-- Activity Bar (far left icon strip) -->
    <ActivityBar />

    <!-- Side Panel (resizable) -->
    <SidePanel>
      {#if $activePanel === "packages"}
        <PackageTree on:nodeselect={handleNodeSelect} />
      {:else if $activePanel === "editor"}
        <FileTree {workspacePath} />
      {:else if $activePanel === "chat"}
        <div class="panel-hint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>Chat is in the bottom panel</p>
        </div>
      {:else if $activePanel === "graph"}
        <div class="panel-hint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.5">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <p>ROS Graph is in the bottom panel</p>
        </div>
      {:else}
        <div class="panel-hint">
          <p>Settings — coming soon</p>
        </div>
      {/if}
    </SidePanel>

    <!-- Main area: Editor top + Bottom panel -->
    <div class="main-area">
      <div class="editor-area">
        <MonacoEditor />
      </div>
      <BottomPanel {status} {workspacePath} bind:chatRef />
    </div>
  </div>

  <!-- ══ STATUS BAR ══ -->
  <StatusBar {status} />
</div>

<style>
  .ide-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--bg-0);
  }

  /* ── Header ── */
  .ide-header {
    height: var(--header-height);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    position: relative;
    -webkit-app-region: drag;
  }
  .ide-header > * { -webkit-app-region: no-drag; }

  .ide-header::after {
    content: "";
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, var(--accent) 0%, transparent 35%);
    opacity: 0.35;
  }

  .brand { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .brand-mark { flex-shrink: 0; }
  .brand-name {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: var(--fg-0);
    text-transform: uppercase;
  }
  .brand-sep { color: var(--accent); }

  .cmd-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--fg-2);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    cursor: pointer;
    transition: border-color 120ms, color 120ms;
  }
  .cmd-btn:hover { border-color: var(--accent); color: var(--fg-0); }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--radius);
    border: 1px solid var(--border-bright);
    background: transparent;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--fg-1);
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }
  .dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--fg-2);
    flex-shrink: 0;
  }
  .status-pill[data-kind="ready"]    { border-color: rgba(139,195,74,0.38); color: var(--ok); background: rgba(139,195,74,0.08); }
  .status-pill[data-kind="ready"] .dot    { background: var(--ok); box-shadow: 0 0 6px var(--ok); animation: pulse 2s ease-in-out infinite; }
  .status-pill[data-kind="starting"] { border-color: var(--accent-line); color: var(--accent); background: var(--accent-dim); }
  .status-pill[data-kind="starting"] .dot { background: var(--accent); animation: pulse 1s ease-in-out infinite; }
  .status-pill[data-kind="error"]    { border-color: rgba(224,102,102,0.35); color: var(--err); background: rgba(224,102,102,0.08); }
  .status-pill[data-kind="error"] .dot    { background: var(--err); }
  .status-pill[data-kind="uninitialized"] .dot { background: var(--warn); }

  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .header-spacer { flex: 1; }

  .start-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    background: var(--accent);
    color: #1a1408;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    cursor: pointer;
    transition: opacity 120ms, transform 120ms;
  }
  .start-btn:hover { opacity: 0.9; transform: translateY(-1px); background: var(--accent); color: #1a1408; border: 1px solid var(--accent); }
  .start-btn:disabled { opacity: 0.35; cursor: default; transform: none; pointer-events: none; }

  .ready-badge {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ok);
    letter-spacing: 1px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .spinner {
    display: inline-block;
    width: 10px; height: 10px;
    border: 2px solid rgba(8,11,15,0.4);
    border-top-color: var(--bg-0);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Boot progress */
  .progress-wrap {
    height: 2px;
    background: var(--bg-2);
    flex-shrink: 0;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--purple));
    transition: width 300ms ease;
  }
  .progress-info {
    display: flex;
    justify-content: space-between;
    padding: 4px 14px;
    font-size: 11px;
    color: var(--fg-2);
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .pct { color: var(--accent); font-weight: 600; }
  .boot-log {
    max-height: 120px;
    overflow-y: auto;
    padding: 6px 14px;
    font-family: 'JetBrains Mono', 'Fira Code', Menlo, monospace;
    font-size: 11px;
    color: var(--fg-1);
    background: var(--bg-0);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    line-height: 1.5;
  }

  /* IDE Shell */
  .ide-shell {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  /* Main area (editor + bottom panel stacked) */
  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .editor-area {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  /* Side panel hint */
  .panel-hint {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--fg-2);
    font-size: 12px;
    padding: 20px;
    text-align: center;
  }
</style>
