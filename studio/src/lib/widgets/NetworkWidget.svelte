<script lang="ts">
  import { onMount } from "svelte";
  import { removeToolFromPanel, activePage } from "../stores/layout";
  import { lanScan, type LanHost } from "../tauri";
  import WidgetShell from "./WidgetShell.svelte";

  export let id: string;

  let hosts: LanHost[] = [];
  let scanning = false;

  async function refresh() {
    scanning = true;
    try { hosts = await lanScan(); } catch { /* ignore */ }
    scanning = false;
  }

  onMount(refresh);
</script>

<WidgetShell title="Network" kind="network" badge={hosts.length ? String(hosts.length) : undefined} loading={scanning} onRemove={() => removeToolFromPanel(id)}>
  {#if scanning && hosts.length === 0}
    <div class="widget-empty">scanning…</div>
  {:else if hosts.length === 0}
    <div class="widget-empty">no hosts in arp cache</div>
  {:else}
    {#each hosts.slice(0, 8) as h}
      <button class="widget-row clickable" on:click={() => activePage.set("network")} title={`${h.ip} · ${h.mac}`}>
        <span class="d ok"></span>
        <span class="row-name">{h.ip}</span>
        <span class="row-sub">{h.iface || "—"}</span>
      </button>
    {/each}
    {#if hosts.length > 8}
      <button class="more" on:click={() => activePage.set("network")}>+ {hosts.length - 8} more →</button>
    {/if}
  {/if}
  <button class="rescan" on:click={refresh} disabled={scanning}>{scanning ? "…" : "↻"} rescan</button>
</WidgetShell>

<style>
  .clickable { background: transparent; border: none; border-radius: 0; width: 100%; text-align: left; cursor: pointer; }
  .clickable:hover { background: var(--bg-3); border: none; }
  .d { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; background: var(--accent3); }
  .more, .rescan {
    background: transparent; border: none; border-top: 1px solid var(--bg-3);
    padding: 7px; font-family: var(--font-mono); font-size: 10px;
    color: var(--fg-2); cursor: pointer; border-radius: 0;
  }
  .more:hover { background: var(--accent-dim); color: var(--accent); border-color: var(--bg-3); }
  .rescan:hover:not(:disabled) { background: var(--bg-3); color: var(--fg-0); border-color: var(--bg-3); }
</style>
