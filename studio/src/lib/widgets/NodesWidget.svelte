<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { isRuntimeReady, removeToolFromPanel, activePage } from "../stores/layout";
  import { rosCallTool, parseRosGraph } from "../tauri";
  import WidgetShell from "./WidgetShell.svelte";

  export let id: string;

  let nodes: string[] = [];
  let loading = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    if (!$isRuntimeReady) return;
    loading = true;
    try {
      const raw = await rosCallTool("ros_graph", {});
      nodes = parseRosGraph(raw).nodes;
    } catch { /* ignore */ }
    loading = false;
  }

  onMount(() => {
    refresh();
    interval = setInterval(refresh, 15_000);
  });
  onDestroy(() => { if (interval) clearInterval(interval); });

  $: if ($isRuntimeReady && nodes.length === 0) refresh();
</script>

<WidgetShell title="Nodes" kind="nodes" badge={nodes.length ? String(nodes.length) : undefined} loading={loading} onRemove={() => removeToolFromPanel(id)}>
  {#if !$isRuntimeReady}
    <div class="widget-empty">Start runtime to see nodes</div>
  {:else if loading && nodes.length === 0}
    <div class="widget-empty">loading…</div>
  {:else if nodes.length === 0}
    <div class="widget-empty">no nodes</div>
  {:else}
    {#each nodes.slice(0, 12) as n}
      <button class="widget-row clickable" on:click={() => activePage.set("nodes")} title={n}>
        <span class="d ok"></span>
        <span class="row-name">{n}</span>
      </button>
    {/each}
    {#if nodes.length > 12}
      <button class="more" on:click={() => activePage.set("nodes")}>+ {nodes.length - 12} more →</button>
    {/if}
  {/if}
</WidgetShell>

<style>
  .clickable { background: transparent; border: none; border-radius: 0; width: 100%; text-align: left; cursor: pointer; }
  .clickable:hover { background: var(--bg-3); border: none; }
  .d { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
  .d.ok { background: var(--ok); }
  .more {
    background: transparent; border: none; border-top: 1px solid var(--bg-3);
    padding: 7px; font-family: var(--font-mono); font-size: 10px;
    color: var(--accent); cursor: pointer; border-radius: 0;
  }
  .more:hover { background: var(--accent-dim); border-color: var(--bg-3); }
</style>
