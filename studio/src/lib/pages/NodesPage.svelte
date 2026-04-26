<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { isRuntimeReady } from "../stores/layout";
  import { rosCallTool, rosNodeInfo, parseRosGraph, parseNodeInfo } from "../tauri";

  interface NodeInfo {
    name: string;
    selected?: boolean;
  }

  interface Connection {
    topic: string;
    type: string;
  }

  let nodes: NodeInfo[] = [];
  let selected: NodeInfo | null = null;
  let subs: Connection[] = [];
  let pubs: Connection[] = [];
  let services: string[] = [];
  let loading = false;
  let detailLoading = false;
  let lastRefresh = "";
  let activeTab = "CONNECTIONS";
  const tabs = ["CONNECTIONS", "SERVICES", "LOGS"];
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // ── Load node list ──────────────────────────────────────────────────────────
  async function loadNodes() {
    if (!$isRuntimeReady) return;
    loading = true;
    try {
      const raw = await rosCallTool("ros_graph", {});
      const parsed = parseRosGraph(raw);
      nodes = parsed.nodes.map((n) => ({ name: n }));
      lastRefresh = new Date().toLocaleTimeString();
      if (!selected && nodes.length > 0) selectNode(nodes[0]);
    } catch (e) {
      console.error("ros_graph failed:", e);
    }
    loading = false;
  }

  // ── Load node detail ────────────────────────────────────────────────────────
  async function selectNode(node: NodeInfo) {
    selected = node;
    subs = [];
    pubs = [];
    services = [];
    if (!$isRuntimeReady) return;
    detailLoading = true;
    try {
      const raw = await rosNodeInfo(node.name);
      const info = parseNodeInfo(raw);
      subs = info.subscribers;
      pubs = info.publishers;
      services = info.serviceServers;
    } catch (e) {
      console.error("ros_node_info failed:", e);
    }
    detailLoading = false;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  onMount(() => {
    loadNodes();
    pollInterval = setInterval(() => {
      if ($isRuntimeReady) loadNodes();
    }, 15_000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  $: if ($isRuntimeReady && nodes.length === 0) loadNodes();
</script>

<div class="page">
  <!-- ── Left: node list ── -->
  <div class="list-col">
    <div>
      <div class="label-sm">// NODE INDEX</div>
      <div class="page-title">nodes</div>
    </div>

    <div class="panel list-panel">
      {#if !$isRuntimeReady}
        <div class="empty-state">Start the runtime to view live nodes.</div>
      {:else if loading && nodes.length === 0}
        <div class="empty-state">loading ros graph…</div>
      {:else if nodes.length === 0}
        <div class="empty-state">No nodes found. Is ROS running?</div>
      {:else}
        {#each nodes as n}
          <button
            class="node-row"
            class:sel={selected === n}
            on:click={() => selectNode(n)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>
            <span class="node-name">{n.name}</span>
          </button>
        {/each}
      {/if}
    </div>

    {#if lastRefresh}
      <div class="refresh-row">
        <span class="refresh-label">refreshed {lastRefresh}</span>
        <button class="refresh-btn" on:click={loadNodes}>↻</button>
      </div>
    {/if}
  </div>

  <!-- ── Right: node detail ── -->
  <div class="detail-col">
    {#if !selected}
      <div class="no-selection">Select a node to inspect it.</div>
    {:else}
      <!-- breadcrumb -->
      <div class="breadcrumb">
        <span class="crumb-parent">NODES /</span>
        <span class="crumb-current">{selected.name}</span>
        {#if detailLoading}
          <span class="pill">LOADING…</span>
        {:else}
          <span class="pill ok-pill">RUNNING</span>
          <span class="pill">{subs.length} subs</span>
          <span class="pill">{pubs.length} pubs</span>
        {/if}
        <div style="flex:1"></div>
        <button class="btn-sm" on:click={() => { if (selected) selectNode(selected); }}>↻ refresh</button>
      </div>

      <!-- tabs -->
      <div class="tabs-row">
        {#each tabs as t}
          <button class="tab" class:active={activeTab === t} on:click={() => (activeTab = t)}>{t}</button>
        {/each}
      </div>

      <!-- CONNECTIONS diagram (horizontal: SUBS → NODE → PUBS) -->
      {#if activeTab === "CONNECTIONS"}
        <div class="panel conn-panel">
          <div class="panel-header">
            <span class="mono-label">CONNECTIONS · PUB/SUB</span>
            {#if detailLoading}
              <span class="pill">LOADING</span>
            {:else}
              <span class="pill ok-pill">LIVE</span>
            {/if}
          </div>
          <div class="conn-diagram">
            <!-- connector SVG arrows -->
            <svg width="100%" height="100%" style="position:absolute;inset:0;pointer-events:none" preserveAspectRatio="none">
              <defs>
                <marker id="arB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f2a83b"/>
                </marker>
              </defs>
            </svg>
            <div class="conn-cols">
              <!-- SUBS -->
              <div class="conn-side">
                <div class="side-label">// SUBS · {String(subs.length).padStart(2, "0")}</div>
                {#if subs.length === 0 && !detailLoading}
                  <div class="conn-empty">none</div>
                {:else}
                  {#each subs as s}
                    <div class="conn-box">
                      <div class="conn-topic">{s.topic}</div>
                      <div class="conn-msg">{s.type.split("/").pop()}</div>
                    </div>
                  {/each}
                {/if}
              </div>

              <!-- arrows in -->
              <div class="arrow-col">
                <svg width="60" height="100%" viewBox="0 0 60 100" preserveAspectRatio="none">
                  {#each subs as _, i}
                    {@const y = 10 + (i / Math.max(subs.length - 1, 1)) * 80}
                    <path d="M 0 {y} L 45 50" stroke="rgba(242,168,59,.3)" stroke-width="1.5" fill="none" marker-end="url(#arB)"/>
                  {/each}
                </svg>
              </div>

              <!-- NODE -->
              <div class="node-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f2a83b" stroke-width="1.5">
                  <circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="#f2a83b"/>
                </svg>
                <div class="node-name">{selected.name.split("/").pop()}</div>
                <div class="node-meta">{selected.name}</div>
              </div>

              <!-- arrows out -->
              <div class="arrow-col">
                <svg width="60" height="100%" viewBox="0 0 60 100" preserveAspectRatio="none">
                  {#each pubs as _, i}
                    {@const y = 10 + (i / Math.max(pubs.length - 1, 1)) * 80}
                    <path d="M 15 50 L 60 {y}" stroke="rgba(109,211,200,.3)" stroke-width="1.5" fill="none" marker-end="url(#arB)"/>
                  {/each}
                </svg>
              </div>

              <!-- PUBS -->
              <div class="conn-side">
                <div class="side-label teal">// PUBS · {String(pubs.length).padStart(2, "0")}</div>
                {#if pubs.length === 0 && !detailLoading}
                  <div class="conn-empty">none</div>
                {:else}
                  {#each pubs as p}
                    <div class="conn-box">
                      <div class="conn-topic teal">{p.topic}</div>
                      <div class="conn-msg">{p.type.split("/").pop()}</div>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- SERVICES tab -->
      {#if activeTab === "SERVICES"}
        <div class="panel">
          <div class="panel-header"><span class="mono-label">SERVICE SERVERS · {services.length}</span></div>
          <div class="srv-list">
            {#if services.length === 0}
              <div class="empty-state">No services.</div>
            {:else}
              {#each services as s}
                <div class="srv-row">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6dd3c8" stroke-width="1.5"><circle cx="12" cy="12" r="7"/><path d="M12 8v4l2 2"/></svg>
                  <span class="mono-sm">{s}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}

      <!-- LOGS tab (tail_log when wired) -->
      {#if activeTab === "LOGS"}
        <div class="panel">
          <div class="panel-header">
            <span class="mono-label">LIVE LOGS</span>
            <span class="pill">coming soon</span>
          </div>
          <div class="log-area">
            <div class="dim">Log streaming requires the runtime to be running and the agent started.</div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .page { flex:1; overflow:hidden; display:grid; grid-template-columns:240px 1fr; min-height:0; }

  /* list */
  .list-col {
    border-right:1px solid var(--border); background:var(--bg-1);
    padding:16px; display:flex; flex-direction:column; gap:10px; overflow:hidden;
  }
  .label-sm { font-family:var(--font-mono); font-size:10px; color:var(--accent); letter-spacing:2px; text-transform:uppercase; }
  .page-title { font-size:20px; font-weight:600; letter-spacing:-.3px; margin-top:2px; }

  .panel { background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
  .list-panel { flex:1; overflow:auto; }
  .panel-header { display:flex; align-items:center; justify-content:space-between; padding:9px 14px; border-bottom:1px solid var(--border); }
  .mono-label { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:1.5px; text-transform:uppercase; }

  .empty-state { padding:16px; font-family:var(--font-mono); font-size:11px; color:var(--fg-3); }

  .node-row {
    display:flex; align-items:center; gap:8px; padding:9px 12px;
    border-bottom:1px solid var(--border); border-left:2px solid transparent;
    background:transparent; width:100%; text-align:left; border-radius:0; cursor:pointer;
    font-family:var(--font-mono); font-size:11px; color:var(--fg-1);
  }
  .node-row:hover { background:var(--bg-2); color:var(--fg-0); border-color:var(--border); }
  .node-row.sel { background:var(--accent-dim); border-left-color:var(--accent); color:var(--fg-0); }
  .node-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .refresh-row {
    display:flex; align-items:center; justify-content:space-between;
    font-family:var(--font-mono); font-size:9px; color:var(--fg-3); letter-spacing:.5px;
  }
  .refresh-btn { background:transparent; border:none; color:var(--fg-3); cursor:pointer; font-size:14px; }
  .refresh-btn:hover { color:var(--fg-0); border:none; }
  .refresh-label { flex:1; }

  /* detail */
  .detail-col {
    display:flex; flex-direction:column; gap:12px;
    padding:18px 22px; overflow:auto;
  }
  .no-selection {
    flex:1; display:flex; align-items:center; justify-content:center;
    font-family:var(--font-mono); font-size:12px; color:var(--fg-3);
  }

  .breadcrumb { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .crumb-parent { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:1.2px; }
  .crumb-current { font-family:var(--font-mono); font-size:14px; color:var(--fg-0); letter-spacing:.3px; }
  .pill {
    display:inline-flex; align-items:center; padding:3px 8px;
    border:1px solid var(--border); border-radius:var(--radius);
    font-family:var(--font-mono); font-size:10px; color:var(--fg-2); cursor:default;
  }
  .ok-pill { border-color:rgba(139,195,74,.35); color:var(--ok); background:rgba(139,195,74,.06); }

  .tabs-row { display:flex; gap:4px; flex-shrink:0; }
  .tab { padding:4px 10px; font-size:10px; letter-spacing:.3px; border-radius:var(--radius-sm); text-transform:uppercase; }
  .tab.active { background:var(--accent-dim); border-color:var(--accent-line); color:var(--accent); }

  /* connection diagram */
  .conn-panel { flex-shrink:0; }
  .conn-diagram { height:300px; position:relative; overflow:hidden; }
  .conn-cols {
    position:absolute; inset:0;
    display:flex; align-items:center; padding:16px; gap:0;
  }
  .conn-side { display:flex; flex-direction:column; gap:8px; width:190px; flex-shrink:0; }
  .side-label { font-family:var(--font-mono); font-size:9px; color:var(--accent); letter-spacing:1.5px; text-transform:uppercase; margin-bottom:2px; }
  .side-label.teal { color:var(--accent2); }
  .conn-empty { font-family:var(--font-mono); font-size:11px; color:var(--fg-3); padding:4px 0; }
  .conn-box {
    background:var(--bg-3); border:1px solid var(--border);
    border-radius:var(--radius); padding:7px 9px;
  }
  .conn-topic { font-family:var(--font-mono); font-size:11px; color:var(--fg-0); }
  .conn-topic.teal { color:var(--accent2); }
  .conn-msg { font-family:var(--font-mono); font-size:9px; color:var(--fg-2); margin-top:2px; }

  .arrow-col { flex:1; display:flex; align-items:stretch; min-width:40px; }

  .node-center {
    display:flex; flex-direction:column; align-items:center; text-align:center;
    padding:18px 16px; background:var(--accent-dim); border:1px solid var(--accent);
    border-radius:var(--radius); min-width:140px; flex-shrink:0;
  }
  .node-name { font-size:18px; font-weight:600; letter-spacing:-.3px; margin-top:4px; color:var(--fg-0); }
  .node-meta { font-family:var(--font-mono); font-size:9px; color:var(--fg-2); margin-top:4px; letter-spacing:.3px; }

  /* services / logs */
  .srv-list { overflow:auto; max-height:300px; }
  .srv-row {
    display:flex; align-items:center; gap:8px; padding:8px 14px;
    border-top:1px solid var(--border); font-family:var(--font-mono); font-size:11px;
  }
  .srv-row:first-child { border-top:none; }
  .mono-sm { color:var(--fg-0); }

  .log-area { padding:14px; font-family:var(--font-mono); font-size:11px; color:var(--fg-2); }
  .dim { color:var(--fg-2); }

  .btn-sm { padding:5px 10px; font-size:10px; letter-spacing:.4px; text-transform:uppercase; border-radius:var(--radius-sm); }

  :global(.accent2) { color:var(--accent2); }
  .teal { color:var(--accent2); }
  :global(.accent) { color:var(--accent); }
</style>
