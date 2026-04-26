<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { isRuntimeReady } from "../stores/layout";
  import { rosCallTool, parseRosGraph } from "../tauri";

  interface Topic {
    name: string;
    type: string;
    hz: number | null;
    stale: boolean;
  }

  let topics: Topic[] = [];
  let selected: Topic | null = null;
  let loading = false;
  let lastRefresh = "";
  let filter = "";
  let activeFilter: "all" | "live" | "stale" = "all";
  let echoLines: string[] = [];
  let echoLoading = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  $: filteredTopics = topics.filter((t) => {
    if (activeFilter === "live" && t.stale) return false;
    if (activeFilter === "stale" && !t.stale) return false;
    if (filter && !t.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  $: liveCount = topics.filter((t) => !t.stale).length;
  $: staleCount = topics.filter((t) => t.stale).length;

  // ── Data fetching ───────────────────────────────────────────────────────────
  async function loadTopics() {
    if (!$isRuntimeReady) return;
    loading = true;
    try {
      const raw = await rosCallTool("ros_graph", {});
      const parsed = parseRosGraph(raw);
      topics = parsed.topics.map((t) => ({
        name: t.name,
        type: t.type,
        hz: null,
        stale: false,
      }));
      lastRefresh = new Date().toLocaleTimeString();
      if (!selected && topics.length > 0) selected = topics[0];
    } catch (e) {
      console.error("ros_graph failed:", e);
    }
    loading = false;
  }

  async function loadHz(topic: Topic) {
    if (!$isRuntimeReady) return;
    try {
      const raw = await rosCallTool("topic_hz", { topic: topic.name });
      const match = raw.match(/average rate:\s*([\d.]+)/);
      if (match) {
        topic.hz = parseFloat(match[1]);
        topic.stale = topic.hz < 0.01;
      } else if (raw.includes("Error") || raw.includes("no publishers")) {
        topic.stale = true;
        topic.hz = 0;
      }
      topics = topics;
    } catch {}
  }

  async function echoTopic(topic: Topic) {
    if (!$isRuntimeReady || echoLoading) return;
    echoLoading = true;
    echoLines = ["// fetching…"];
    try {
      const raw = await rosCallTool("topic_echo", {
        topic: topic.name,
        duration_sec: 2.0,
        max_messages: 3,
      });
      echoLines = raw.split("\n").slice(0, 60);
    } catch (e) {
      echoLines = [`// Error: ${e}`];
    }
    echoLoading = false;
  }

  // ── Sparkline helpers ───────────────────────────────────────────────────────
  function sparkPts(amp: number, phase: number): string {
    return Array.from({ length: 40 }, (_, i) => {
      const x = (i / 39) * 300;
      const y = 65 + Math.sin(i * 0.4 + phase) * amp * 0.6 + Math.cos(i * 0.9 + phase) * amp * 0.3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  onMount(() => {
    loadTopics();
    pollInterval = setInterval(() => {
      if ($isRuntimeReady) loadTopics();
    }, 10_000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  $: if ($isRuntimeReady && topics.length === 0) loadTopics();
</script>

<div class="page">
  <!-- ── Topic list ── -->
  <div class="list-col">
    <div>
      <div class="label-sm">// TOPIC INDEX</div>
      <div class="page-title">topics</div>
    </div>

    <div class="search-box">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input class="search-input" placeholder="filter…" bind:value={filter} />
    </div>

    <div class="pill-row">
      <button class="pill" class:active={activeFilter === "all"} on:click={() => (activeFilter = "all")}>
        ALL·{topics.length}
      </button>
      <button class="pill ok-pill" class:active={activeFilter === "live"} on:click={() => (activeFilter = "live")}>
        LIVE·{liveCount}
      </button>
      <button class="pill warn-pill" class:active={activeFilter === "stale"} on:click={() => (activeFilter = "stale")}>
        STALE·{staleCount}
      </button>
    </div>

    <div class="panel list-panel">
      {#if !$isRuntimeReady}
        <div class="empty-state">Start the runtime to view live topics.</div>
      {:else if loading && topics.length === 0}
        <div class="empty-state">loading ros graph…</div>
      {:else if topics.length === 0}
        <div class="empty-state">No topics found. Is ROS running?</div>
      {:else}
        {#each filteredTopics as t}
          <button
            class="topic-row"
            class:sel={selected === t}
            on:click={() => { selected = t; loadHz(t); }}
          >
            <div class="dot {t.stale ? 'warn' : 'ok'}"></div>
            <div class="topic-info">
              <div class="mono-sm">{t.name}</div>
              <div class="meta">{t.type}</div>
            </div>
            <div class="hz" class:stale={t.stale}>
              {t.hz !== null ? `${t.hz.toFixed(0)}HZ` : "—"}
            </div>
          </button>
        {/each}
      {/if}
    </div>

    {#if lastRefresh}
      <div class="refresh-row">
        <span class="refresh-label">refreshed {lastRefresh}</span>
        <button class="refresh-btn" on:click={loadTopics}>↻</button>
      </div>
    {/if}
  </div>

  <!-- ── Topic detail ── -->
  <div class="detail-col">
    {#if !selected}
      <div class="no-selection">Select a topic to inspect it.</div>
    {:else}
      <div class="detail-header">
        <span class="crumb-parent">TOPICS /</span>
        <span class="crumb-current">{selected.name}</span>
        {#if selected.hz !== null}
          <span class="pill active">{selected.hz.toFixed(1)} HZ</span>
        {/if}
        <span class="pill">{selected.type}</span>
        <div style="flex:1"></div>
        <button class="btn-sm" on:click={() => { if (selected) echoTopic(selected); }}>▶ echo</button>
        <button class="btn-sm" on:click={() => { if (selected) loadHz(selected); }}>↻ hz</button>
      </div>

      <!-- live plot (animated, decorative) -->
      <div class="panel plot-panel">
        <div class="panel-header">
          <span class="mono-label">PLOT · 10s</span>
          <div style="display:flex;gap:10px">
            <span class="legend"><span class="leg-line amber"></span>field.x</span>
            <span class="legend"><span class="leg-line teal dashed"></span>field.z</span>
          </div>
        </div>
        <div class="plot-area">
          <svg viewBox="0 0 300 130" width="100%" height="100%" preserveAspectRatio="none">
            <polyline points={sparkPts(34, 0)} fill="none" stroke="#f2a83b" stroke-width="1.5"/>
            <polyline points={sparkPts(22, 1.2)} fill="none" stroke="#6dd3c8" stroke-width="1.2" stroke-dasharray="3 2"/>
          </svg>
        </div>
      </div>

      <!-- echo + pub/sub -->
      <div class="bottom-split">
        <div class="panel echo-panel">
          <div class="panel-header">
            <span class="mono-label">LIVE ECHO</span>
            {#if echoLoading}
              <span class="pill warn-pill">FETCHING</span>
            {:else if echoLines.length > 0}
              <span class="pill ok-pill">READY</span>
            {/if}
          </div>
          <div class="echo-area">
            {#if echoLines.length === 0}
              <div class="dim">Click ▶ echo to sample messages</div>
            {:else}
              {#each echoLines as line}
                <div class:dim={line.startsWith("─") || line.trim() === ""} class:accent={line.includes(":")}>{line}</div>
              {/each}
            {/if}
          </div>
        </div>

        <div class="right-panels">
          <div class="panel">
            <div class="panel-header"><span class="mono-label">PUB / SUB</span></div>
            <div class="pubsub-area">
              <div class="ps-label">PUBLISHERS</div>
              <div class="ps-item dim">↻ click hz to load</div>
              <div class="ps-label" style="margin-top:8px">SUBSCRIBERS</div>
              <div class="ps-item dim">↻ click hz to load</div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-header"><span class="mono-label">RATE · 60s</span></div>
            <div class="rate-area">
              <svg viewBox="0 0 300 60" width="100%" height="60" preserveAspectRatio="none">
                <path d="M 0 30 L 30 25 L 60 28 L 90 15 L 120 20 L 150 10 L 180 25 L 210 18 L 240 22 L 270 12 L 300 18"
                  fill="none" stroke="#f2a83b" stroke-width="1.2"/>
              </svg>
              {#if selected.hz !== null}
                <div class="rate-pills">
                  <span class="pill">AVG {selected.hz.toFixed(1)}</span>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .page { flex:1; overflow:hidden; display:grid; grid-template-columns:280px 1fr; min-height:0; }
  .label-sm { font-family:var(--font-mono); font-size:10px; color:var(--accent); letter-spacing:2px; text-transform:uppercase; }
  .mono-label { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:1.5px; text-transform:uppercase; }
  .mono-sm { font-family:var(--font-mono); font-size:11px; color:var(--fg-0); }
  .meta { font-family:var(--font-mono); font-size:9px; color:var(--fg-2); }
  .dim { color:var(--fg-2); }
  .accent { color:var(--accent); }

  .list-col {
    border-right:1px solid var(--border); background:var(--bg-1);
    padding:16px; display:flex; flex-direction:column; gap:10px; overflow:hidden;
  }
  .page-title { font-size:20px; font-weight:600; letter-spacing:-.3px; margin-top:2px; }

  .search-box {
    display:flex; align-items:center; gap:8px; padding:7px 10px;
    background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius);
  }
  .search-input {
    flex:1; background:transparent; border:none; outline:none;
    font-family:var(--font-mono); font-size:11px; color:var(--fg-0);
  }
  .search-input::placeholder { color:var(--fg-3); }

  .pill-row { display:flex; gap:4px; flex-wrap:wrap; }
  .pill {
    display:inline-flex; align-items:center; padding:3px 8px;
    border:1px solid var(--border); border-radius:var(--radius);
    font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:.3px; cursor:pointer;
    background:transparent;
  }
  .pill.active { background:var(--accent-dim); border-color:var(--accent-line); color:var(--accent); }
  .ok-pill { border-color:rgba(139,195,74,.35); color:var(--ok); }
  .ok-pill.active { background:rgba(139,195,74,.1); }
  .warn-pill { border-color:rgba(242,200,75,.35); color:var(--warn); }
  .warn-pill.active { background:rgba(242,200,75,.1); }

  .panel { background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
  .list-panel { flex:1; overflow:auto; }
  .panel-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:9px 14px; border-bottom:1px solid var(--border);
  }

  .empty-state { padding:16px; font-family:var(--font-mono); font-size:11px; color:var(--fg-3); }

  .topic-row {
    display:flex; align-items:center; gap:8px; padding:10px 12px;
    border-bottom:1px solid var(--border); background:transparent;
    border-left:2px solid transparent; width:100%; text-align:left; border-radius:0; cursor:pointer;
  }
  .topic-row.sel { background:var(--accent-dim); border-left-color:var(--accent); }
  .topic-row:hover:not(.sel) { background:var(--bg-3); }
  .topic-row:hover { border-color:var(--border); }
  .dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
  .dot.ok { background:var(--ok); }
  .dot.warn { background:var(--warn); }
  .topic-info { flex:1; min-width:0; }
  .hz { font-family:var(--font-mono); font-size:10px; color:var(--fg-1); }
  .hz.stale { color:var(--warn); }

  .refresh-row {
    display:flex; align-items:center; justify-content:space-between;
    padding:4px 0; font-family:var(--font-mono); font-size:10px; color:var(--fg-3);
  }
  .refresh-btn {
    background:transparent; border:none; color:var(--fg-3); cursor:pointer; font-size:14px;
  }
  .refresh-btn:hover { color:var(--fg-0); border:none; }
  .refresh-label { font-size:9px; letter-spacing:.5px; }

  /* detail */
  .detail-col { display:flex; flex-direction:column; gap:12px; padding:18px; overflow:auto; }
  .no-selection { display:flex; align-items:center; justify-content:center; flex:1; font-family:var(--font-mono); font-size:12px; color:var(--fg-3); }
  .detail-header { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .crumb-parent { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:1.5px; }
  .crumb-current { font-family:var(--font-mono); font-size:16px; color:var(--fg-0); }

  .plot-panel { flex-shrink:0; }
  .plot-area { height:128px; position:relative; overflow:hidden; }
  .legend { display:inline-flex; align-items:center; gap:6px; font-family:var(--font-mono); font-size:10px; color:var(--fg-1); }
  .leg-line { width:10px; height:2px; flex-shrink:0; }
  .leg-line.amber { background:#f2a83b; }
  .leg-line.teal { background:#6dd3c8; }
  .leg-line.dashed { background:repeating-linear-gradient(90deg,#6dd3c8 0 3px,transparent 3px 5px); }

  .bottom-split { display:grid; grid-template-columns:1.3fr 1fr; gap:10px; flex:1; min-height:120px; }
  .echo-panel { display:flex; flex-direction:column; }
  .echo-area {
    flex:1; padding:8px 14px; font-family:var(--font-mono); font-size:11.5px;
    line-height:1.7; overflow:auto; background:#0a0d0c;
  }

  .right-panels { display:flex; flex-direction:column; gap:10px; }
  .pubsub-area { padding:8px 14px; font-family:var(--font-mono); font-size:11px; }
  .ps-label { font-size:9px; color:var(--fg-2); letter-spacing:1px; text-transform:uppercase; }
  .ps-item { padding:2px 0; color:var(--fg-0); }
  .rate-area { padding:10px 14px; }
  .rate-pills { display:flex; gap:5px; margin-top:6px; }

  .btn-sm { padding:5px 10px; font-size:10px; letter-spacing:.4px; text-transform:uppercase; border-radius:var(--radius-sm); }
</style>
