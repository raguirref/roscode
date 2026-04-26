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
    <span class="item dim">BRANCH · NAV-REWORK</span>
    <span class="item dim">ERR 0 · WRN 0</span>
  </div>

  <!-- Right side -->
  <div class="right">
    <span class="item dim">PY 3.12</span>
    <span class="item dim">UTF-8 · LF</span>
    <span class="item dim">ROS 2 JAZZY</span>
    <span class="item dim">LN 42 · COL 18</span>
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
    padding: 0 12px;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--fg-3);
    z-index: 100;
  }
  .statusbar.ready  { border-top-color: rgba(139,195,74,0.15); }
  .statusbar.error  { border-top-color: rgba(224,102,102,0.25); }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    padding: 2px 4px;
    border-radius: 4px;
    transition: all 120ms;
    cursor: default;
    opacity: 0.8;
  }
  .item:hover { background: rgba(255,255,255,0.03); color: var(--fg-1); opacity: 1; }

  .item.ok     { color: var(--ok); opacity: 1; }
  .item.err    { color: var(--err); opacity: 1; }
  .item.warn   { color: var(--warn); opacity: 1; }
  .item.accent { color: var(--accent); opacity: 1; }

  .spin {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
