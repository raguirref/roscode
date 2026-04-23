<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import cytoscape, { type Core } from "cytoscape";

  export let port: number;

  let container: HTMLDivElement;
  let cy: Core | null = null;
  let ws: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let status: "connecting" | "live" | "empty" | "error" = "connecting";
  let errorMsg = "";

  onMount(() => {
    cy = cytoscape({
      container,
      elements: [],
      style: [
        {
          selector: "node[kind='node']",
          style: {
            "background-color": "#4cc9f0",
            "border-width": 1.5,
            "border-color": "#2d9dc9",
            label: "data(label)",
            "font-size": 10,
            "font-family": "SF Mono, Menlo, monospace",
            color: "#e0e0e0",
            "text-valign": "bottom",
            "text-margin-y": 4,
            width: 28,
            height: 28,
          },
        },
        {
          selector: "node[kind='topic']",
          style: {
            shape: "diamond",
            "background-color": "#2a2a3a",
            "border-width": 1.5,
            "border-color": "#4cc9f0",
            label: "data(label)",
            "font-size": 9,
            "font-family": "SF Mono, Menlo, monospace",
            color: "#8888aa",
            "text-valign": "bottom",
            "text-margin-y": 4,
            width: 18,
            height: 18,
          },
        },
        {
          selector: "edge[rel='pub']",
          style: {
            width: 1.5,
            "line-color": "#4cc9f0",
            "target-arrow-color": "#4cc9f0",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.7,
          },
        },
        {
          selector: "edge[rel='sub']",
          style: {
            width: 1.5,
            "line-color": "#888",
            "target-arrow-color": "#888",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "line-style": "dashed",
            "line-dash-pattern": [4, 3],
            opacity: 0.5,
          },
        },
        {
          selector: ":selected",
          style: {
            "border-color": "#f0a050",
            "border-width": 2.5,
          },
        },
      ],
      layout: { name: "cose", animate: false },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    connect();
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    ws?.close();
    cy?.destroy();
  });

  function connect() {
    ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.onopen = () => {
      status = "connecting";
      requestGraph();
      pollTimer = setInterval(requestGraph, 5000);
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "graph") applyGraph(msg.nodes ?? [], msg.edges ?? []);
      if (msg.type === "graph_error") { status = "error"; errorMsg = msg.message; }
    };

    ws.onclose = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      // retry after 3s
      setTimeout(() => { if (!cy) return; connect(); }, 3000);
    };

    ws.onerror = () => {
      status = "error";
      errorMsg = `cannot reach ws://127.0.0.1:${port}`;
    };
  }

  function requestGraph() {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "graph_request" }));
    }
  }

  function applyGraph(nodes: any[], edges: any[]) {
    if (!cy) return;

    if (nodes.length === 0) { status = "empty"; return; }
    status = "live";

    const incomingNodeIds = new Set(nodes.map((n: any) => n.data.id));
    const incomingEdgeIds = new Set(edges.map((e: any) => e.data.id));

    // remove stale elements
    cy.elements().filter((el) => !incomingNodeIds.has(el.id()) && !incomingEdgeIds.has(el.id())).remove();

    // add new elements
    const existing = new Set(cy.elements().map((el) => el.id()));
    const toAdd = [
      ...nodes.filter((n: any) => !existing.has(n.data.id)),
      ...edges.filter((e: any) => !existing.has(e.data.id)),
    ];
    if (toAdd.length > 0) {
      cy.add(toAdd);
      cy.layout({ name: "cose", animate: true, animationDuration: 400, fit: true, padding: 24 }).run();
    }
  }
</script>

<div class="rosmap">
  <div class="overlay">
    {#if status === "connecting"}
      <span class="badge">connecting…</span>
    {:else if status === "empty"}
      <span class="badge warn">no ROS nodes running</span>
    {:else if status === "error"}
      <span class="badge err">{errorMsg}</span>
    {:else}
      <span class="badge live">live</span>
    {/if}
  </div>
  <div class="cy" bind:this={container}></div>
  <div class="legend">
    <span class="dot node"></span>node
    <span class="dot topic"></span>topic
    <span class="line pub"></span>publish
    <span class="line sub"></span>subscribe
  </div>
</div>

<style>
  .rosmap {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .cy {
    flex: 1;
    background: var(--bg-0);
  }

  .overlay {
    position: absolute;
    top: 8px;
    right: 10px;
    z-index: 10;
  }

  .badge {
    font-size: 10px;
    font-family: "SF Mono", Menlo, monospace;
    padding: 2px 7px;
    border-radius: 10px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    color: var(--fg-2);
    letter-spacing: 0.5px;
  }
  .badge.live { border-color: #4cc9f0; color: #4cc9f0; }
  .badge.warn { border-color: #f0a050; color: #f0a050; }
  .badge.err  { border-color: var(--accent-warm); color: var(--accent-warm); }

  .legend {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 10px;
    border-top: 1px solid var(--border);
    font-size: 10px;
    color: var(--fg-2);
    font-family: "SF Mono", Menlo, monospace;
    background: var(--bg-1);
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 2px;
  }
  .dot.node  { background: #4cc9f0; border: 1.5px solid #2d9dc9; }
  .dot.topic {
    background: #2a2a3a;
    border: 1.5px solid #4cc9f0;
    border-radius: 2px;
    transform: rotate(45deg);
    width: 8px;
    height: 8px;
  }

  .line {
    display: inline-block;
    width: 20px;
    height: 2px;
    margin-right: 2px;
    vertical-align: middle;
  }
  .line.pub { background: #4cc9f0; }
  .line.sub {
    background: repeating-linear-gradient(to right, #888 0px, #888 4px, transparent 4px, transparent 7px);
  }
</style>
