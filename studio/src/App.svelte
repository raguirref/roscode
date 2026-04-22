<script lang="ts">
  import { onMount } from "svelte";
  import { getRuntimeStatus, startRuntime, type RuntimeStatus } from "./lib/tauri";

  let status: RuntimeStatus = { kind: "uninitialized" };
  let booting = false;

  onMount(async () => {
    try {
      status = await getRuntimeStatus();
    } catch (e) {
      status = { kind: "error", message: String(e) };
    }
  });

  async function boot() {
    booting = true;
    try {
      status = await startRuntime();
    } catch (e) {
      status = { kind: "error", message: String(e) };
    } finally {
      booting = false;
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
    {#if status.kind === "uninitialized" || status.kind === "error"}
      <button on:click={boot} disabled={booting}>
        {booting ? "starting…" : "start ROS runtime"}
      </button>
    {/if}
  </header>

  <div class="grid">
    <section class="pane editor">
      <h3>editor</h3>
      <p class="hint">Monaco editor lands day 4.</p>
    </section>

    <section class="pane chat">
      <h3>chat</h3>
      <p class="hint">roscode agent chat lands day 3.</p>
    </section>

    <section class="pane foxglove">
      <h3>3D · topics · plots</h3>
      <p class="hint">Foxglove embed lands day 4.</p>
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
