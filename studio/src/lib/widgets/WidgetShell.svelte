<script lang="ts">
  export let title: string;
  export let kind: string;
  export let onRemove: () => void;
  export let badge: string | undefined = undefined;
  export let loading: boolean = false;

  let bodyHeight = 200;
  let resizing = false;
  let startY = 0;
  let startH = 0;

  function onResizerDown(e: MouseEvent) {
    resizing = true;
    startY = e.clientY;
    startH = bodyHeight;
    e.preventDefault();
    e.stopPropagation();
  }

  function onMouseMove(e: MouseEvent) {
    if (!resizing) return;
    bodyHeight = Math.max(80, Math.min(600, startH + (e.clientY - startY)));
  }

  function onMouseUp() { resizing = false; }
</script>

<svelte:window on:mousemove={onMouseMove} on:mouseup={onMouseUp} />

<div class="widget">
  <div class="head">
    <span class="dot" style="background: var(--w-{kind}, var(--accent))" class:pulse={loading}></span>
    <span class="title">{title}</span>
    {#if loading}
      <span class="scanning-badge">SCANNING…</span>
    {:else if badge}
      <span class="badge">{badge}</span>
    {/if}
    <button class="x" on:click={onRemove} aria-label="Remove" title="Remove">×</button>
  </div>
  <div class="body" style="height:{bodyHeight}px">
    {#if loading}
      <div class="loader-line"></div>
    {/if}
    <slot />
  </div>
  <div class="resize-handle" on:mousedown={onResizerDown} class:resizing role="separator" aria-label="Resize widget"></div>
</div>

<style>
  .widget {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    display: flex; flex-direction: column;
    transition: border-color 120ms;
    position: relative;
  }
  .widget:hover { border-color: var(--border-bright); }

  .head {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-1);
    flex-shrink: 0;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 6px currentColor; }
  .dot.pulse { animation: dot-pulse 1s infinite alternate; }
  @keyframes dot-pulse { 0% { opacity: 0.3; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1.2); } }

  .title {
    font-family: var(--font-mono); font-size: 10px;
    letter-spacing: 1.2px; text-transform: uppercase;
    color: var(--fg-1); flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .badge {
    font-family: var(--font-mono); font-size: 9px;
    color: var(--fg-3); padding: 1px 6px;
    border: 1px solid var(--border); border-radius: 999px;
  }
  .scanning-badge {
    font-family: var(--font-mono); font-size: 9px;
    color: var(--accent); padding: 1px 6px;
    border: 1px solid var(--accent-line); border-radius: 999px;
    background: var(--accent-dim);
    animation: blink 1s infinite alternate;
  }
  @keyframes blink { from { opacity: 0.6; } to { opacity: 1; } }

  .x {
    width: 18px; height: 18px; padding: 0; line-height: 1;
    background: transparent; border: 1px solid transparent; border-radius: 4px;
    color: var(--fg-3); font-size: 14px; cursor: pointer;
  }
  .x:hover { color: var(--err); border-color: var(--err); }

  .body { display: flex; flex-direction: column; overflow: auto; position: relative; min-height: 60px; }
  .resize-handle {
    height: 4px; cursor: row-resize; background: transparent;
    border-top: 1px solid var(--border);
    transition: background 120ms;
    flex-shrink: 0;
  }
  .resize-handle:hover, .resize-handle.resizing { background: var(--accent); opacity: 0.5; }

  .loader-line {
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    animation: scan-line 1.5s infinite linear;
    z-index: 10;
  }
  @keyframes scan-line {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  :global(.widget-row) {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px; font-family: var(--font-mono); font-size: 11px;
    color: var(--fg-1); border-bottom: 1px solid var(--bg-3);
  }
  :global(.widget-row:last-child) { border-bottom: none; }
  :global(.widget-row .row-name) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-0); }
  :global(.widget-row .row-sub) { font-size: 9.5px; color: var(--fg-3); flex-shrink: 0; }
  :global(.widget-empty) {
    padding: 14px 12px; font-family: var(--font-mono); font-size: 10.5px;
    color: var(--fg-3); text-align: center; line-height: 1.5;
  }
</style>
