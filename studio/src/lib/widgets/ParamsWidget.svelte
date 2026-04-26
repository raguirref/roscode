<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { isRuntimeReady, removeToolFromPanel } from "../stores/layout";
  import { rosCallTool, parseRosGraph } from "../tauri";
  import { containerExec } from "../tauri";
  import WidgetShell from "./WidgetShell.svelte";

  export let id: string;

  let params: { node: string; key: string; value: string }[] = [];
  let nodeName = "";
  let nodes: string[] = [];
  let loading = false;

  async function loadNodes() {
    if (!$isRuntimeReady) return;
    try {
      const raw = await rosCallTool("ros_graph", {});
      nodes = parseRosGraph(raw).nodes;
      if (!nodeName && nodes.length > 0) {
        nodeName = nodes[0];
        loadParams();
      }
    } catch { /* ignore */ }
  }

  async function loadParams() {
    if (!$isRuntimeReady || !nodeName) return;
    loading = true;
    try {
      // Use ros2 param list <node> + dump as a quick view
      const out = await containerExec(`ros2 param list ${nodeName} 2>/dev/null | head -10`);
      const keys = out.trim().split("\n").filter((l) => l.trim());
      const sample: { node: string; key: string; value: string }[] = [];
      for (const k of keys) {
        try {
          const v = await containerExec(`ros2 param get ${nodeName} ${k.trim()} 2>/dev/null`);
          const m = v.match(/(?:Integer|Double|String|Boolean) value is:\s*(.+)/);
          sample.push({ node: nodeName, key: k.trim(), value: m ? m[1].trim() : v.trim().slice(0, 30) });
        } catch {
          sample.push({ node: nodeName, key: k.trim(), value: "?" });
        }
        if (sample.length >= 8) break;
      }
      params = sample;
    } catch { /* ignore */ }
    loading = false;
  }

  let interval: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    loadNodes();
    interval = setInterval(() => { if ($isRuntimeReady) loadNodes(); }, 30_000);
  });
  onDestroy(() => { if (interval) clearInterval(interval); });
</script>

<WidgetShell title="Params" kind="params" badge={params.length ? String(params.length) : undefined} loading={loading} onRemove={() => removeToolFromPanel(id)}>
  {#if !$isRuntimeReady}
    <div class="widget-empty">Start runtime to see params</div>
  {:else}
    <div class="picker">
      <select bind:value={nodeName} on:change={loadParams}>
        {#if nodes.length === 0}
          <option value="">no nodes</option>
        {:else}
          {#each nodes as n}<option value={n}>{n}</option>{/each}
        {/if}
      </select>
    </div>
    {#if loading}
      <div class="widget-empty">loading…</div>
    {:else if params.length === 0}
      <div class="widget-empty">no params on this node</div>
    {:else}
      {#each params as p}
        <div class="widget-row" title={`${p.key}: ${p.value}`}>
          <span class="row-name">{p.key}</span>
          <span class="row-sub accent">{p.value}</span>
        </div>
      {/each}
    {/if}
  {/if}
</WidgetShell>

<style>
  .picker { padding: 6px 8px; border-bottom: 1px solid var(--bg-3); }
  .picker select {
    width: 100%; background: var(--bg-3); color: var(--fg-0);
    font-family: var(--font-mono); font-size: 10.5px; padding: 4px 6px;
    border: 1px solid var(--border); border-radius: 4px; outline: none;
  }
  .accent { color: var(--accent); font-family: var(--font-mono); font-size: 10px; }
</style>
