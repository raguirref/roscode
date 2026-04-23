<script lang="ts">
  import { onMount } from "svelte";
  import Chat from "./lib/Chat.svelte";
  import RosMap from "./lib/RosMap.svelte";
  import PackageStore from "./lib/PackageStore.svelte";
  import Terminal from "./lib/Terminal.svelte";
  import type { SvelteComponent } from "svelte";
  import {
    getRuntimeStatus,
    startRuntime,
    type RuntimeStatus,
    type StartupEvent,
  } from "./lib/tauri";

  let leftTab: "packages" | "editor" = "packages";
  let status: RuntimeStatus = { kind: "uninitialized" };
  let booting = false;
  let stageLabel = "";
  let stagePercent = 0;
  let logLines: string[] = [];
  let workspacePath = "";
  let chatRef: SvelteComponent & { fill: (text: string) => void };

  onMount(async () => {
    workspacePath = `${
      (window as any).__ROSCODE_HOME__ ?? "/Users/rickyaguirre"
    }/development/roscode/demos/demo_drift/workspace`;
    try {
      status = await getRuntimeStatus();
    } catch (e) {
      status = { kind: "error", message: String(e) };
    }
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
      case "stage": stageLabel = ev.label; stagePercent = ev.percent; break;
      case "log":   logLines = [...logLines, ev.line].slice(-20); break;
      case "done":  status = ev.status; break;
      case "failed": status = { kind: "error", message: ev.message }; break;
    }
  }
</script>

<main>
  <!-- ── Header ── -->
  <header>
    <div class="brand">
      <span class="brand-name">roscode</span>
      <span class="brand-tag">studio</span>
    </div>

    <div class="status-pill" data-kind={status.kind}>
      <span class="dot"></span>
      <span class="label">
        {#if status.kind === "uninitialized"}runtime offline
        {:else if status.kind === "starting"}starting…
        {:else if status.kind === "ready"}{status.image}
        {:else if status.kind === "error"}error
        {/if}
      </span>
    </div>

    <div class="header-right">
      {#if status.kind !== "ready"}
        <button class="boot-btn" on:click={boot} disabled={booting || !workspacePath}>
          {#if booting}
            <span class="spinner"></span> starting…
          {:else}
            ▶ start runtime
          {/if}
        </button>
      {:else}
        <span class="ready-badge">✦ live</span>
      {/if}
    </div>
  </header>

  <!-- ── Boot progress ── -->
  {#if booting || status.kind === "starting"}
    <div class="progress-bar-wrap">
      <div class="progress-fill" style="width: {Math.round(stagePercent * 100)}%"></div>
    </div>
    <div class="progress-info">
      <span>{stageLabel || "initializing…"}</span>
      <span class="pct">{Math.round(stagePercent * 100)}%</span>
    </div>
    {#if logLines.length}
      <pre class="boot-log">{logLines.join("\n")}</pre>
    {/if}
  {/if}

  <!-- ── 2×2 grid ── -->
  <div class="grid">

    <!-- top-left: packages / editor -->
    <section class="pane">
      <div class="pane-header">
        <div class="tab-group">
          <button class="ptab" class:active={leftTab === "packages"} on:click={() => (leftTab = "packages")}>
            ⊞ Packages
          </button>
          <button class="ptab" class:active={leftTab === "editor"} on:click={() => (leftTab = "editor")}>
            ✎ Editor
          </button>
        </div>
      </div>
      <div class="pane-body">
        {#if leftTab === "packages"}
          <PackageStore on:install={(e) => chatRef?.fill(e.detail.prompt)} />
        {:else}
          <div class="empty-state">
            <span class="empty-icon">✎</span>
            <p>Monaco editor — coming soon</p>
          </div>
        {/if}
      </div>
    </section>

    <!-- top-right: chat -->
    <section class="pane">
      <div class="pane-header">
        <span class="pane-title">◈ Agent chat</span>
      </div>
      <div class="pane-body">
        {#if status.kind === "ready"}
          <Chat bind:this={chatRef} port={status.agent_ws_port} workspace={workspacePath} />
        {:else}
          <div class="empty-state">
            <span class="empty-icon">◈</span>
            <p>Start the ROS runtime to talk to the agent</p>
            {#if status.kind !== "starting" && !booting}
              <button class="boot-btn sm" on:click={boot} disabled={booting}>▶ start runtime</button>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <!-- bottom-left: ROS graph -->
    <section class="pane">
      <div class="pane-header">
        <span class="pane-title">⬡ ROS graph</span>
        {#if status.kind === "ready"}<span class="live-dot"></span>{/if}
      </div>
      <div class="pane-body">
        {#if status.kind === "ready"}
          <RosMap port={status.agent_ws_port} on:nodeclick={(e) => chatRef?.fill(e.detail.prompt)} />
        {:else}
          <div class="empty-state">
            <span class="empty-icon">⬡</span>
            <p>Live ROS node graph appears here</p>
          </div>
        {/if}
      </div>
    </section>

    <!-- bottom-right: terminal -->
    <section class="pane">
      <div class="pane-header">
        <span class="pane-title">❯_ Terminal</span>
        {#if status.kind === "ready"}<span class="live-dot"></span>{/if}
      </div>
      <div class="pane-body">
        {#if status.kind === "ready"}
          <Terminal port={status.agent_ws_port} />
        {:else}
          <div class="empty-state">
            <span class="empty-icon">❯_</span>
            <p>Container shell appears here</p>
          </div>
        {/if}
      </div>
    </section>

  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-0);
  }

  /* ── Header ── */
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 44px;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    position: relative;
  }
  header::after {
    content: "";
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, var(--accent) 0%, transparent 40%);
    opacity: 0.4;
  }

  .brand { display: flex; align-items: baseline; gap: 4px; }
  .brand-name {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.3px;
    color: var(--fg-0);
  }
  .brand-tag {
    font-size: 11px;
    font-weight: 500;
    color: var(--accent);
    letter-spacing: 0.5px;
    background: var(--accent-dim);
    border: 1px solid rgba(76, 201, 240, 0.2);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid var(--border-bright);
    background: var(--bg-2);
    font-size: 11px;
    color: var(--fg-2);
    letter-spacing: 0.3px;
  }
  .status-pill .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--fg-2);
    flex-shrink: 0;
  }
  .status-pill[data-kind="ready"] { border-color: rgba(61, 214, 140, 0.3); color: var(--green); }
  .status-pill[data-kind="ready"] .dot { background: var(--green); box-shadow: 0 0 6px var(--green); animation: pulse 2s ease-in-out infinite; }
  .status-pill[data-kind="starting"] { border-color: rgba(76, 201, 240, 0.3); color: var(--accent); }
  .status-pill[data-kind="starting"] .dot { background: var(--accent); animation: pulse 1s ease-in-out infinite; }
  .status-pill[data-kind="error"] { border-color: rgba(245, 158, 11, 0.3); color: var(--accent-warm); }
  .status-pill[data-kind="error"] .dot { background: var(--accent-warm); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .header-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }

  .boot-btn {
    background: var(--accent);
    color: var(--bg-0);
    border: none;
    border-radius: var(--radius-sm);
    padding: 6px 16px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2px;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: opacity 120ms, transform 120ms;
  }
  .boot-btn:hover { opacity: 0.9; transform: translateY(-1px); background: var(--accent); color: var(--bg-0); border-color: transparent; }
  .boot-btn.sm { font-size: 11px; padding: 5px 12px; margin-top: 12px; }

  .ready-badge {
    font-size: 11px;
    color: var(--green);
    letter-spacing: 0.5px;
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

  /* ── Boot progress ── */
  .progress-bar-wrap {
    height: 2px;
    background: var(--bg-2);
    flex-shrink: 0;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--purple));
    transition: width 200ms ease;
  }
  .progress-info {
    display: flex;
    justify-content: space-between;
    padding: 6px 16px 4px;
    font-size: 11px;
    color: var(--fg-1);
    flex-shrink: 0;
    background: var(--bg-1);
  }
  .pct { color: var(--fg-2); font-variant-numeric: tabular-nums; }
  .boot-log {
    margin: 0;
    padding: 8px 16px;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
    font-family: "SF Mono", Menlo, monospace;
    font-size: 10px;
    color: var(--fg-2);
    max-height: 100px;
    overflow: auto;
    white-space: pre-wrap;
    flex-shrink: 0;
  }

  /* ── Grid ── */
  .grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 1px;
    background: var(--border);
  }

  /* ── Pane ── */
  .pane {
    background: var(--bg-1);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .pane-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    height: 36px;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .pane-title {
    font-size: 11px;
    font-weight: 500;
    color: var(--fg-2);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .live-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 5px var(--green);
    animation: pulse 2.5s ease-in-out infinite;
    margin-left: auto;
  }

  .pane-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* pass-through for components that manage their own layout */
  .pane-body :global(.chat),
  .pane-body :global(.rosmap),
  .pane-body :global(.term-wrap),
  .pane-body :global(.store) {
    flex: 1;
    min-height: 0;
  }

  /* ── Tab group (packages/editor) ── */
  .tab-group { display: flex; gap: 2px; align-items: center; }
  .ptab {
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.3px;
    color: var(--fg-2);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color 120ms, background 120ms, border-color 120ms;
  }
  .ptab:hover { color: var(--fg-1); background: var(--bg-2); border-color: transparent; }
  .ptab.active { color: var(--accent); background: var(--accent-dim); border-color: rgba(76,201,240,0.2); }

  /* ── Empty state ── */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--fg-2);
    padding: 24px;
    text-align: center;
  }
  .empty-icon {
    font-size: 28px;
    opacity: 0.2;
    line-height: 1;
  }
  .empty-state p {
    font-size: 12px;
    color: var(--fg-2);
    max-width: 180px;
    line-height: 1.5;
  }
</style>
