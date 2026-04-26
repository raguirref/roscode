<script lang="ts">
  import { onMount } from "svelte";
  import { isRuntimeReady, bottomPanelOpen, runtimeStatus, activePage } from "../stores/layout";
  import Terminal from "../Terminal.svelte";

  function togglePin() {
    bottomPanelOpen.set(true);
    // Switch to another page so we don't have dual terminals
    if ($activePage === "terminal") activePage.set("home");
  }

  $: port = $runtimeStatus.kind === "ready" ? ($runtimeStatus as any).agent_ws_port : 0;
</script>

<div class="page">
  <!-- ── Header ── -->
  <div class="term-header">
    <div>
      <div class="label-sm accent">// SHELL · CONTAINER</div>
      <div class="page-title">terminal</div>
    </div>
    <div style="flex:1"></div>
    <button class="btn-sm" on:click={togglePin} title="Pin to bottom">
      ↑ pin to bottom
    </button>
  </div>

  <!-- ── Real Terminal ── -->
  <div class="term-body">
    {#if $isRuntimeReady}
      <Terminal {port} />
    {:else}
      <div class="offline-msg">
        <div class="spinner-large"></div>
        <p>Waiting for runtime to be ready…</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .page { flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0; background: var(--bg-0); }
  .label-sm { font-family:var(--font-mono); font-size:10px; color:var(--accent); letter-spacing:2px; text-transform:uppercase; }
  .accent { color:var(--accent); }
  .page-title { font-size:18px; font-weight:600; letter-spacing:-.3px; margin-top:2px; }

  .term-header {
    display:flex; align-items:center; gap:12px; padding:14px 18px 12px;
    border-bottom: 1px solid var(--border); flex-shrink:0; background: var(--bg-1);
  }

  .term-body {
    flex:1; overflow:hidden;
    background: #0a0d0c;
    display: flex;
    flex-direction: column;
  }

  .offline-msg {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; color: var(--fg-3); font-family: var(--font-mono); font-size: 13px;
  }

  .spinner-large {
    width: 32px; height: 32px; border: 2px solid var(--border); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .btn-sm { 
    padding:5px 12px; font-size:10px; letter-spacing:.4px; text-transform:uppercase; border-radius:4px;
    background: var(--bg-2); border: 1px solid var(--border); color: var(--fg-2); cursor: pointer;
  }
  .btn-sm:hover { border-color: var(--fg-3); color: var(--fg-0); }
</style>
