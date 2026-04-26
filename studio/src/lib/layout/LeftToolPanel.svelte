<script lang="ts">
  import {
    droppedTools,
    leftPanelOpen,
    leftPanelWidth,
    addToolToPanel,
    removeToolFromPanel,
    reorderTools,
    type ToolKind,
  } from "../stores/layout";
  import NodesWidget from "../widgets/NodesWidget.svelte";
  import TopicsWidget from "../widgets/TopicsWidget.svelte";
  import ParamsWidget from "../widgets/ParamsWidget.svelte";
  import MapWidget from "../widgets/MapWidget.svelte";
  import NetworkWidget from "../widgets/NetworkWidget.svelte";

  // Available tool kinds the user can pin to the panel
  const PALETTE: { kind: ToolKind; label: string; sub: string; svg: string }[] = [
    {
      kind: "nodes",
      label: "Nodes",
      sub: "live ROS nodes",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
    },
    {
      kind: "topics",
      label: "Topics",
      sub: "live topics + types",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l8 4 8-4"/><path d="M4 12l8 4 8-4"/><path d="M4 17l8 4 8-4"/></svg>`,
    },
    {
      kind: "params",
      label: "Params",
      sub: "node parameters",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M4 12h8M4 18h16"/><circle cx="20" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="6" cy="18" r="2"/></svg>`,
    },
    {
      kind: "map",
      label: "Map",
      sub: "occupancy preview",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v16M15 6v16"/></svg>`,
    },
    {
      kind: "network",
      label: "Network",
      sub: "LAN hosts (arp)",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.2"/><circle cx="12" cy="7" r="2.2"/><circle cx="18" cy="15" r="2.2"/><path d="M7.5 16.5l3-8M13.5 8.5l3 5"/></svg>`,
    },
  ];

  let pickerOpen = false;
  let dragOver = false;
  let draggingIdx: number | null = null;
  let dragHoverIdx: number | null = null;

  // Auto-open the picker when the panel has no widgets so the user
  // immediately sees what they can add.
  $: if ($droppedTools.length === 0) pickerOpen = true;

  function togglePicker() { pickerOpen = !pickerOpen; }
  function closePicker() { pickerOpen = false; }

  function add(kind: ToolKind) {
    addToolToPanel(kind);
    closePicker();
  }

  // ── Drag-and-drop: Palette -> Panel ──
  function onPaletteDragStart(e: DragEvent, kind: ToolKind) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("application/x-roscode-tool", kind);
    e.dataTransfer.effectAllowed = "copy";
  }

  // ── Drag-and-drop: Reorder ──
  function onToolDragStart(e: DragEvent, idx: number) {
    draggingIdx = idx;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-roscode-reorder", String(idx));
    }
  }

  function onToolDragOver(e: DragEvent, idx: number) {
    if (e.dataTransfer?.types.includes("application/x-roscode-reorder")) {
      e.preventDefault();
      dragHoverIdx = idx;
    }
  }

  function onToolDrop(e: DragEvent, toIdx: number) {
    e.preventDefault();
    const fromIdxStr = e.dataTransfer?.getData("application/x-roscode-reorder");
    if (fromIdxStr !== undefined) {
      const fromIdx = parseInt(fromIdxStr, 10);
      if (!isNaN(fromIdx) && fromIdx !== toIdx) {
        reorderTools(fromIdx, toIdx);
      }
    }
    draggingIdx = null;
    dragHoverIdx = null;
  }

  function onPanelDragOver(e: DragEvent) {
    if (e.dataTransfer?.types.includes("application/x-roscode-tool")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      dragOver = true;
    }
  }
  // ... (onPanelDragLeave, onPanelDrop) ...
  function onPanelDragLeave(e: DragEvent) {
    // Only clear if the cursor actually left the panel (not a child)
    const rt = e.relatedTarget as Node | null;
    if (!rt || !(e.currentTarget as Node).contains(rt)) dragOver = false;
  }
  function onPanelDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const kind = e.dataTransfer?.getData("application/x-roscode-tool") as ToolKind | "";
    if (kind && PALETTE.some((p) => p.kind === kind)) {
      addToolToPanel(kind);
      closePicker();
    }
  }

  function widgetFor(kind: ToolKind) {
    switch (kind) {
      case "nodes":   return NodesWidget;
      case "topics":  return TopicsWidget;
      case "params":  return ParamsWidget;
      case "map":     return MapWidget;
      case "network": return NetworkWidget;
    }
  }
</script>

{#if $leftPanelOpen}
  <div
    class="left-panel"
    class:dragover={dragOver}
    role="region"
    aria-label="Tool panel"
    style="width: {$leftPanelWidth}px"
    on:dragover={onPanelDragOver}
    on:dragleave={onPanelDragLeave}
    on:drop={onPanelDrop}
  >
    <!-- Header -->
    <div class="panel-header">
      <span class="header-label">Tools</span>
      <div style="display:flex; gap:6px; align-items:center">
        <button
          class="add-btn"
          class:open={pickerOpen}
          on:click={togglePicker}
          title="Add a tool widget"
          aria-label="Add tool"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
          <span class="add-label">{pickerOpen ? "Close" : "Add"}</span>
        </button>
        <button class="hide-btn" on:click={() => leftPanelOpen.set(false)} title="Hide Sidebar" aria-label="Hide panel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="1.5"/><line x1="9" y1="4" x2="9" y2="20"/></svg>
        </button>
      </div>
    </div>

    <!-- Picker popover (auto-opens when panel is empty) -->
    {#if pickerOpen}
      <div class="picker">
        <div class="picker-hint">Tap a tool to pin it</div>
        <div class="picker-grid">
          {#each PALETTE as p}
            <button
              class="picker-card"
              draggable="true"
              on:dragstart={(e) => onPaletteDragStart(e, p.kind)}
              on:click={() => add(p.kind)}
            >
              <span class="card-icon" style="color: var(--w-{p.kind})">{@html p.svg}</span>
              <span class="card-text">
                <span class="card-label">{p.label}</span>
                <span class="card-sub">{p.sub}</span>
              </span>
              <span class="card-plus">＋</span>
            </button>
          {/each}
        </div>
        <div class="picker-foot">
          <span class="grip-hint">⋮⋮ drag any card into the panel to pin it</span>
        </div>
      </div>
    {/if}

    <!-- Body -->
    <div class="panel-body">
      {#if $droppedTools.length === 0}
        <div class="empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <div class="empty-title">No tools pinned</div>
          <div class="empty-sub">Click "Add" or drag a tool card here to pin it.</div>
        </div>
      {:else}
        <div class="tools-stack">
          {#each $droppedTools as tool, i (tool.id)}
            <div
              class="tool-wrapper"
              class:dragging={draggingIdx === i}
              class:drag-over={dragHoverIdx === i && draggingIdx !== i}
              draggable="true"
              on:dragstart={(e) => onToolDragStart(e, i)}
              on:dragover={(e) => onToolDragOver(e, i)}
              on:drop={(e) => onToolDrop(e, i)}
              on:dragend={() => { draggingIdx = null; dragHoverIdx = null; }}
            >
              <svelte:component this={widgetFor(tool.kind)} id={tool.id} />
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- drop overlay shown while dragging -->
    {#if dragOver}
      <div class="drop-overlay">
        <div class="drop-msg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 5v14M5 12h14"/></svg>
          drop to pin
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .left-panel {
    flex-shrink: 0;
    background: var(--bg-1);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 200px;
    position: relative;
  }

  /* Header */
  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-1);
  }
  .header-label {
    font-family: var(--font-mono); font-size: 10px;
    color: var(--fg-2); letter-spacing: 1.5px; text-transform: uppercase;
  }
  .add-btn {
    height: 26px; padding: 0 10px 0 8px;
    background: var(--accent-dim); border: 1px solid var(--accent-line);
    border-radius: 6px; color: var(--accent);
    display: flex; align-items: center; gap: 5px;
    cursor: pointer;
    font-family: var(--font-sans); font-size: 11px; font-weight: 600;
    transition: all 160ms cubic-bezier(.2,.8,.2,1);
  }
  .add-btn:hover { background: var(--accent); color: #1a1408; border-color: var(--accent); }
  .add-btn:active { transform: scale(0.94); filter: brightness(.92); }
  .add-btn.open { background: var(--accent); color: #1a1408; border-color: var(--accent); }
  .add-btn.open svg { transform: rotate(45deg); transition: transform 200ms cubic-bezier(.2,.8,.2,1); }
  .add-label { letter-spacing: .2px; }

  .hide-btn {
    width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: var(--fg-2); cursor: pointer;
    border-radius: 6px; padding: 0; transition: all 150ms;
  }
  .hide-btn:hover { background: var(--bg-2); color: var(--fg-0); }

  /* Picker */
  .picker {
    border-bottom: 1px solid var(--border);
    background: var(--bg-0);
    padding: 12px 12px 10px;
    display: flex; flex-direction: column; gap: 8px;
    animation: slidedown 160ms cubic-bezier(.2,.8,.2,1);
  }
  @keyframes slidedown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

  .picker-hint {
    font-family: var(--font-mono); font-size: 10px;
    color: var(--fg-2); letter-spacing: .8px;
    padding: 0 2px 2px; text-transform: uppercase;
  }

  .picker-grid {
    display: flex; flex-direction: column; gap: 6px;
  }

  .picker-card {
    display: flex; align-items: center; gap: 12px;
    padding: 12px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer; text-align: left; width: 100%;
    transition: all 200ms cubic-bezier(.2,.8,.2,1);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  .picker-card:hover {
    border-color: var(--accent-line);
    background: var(--bg-3);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }
  .picker-card:active { transform: scale(0.98); cursor: grabbing; filter: brightness(.92); }

  .card-icon {
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    width: 36px; height: 36px;
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 8px;
    transition: all 200ms ease;
  }
  .picker-card:hover .card-icon { 
    background: var(--accent-dim); 
    border-color: var(--accent-line);
    color: var(--accent) !important;
  }

  .card-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .card-label {
    font-family: var(--font-sans); font-size: 13px; font-weight: 600;
    color: var(--fg-0); letter-spacing: -.1px;
  }
  .card-sub {
    font-family: var(--font-mono); font-size: 9.5px;
    color: var(--fg-3); letter-spacing: .3px;
  }
  .card-plus {
    color: var(--fg-3); font-size: 16px; line-height: 1;
    flex-shrink: 0; transition: color 160ms;
  }
  .picker-card:hover .card-plus { color: var(--accent); }

  .picker-foot {
    padding: 4px 4px 0;
    border-top: 1px dashed var(--border);
    margin-top: 2px;
  }
  .grip-hint {
    font-family: var(--font-mono); font-size: 9.5px;
    color: var(--fg-3); letter-spacing: .3px;
  }

  /* Body */
  .panel-body {
    flex: 1; overflow: auto;
    display: flex; flex-direction: column;
    --w-nodes: var(--accent);
    --w-topics: var(--accent2);
    --w-params: var(--accent3);
    --w-map: var(--accent);
    --w-network: var(--accent3);
  }

  .empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 4px; padding: 16px; text-align: center;
  }
  .empty-title { font-family: var(--font-mono); font-size: 10px; color: var(--fg-2); letter-spacing: 1px; text-transform: uppercase; }
  .empty-sub { font-family: var(--font-mono); font-size: 9.5px; color: var(--fg-3); }

  .tools-stack {
    display: flex; flex-direction: column; gap: 10px;
    padding: 12px;
  }

  .tool-wrapper {
    cursor: grab;
    transition: transform 150ms ease, opacity 150ms ease;
    position: relative;
  }
  .tool-wrapper.dragging {
    opacity: 0.4;
    cursor: grabbing;
  }
  .tool-wrapper.drag-over {
    border-top: 2px solid var(--accent);
    transform: translateY(4px);
  }
  .tool-wrapper:active { cursor: grabbing; }

  /* Drop target overlay */
  .left-panel.dragover { background: color-mix(in srgb, var(--bg-1) 90%, var(--accent) 10%); }
  .drop-overlay {
    position: absolute; inset: 0; pointer-events: none;
    display: flex; align-items: center; justify-content: center;
    background: rgba(242,168,59,.06);
    border: 2px dashed var(--accent-line);
    border-radius: var(--radius);
    z-index: 5;
  }
  .drop-msg {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 14px; background: var(--bg-1);
    border: 1px solid var(--accent); border-radius: 999px;
    font-family: var(--font-mono); font-size: 11px;
    color: var(--accent); letter-spacing: .3px;
  }
</style>
