<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { sidebarWidth } from "../stores/layout";

  export let title = "";
  export let visible = true;

  const dispatch = createEventDispatcher<{ resize: number }>();

  let panelEl: HTMLElement;
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  function onMouseDown(e: MouseEvent) {
    isDragging = true;
    startX = e.clientX;
    startWidth = $sidebarWidth;
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const delta = e.clientX - startX;
    const newWidth = Math.max(160, Math.min(500, startWidth + delta));
    sidebarWidth.set(newWidth);
    dispatch("resize", newWidth);
  }

  function onMouseUp() {
    isDragging = false;
  }

  onMount(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  });
</script>

{#if visible}
  <div
    class="side-panel"
    bind:this={panelEl}
    style="width: {$sidebarWidth}px"
  >
    {#if title}
      <div class="panel-title">
        <span>{title}</span>
      </div>
    {/if}
    <div class="panel-content">
      <slot />
    </div>
    <div class="resize-handle" on:mousedown={onMouseDown} role="separator" aria-label="Resize panel"></div>
  </div>
{/if}

<style>
  .side-panel {
    position: relative;
    background: var(--bg-1);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
    min-width: 160px;
  }

  .panel-title {
    height: var(--pane-title-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--fg-1);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .panel-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    z-index: 20;
  }
  .resize-handle:hover { background: var(--accent); opacity: 0.4; }
</style>
