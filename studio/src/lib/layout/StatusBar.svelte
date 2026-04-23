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
      <span class="item green">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Runtime: Connected
      </span>
      {#if port}
        <span class="item dim">Port {port}</span>
      {/if}
      {#if image}
        <span class="item dim">{image}</span>
      {/if}
    {:else if isError}
      <span class="item red">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Runtime: Error — {errorMsg}
      </span>
    {:else if isStarting}
      <span class="item accent">
        <span class="spin">⟳</span>
        Runtime: Starting…
      </span>
    {:else}
      <span class="item dim">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Runtime: Disconnected (Port 11311)
      </span>
    {/if}
  </div>

  <!-- Right side -->
  <div class="right">
    <span class="item dim">ROS 2 Humble</span>
    <span class="item dim">Lima VM</span>
    {#if isReady}
      <span class="item green">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
        Runtime: Connected
      </span>
    {:else}
      <span class="item dim">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" opacity="0.4"><circle cx="12" cy="12" r="10"/></svg>
        Offline
      </span>
    {/if}
    <span class="item dim icon-btn" title="Notifications">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    </span>
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
    padding: 0 10px;
    flex-shrink: 0;
    font-size: 11px;
  }
  .statusbar.ready  { background: #0a1f14; }
  .statusbar.error  { background: #1f0a0a; }
  .statusbar.starting { background: #0a0f1f; }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .item.dim    { color: var(--fg-2); }
  .item.green  { color: var(--green); }
  .item.red    { color: var(--dot-error); }
  .item.accent { color: var(--accent); }

  .icon-btn { cursor: pointer; }
  .icon-btn:hover { color: var(--fg-0); }

  .spin {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
