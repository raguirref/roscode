<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import cytoscape, { type Core } from "cytoscape";

  const dispatch = createEventDispatcher<{ nodeclick: { prompt: string } }>();

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
            shape: "round-rectangle",
            "background-color": "rgba(242, 168, 59, 0.10)",
            "border-width": 1,
            "border-color": "#f2a83b",
            label: "data(label)",
            "font-size": 10,
            "font-family": "Geist Mono, JetBrains Mono, SF Mono, monospace",
            color: "#f2a83b",
            "text-valign": "center",
            "text-halign": "center",
            width: 88,
            height: 22,
            "padding-left": "6px",
            "padding-right": "6px",
          },
        },
        {
          selector: "node[kind='topic']",
          style: {
            shape: "round-rectangle",
            "background-color": "#121615",
            "border-width": 1,
            "border-color": "#333b38",
            label: "data(label)",
            "font-size": 9,
            "font-family": "Geist Mono, JetBrains Mono, SF Mono, monospace",
            color: "#9ea39a",
            "text-valign": "center",
            "text-halign": "center",
            width: 72,
            height: 18,
          },
        },
        {
          selector: "edge[rel='pub']",
          style: {
            width: 1,
            "line-color": "rgba(242, 168, 59, 0.6)",
            "target-arrow-color": "#f2a83b",
            "target-arrow-shape": "triangle",
            "curve-style": "taxi",
            "taxi-direction": "horizontal",
            "line-style": "dashed",
            "line-dash-pattern": [3, 3],
            opacity: 0.9,
          },
        },
        {
          selector: "edge[rel='sub']",
          style: {
            width: 1,
            "line-color": "rgba(242, 168, 59, 0.35)",
            "target-arrow-color": "rgba(242, 168, 59, 0.6)",
            "target-arrow-shape": "triangle",
            "curve-style": "taxi",
            "taxi-direction": "horizontal",
            "line-style": "dashed",
            "line-dash-pattern": [3, 3],
            opacity: 0.7,
          },
        },
        {
          selector: ":selected",
          style: {
            "border-color": "#6dd3c8",
            "border-width": 2,
          },
        },
      ],
      layout: { name: "cose", animate: false },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    cy.on("tap", "node", (evt) => {
      const d = evt.target.data();
      let prompt: string;
      if (d.kind === "topic") {
        prompt = `explain the ${d.id} topic — what message type does it use (${d.msg_type ?? "unknown"}), which nodes publish to it and which nodes subscribe to it?`;
      } else {
        prompt = `explain the ${d.id} ROS node — what does it do, what topics does it publish and subscribe to, and are there any issues with it?`;
      }
      dispatch("nodeclick", { prompt });
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
    background-image: radial-gradient(var(--border-bright) 1px, transparent 1px);
    background-size: 24px 24px;
  }

  .overlay {
    position: absolute;
    top: 10px;
    right: 12px;
    z-index: 10;
  }

  .badge {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 3px 8px;
    border-radius: var(--radius);
    background: var(--bg-1);
    border: 1px solid var(--border);
    color: var(--fg-2);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .badge.live { border-color: var(--accent-line); color: var(--accent); background: var(--accent-dim); }
  .badge.warn { border-color: rgba(242,200,75,0.35); color: var(--warn); }
  .badge.err  { border-color: rgba(224,102,102,0.35); color: var(--err); }

  .legend {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--fg-2);
    letter-spacing: 0.4px;
    text-transform: uppercase;
    background: var(--bg-1);
  }

  .dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    margin-right: 4px;
    vertical-align: middle;
  }
  .dot.node  { background: var(--accent-dim); border: 1px solid var(--accent); }
  .dot.topic { background: var(--bg-2); border: 1px solid var(--border-bright); }

  .line {
    display: inline-block;
    width: 20px;
    height: 1px;
    margin-right: 4px;
    vertical-align: middle;
  }
  .line.pub { border-top: 1px dashed var(--accent); }
  .line.sub { border-top: 1px dashed rgba(242, 168, 59, 0.35); }
</style>
