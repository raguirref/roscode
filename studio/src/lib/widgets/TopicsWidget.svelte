<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { isRuntimeReady, removeToolFromPanel, activePage } from "../stores/layout";
  import { rosCallTool, parseRosGraph } from "../tauri";
  import WidgetShell from "./WidgetShell.svelte";

  export let id: string;

  let topics: { name: string; type: string }[] = [];
  let loading = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    if (!$isRuntimeReady) return;
    loading = true;
    try {
      const raw = await rosCallTool("ros_graph", {});
      topics = parseRosGraph(raw).topics;
    } catch { /* ignore */ }
    loading = false;
  }

  onMount(() => {
    refresh();
    interval = setInterval(refresh, 10_000);
  });
  onDestroy(() => { if (interval) clearInterval(interval); });

  $: if ($isRuntimeReady && topics.length === 0) refresh();
</script>

<WidgetShell title="Topics" kind="topics" badge={topics.length ? String(topics.length) : undefined} loading={loading} onRemove={() => removeToolFromPanel(id)}>
  {#if !$isRuntimeReady}
    <div class="widget-empty">Start runtime to see topics</div>
  {:else if loading && topics.length === 0}
    <div class="widget-empty">loading…</div>
  {:else if topics.length === 0}
    <div class="widget-empty">no topics</div>
  {:else}
    {#each topics.slice(0, 12) as t}
      <button class="widget-row clickable" on:click={() => activePage.set("topics")} title={t.name}>
        <span class="d ok"></span>
        <span class="row-name">{t.name}</span>
        <span class="row-sub">{t.type.split("/").pop()}</span>
      </button>
    {/each}
    {#if topics.length > 12}
      <button class="more" on:click={() => activePage.set("topics")}>+ {topics.length - 12} more →</button>
    {/if}
  {/if}
</WidgetShell>

<style>
  .clickable { background: transparent; border: none; border-radius: 0; width: 100%; text-align: left; cursor: pointer; }
  .clickable:hover { background: var(--bg-3); border: none; }
  .d { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; background: var(--accent2); }
  .more {
    background: transparent; border: none; border-top: 1px solid var(--bg-3);
    padding: 7px; font-family: var(--font-mono); font-size: 10px;
    color: var(--accent); cursor: pointer; border-radius: 0;
  }
  .more:hover { background: var(--accent-dim); border-color: var(--bg-3); }
</style>
