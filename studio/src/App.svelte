<script lang="ts">
  import { onMount } from "svelte";
  import Chat from "./lib/Chat.svelte";
  import RosMap from "./lib/RosMap.svelte";
  import type { SvelteComponent } from "svelte";
  import {
    getRuntimeStatus,
    startRuntime,
    type RuntimeStatus,
    type StartupEvent,
  } from "./lib/tauri";

  let status: RuntimeStatus = { kind: "uninitialized" };
  let booting = false;
  let stageLabel = "";
  let stagePercent = 0;
  let logLines: string[] = [];

  // Default workspace: the demo_drift package that ships with roscode.
  // Post-MVP this becomes user-configurable via a folder picker.
  let workspacePath = "";
  let chatRef: SvelteComponent & { fill: (text: string) => void };

  onMount(async () => {
    // Seed a sensible default for Ricardo's dev machine. Users will pick
    // via a dialog once we add one.
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
      case "stage":
        stageLabel = ev.label;
        stagePercent = ev.percent;
        break;
      case "log":
        logLines = [...logLines, ev.line].slice(-20);
        break;
      case "done":
        status = ev.status;
        break;
      case "failed":
        status = { kind: "error", message: ev.message };
        break;
    }
  }
</script>

<main>
  <header>
    <span class="brand">roscode <em>studio</em></span>
    <span class="status" data-kind={status.kind}>
      {#if status.kind === "uninitialized"}
        ROS runtime not started
      {:else if status.kind === "starting"}
        starting… {status.message}
      {:else if status.kind === "ready"}
        runtime ready · {status.image}
      {:else if status.kind === "error"}
        error: {status.message}
      {/if}
    </span>
    {#if status.kind !== "ready"}
      <button on:click={boot} disabled={booting || !workspacePath}>
        {booting ? "starting…" : "start ROS runtime"}
      </button>
    {/if}
  </header>

  {#if booting || (status.kind === "starting")}
    <section class="progress">
      <div class="bar" style="--p: {Math.round(stagePercent * 100)}%"></div>
      <div class="stage">
        <span class="label">{stageLabel || "…"}</span>
        <span class="pct">{Math.round(stagePercent * 100)}%</span>
      </div>
      {#if logLines.length}
        <pre class="log">{logLines.join("\n")}</pre>
      {/if}
    </section>
  {/if}

  <div class="grid">
    <section class="pane editor">
      <h3>editor</h3>
      <p class="hint">Monaco editor lands day 4.</p>
    </section>

    <section class="pane chat">
      <h3>chat</h3>
      {#if status.kind === "ready"}
        <Chat bind:this={chatRef} port={status.agent_ws_port} workspace={workspacePath} />
      {:else}
        <p class="hint">start the ROS runtime to begin a chat session.</p>
      {/if}
    </section>

    <section class="pane rosmap">
      <h3>ROS graph</h3>
      {#if status.kind === "ready"}
        <RosMap port={status.agent_ws_port} on:nodeclick={(e) => chatRef?.fill(e.detail.prompt)} />
      {:else}
        <p class="hint">start the ROS runtime to view the live graph.</p>
      {/if}
    </section>

    <section class="pane terminal">
      <h3>terminal</h3>
      <p class="hint">xterm.js pty into the container, day 3.</p>
    </section>
  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    font-weight: 600;
    letter-spacing: 0.2px;
  }

  .brand em {
    font-style: normal;
    color: var(--accent);
    margin-left: 2px;
  }

  .status {
    font-size: 12px;
    color: var(--fg-1);
    margin-left: auto;
  }

  .status[data-kind="ready"] {
    color: var(--accent);
  }

  .status[data-kind="error"] {
    color: var(--accent-warm);
  }

  .progress {
    padding: 10px 16px;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
  }

  .progress .bar {
    height: 3px;
    background: var(--bg-2);
    border-radius: 2px;
    overflow: hidden;
    position: relative;
  }

  .progress .bar::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--p, 0%);
    background: var(--accent);
    transition: width 150ms ease;
  }

  .progress .stage {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 12px;
    color: var(--fg-1);
  }

  .progress .pct {
    font-variant-numeric: tabular-nums;
    color: var(--fg-2);
  }

  .progress .log {
    margin: 8px 0 0;
    padding: 8px 10px;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: "SF Mono", Menlo, monospace;
    font-size: 11px;
    color: var(--fg-2);
    max-height: 120px;
    overflow: auto;
    white-space: pre-wrap;
  }

  .grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 1px;
    background: var(--border);
  }

  .pane {
    background: var(--bg-1);
    padding: 14px 18px;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

  .pane.chat {
    padding: 0;
    overflow: hidden;
  }

  .pane.chat h3 {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    margin: 0;
    flex-shrink: 0;
  }

  .pane.chat :global(.chat) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .pane.rosmap {
    padding: 0;
    overflow: hidden;
  }

  .pane.rosmap h3 {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    margin: 0;
    flex-shrink: 0;
  }

  .pane.rosmap :global(.rosmap) {
    flex: 1;
    min-height: 0;
  }

  .pane h3 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--fg-2);
  }

  .hint {
    color: var(--fg-2);
    font-size: 13px;
    margin: 0;
  }
</style>
