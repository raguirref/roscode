<script lang="ts">
  import type { RuntimeStatus } from "../tauri";
  export let status: RuntimeStatus;

  $: isReady = status.kind === "ready";
  $: isError = status.kind === "error";
  $: isStarting = status.kind === "starting";

  $: port = status.kind === "ready" ? status.agent_ws_port : null;
  $: image = status.kind === "ready" ? status.image : null;
  $: errorMsg = status.kind === "error" ? status.message.slice(0, 60) : "";
</script>

<div class="statusbar" class:ready={isReady} class:error={isError} class:starting={isStarting}>
  <!-- Left side -->
  <div class="left">
    {#if isReady}
      <span class="item ok">■ ROS · CONNECTED</span>
      {#if port}
        <span class="item dim">PORT {port}</span>
      {/if}
      {#if image}
        <span class="item dim">{image}</span>
      {/if}
    {:else if isError}
      <span class="item err">■ RUNTIME · ERROR — {errorMsg}</span>
    {:else if isStarting}
      <span class="item accent"><span class="spin">⟳</span> RUNTIME · STARTING…</span>
    {:else}
      <span class="item warn">■ ROS · OFFLINE</span>
      <span class="item dim">PORT 11311</span>
    {/if}
    <span class="item dim">DOMAIN 0</span>
    <span class="item dim">ERR 0 · WRN 0</span>
  </div>

  <!-- Right side -->
  <div class="right">
    <span class="item dim">PY 3.12</span>
    <span class="item dim">UTF-8 · LF</span>
    <span class="item dim">ROS 2 HUMBLE</span>
    <span class="item dim">LIMA VM</span>
    {#if isReady}
      <span class="item ok">● LIVE</span>
    {:else}
      <span class="item dim">○ OFFLINE</span>
    {/if}
  </div>
</div>

<style>
  .statusbar {
    height: var(--statusbar-height);
    background: var(--bg-1);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--fg-2);
  }
  .statusbar.ready  { background: var(--bg-1); border-top-color: rgba(139,195,74,0.25); }
  .statusbar.error  { background: var(--bg-1); border-top-color: rgba(224,102,102,0.35); }
  .statusbar.starting { background: var(--bg-1); border-top-color: var(--accent-line); }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .item.dim    { color: var(--fg-2); }
  .item.ok     { color: var(--ok); }
  .item.err    { color: var(--err); }
  .item.warn   { color: var(--warn); }
  .item.accent { color: var(--accent); }

  .spin {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
