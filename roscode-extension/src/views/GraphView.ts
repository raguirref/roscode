import * as vscode from "vscode";
import { RosConnection } from "../ros/connection";

function nonce() {
  let n = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) n += c[Math.floor(Math.random() * c.length)];
  return n;
}

interface GraphData {
  nodes: { id: string; kind: "node" | "topic"; label: string }[];
  edges: { source: string; target: string }[];
}

const DEMO_GRAPH: GraphData = {
  nodes: [
    { id: "/robot_state_publisher", kind: "node", label: "/robot_state" },
    { id: "/amcl",                  kind: "node", label: "/amcl" },
    { id: "/nav2_bt",               kind: "node", label: "/nav2_bt" },
    { id: "/controller_server",     kind: "node", label: "/controller" },
    { id: "/planner_server",        kind: "node", label: "/planner" },
    { id: "/scan",                  kind: "topic", label: "/scan" },
    { id: "/cmd_vel",               kind: "topic", label: "/cmd_vel" },
    { id: "/tf",                    kind: "topic", label: "/tf" },
  ],
  edges: [
    { source: "/robot_state_publisher", target: "/tf" },
    { source: "/scan",                  target: "/amcl" },
    { source: "/amcl",                  target: "/nav2_bt" },
    { source: "/nav2_bt",               target: "/planner_server" },
    { source: "/planner_server",        target: "/controller_server" },
    { source: "/controller_server",     target: "/cmd_vel" },
  ],
};

export class GraphView implements vscode.WebviewViewProvider {
  public static readonly viewType = "roscode.graph";
  private _view?: vscode.WebviewView;
  private _refresh?: NodeJS.Timeout;
  private _onVisCb?: () => void;

  constructor(private readonly _context: vscode.ExtensionContext, private readonly _ros: RosConnection) {}

  onVisibilityChange(cb: () => void) { this._onVisCb = cb; }

  resolveWebviewView(webview: vscode.WebviewView) {
    this._view = webview;
    webview.webview.options = { enableScripts: true, localResourceRoots: [this._context.extensionUri] };
    webview.webview.html = this._html(webview.webview);
    webview.webview.onDidReceiveMessage((m) => this._handle(m));
    webview.onDidDispose(() => { if (this._refresh) clearInterval(this._refresh); });
    webview.onDidChangeVisibility(() => { if (webview.visible) this._onVisCb?.(); });
    if (webview.visible) this._onVisCb?.();

    // Push graph on activation + refresh every 5s
    this._push();
    this._refresh = setInterval(() => this._push(), 5000);
  }

  private _handle(m: any) {
    if (m.type === "ready" || m.type === "refresh") {
      this._push();
    }
  }

  private async _push() {
    let data: GraphData;
    const connected = !!this._ros.connectedHost;
    if (connected) {
      try {
        const g = await this._ros.getGraphData();
        data = g.nodes.length > 0 ? g : DEMO_GRAPH;
      } catch {
        data = DEMO_GRAPH;
      }
    } else {
      data = DEMO_GRAPH;
    }
    this._view?.webview.postMessage({ type: "graph", mock: !connected, ...data });
  }

  private _html(webview: vscode.Webview): string {
    const n = nonce();
    return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';"/>
<style>
  :root {
    --bg-0: #0a0c0b;
    --bg-1: #0f1211;
    --bg-2: #121615;
    --fg-0: #e4e6e1;
    --fg-1: #9ea39a;
    --fg-2: #636862;
    --border: #22282660;
    --border-bright: #333b38;
    --accent: #f2a83b;
    --accent-dim: rgba(242, 168, 59, 0.10);
    --accent-line: rgba(242, 168, 59, 0.28);
    --accent-glow: rgba(242, 168, 59, 0.4);
    --teal: #6dd3c8;
    --mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg-0); color: var(--fg-0); font-family: var(--mono); font-size: 11px; padding: 8px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .hd {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 10px; color: var(--fg-2); letter-spacing: 1.5px;
    text-transform: uppercase; margin-bottom: 6px;
  }
  .status-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 7px;
    background: transparent; border: 1px solid var(--border-bright);
    border-radius: 3px;
    font-size: 9px; letter-spacing: 0.5px;
  }
  .status-pill .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--fg-2); }
  .status-pill.live { color: var(--accent); border-color: var(--accent-line); background: var(--accent-dim); }
  .status-pill.live .dot { background: var(--accent); box-shadow: 0 0 6px var(--accent); animation: pulse 1.5s ease-in-out infinite; }
  .status-pill.mock { color: #f2c84b; border-color: rgba(242,200,75,0.35); }
  .status-pill.mock .dot { background: #f2c84b; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .graph-wrap {
    flex: 1; min-height: 0;
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 4px; position: relative; overflow: hidden;
  }
  .graph-wrap::before {
    content: "";
    position: absolute; inset: 0; pointer-events: none;
    background-image: radial-gradient(var(--border-bright) 1px, transparent 1px);
    background-size: 16px 16px;
    opacity: 0.3;
  }
  svg { width: 100%; height: 100%; position: relative; }

  .legend {
    display: flex; gap: 10px;
    margin-top: 6px;
    font-size: 9px; color: var(--fg-2); letter-spacing: 0.5px;
  }
  .legend-item { display: flex; align-items: center; gap: 4px; text-transform: uppercase; }
  .legend-swatch { width: 8px; height: 8px; border: 1px solid var(--accent); border-radius: 1px; background: var(--accent-dim); }
  .legend-swatch.topic { background: transparent; border-color: var(--teal); border-style: dashed; }

  .footer-stats {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 4px; margin-top: 6px;
  }
  .fs {
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 3px; padding: 4px 6px;
    text-align: center;
  }
  .fs-k { font-size: 8px; color: var(--fg-2); letter-spacing: 0.8px; text-transform: uppercase; }
  .fs-v { font-size: 13px; color: var(--fg-0); margin-top: 1px; font-weight: 500; }
  .fs.accent .fs-v { color: var(--accent); }

  button.refresh {
    padding: 3px 8px;
    background: transparent; color: var(--fg-2);
    border: 1px solid var(--border-bright); border-radius: 3px;
    font-family: var(--mono); font-size: 9px; letter-spacing: 0.5px;
    text-transform: uppercase; cursor: pointer;
  }
  button.refresh:hover { border-color: var(--accent); color: var(--accent); }
</style>
</head>
<body>
  <div class="hd">
    <span>// ROS GRAPH</span>
    <div style="display: flex; gap: 4px; align-items: center;">
      <span id="status-pill" class="status-pill"><span class="dot"></span><span id="status-text">WAIT</span></span>
      <button class="refresh" id="refresh-btn">↻</button>
    </div>
  </div>

  <div class="graph-wrap">
    <svg id="svg" viewBox="0 0 300 260" preserveAspectRatio="xMidYMid meet"></svg>
  </div>

  <div class="legend">
    <span class="legend-item"><span class="legend-swatch"></span>Node</span>
    <span class="legend-item"><span class="legend-swatch topic"></span>Topic</span>
  </div>

  <div class="footer-stats">
    <div class="fs accent"><div class="fs-k">NODES</div><div class="fs-v" id="s-nodes">0</div></div>
    <div class="fs"><div class="fs-k">TOPICS</div><div class="fs-v" id="s-topics">0</div></div>
    <div class="fs"><div class="fs-k">EDGES</div><div class="fs-v" id="s-edges">0</div></div>
  </div>

<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const svg = document.getElementById("svg");
  const statusPill = document.getElementById("status-pill");
  const statusText = document.getElementById("status-text");
  const sNodes = document.getElementById("s-nodes");
  const sTopics = document.getElementById("s-topics");
  const sEdges = document.getElementById("s-edges");

  document.getElementById("refresh-btn").addEventListener("click", () => {
    vscode.postMessage({ type: "refresh" });
  });

  function layout(nodes, edges) {
    // Simple force-ish layout: split nodes into layers by BFS from any "source" node
    const W = 300, H = 260;
    if (nodes.length === 0) return [];

    // Build adjacency
    const adj = new Map();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) {
      if (adj.has(e.source)) adj.get(e.source).push(e.target);
    }

    // Find roots (nodes with no incoming edges)
    const incoming = new Set(edges.map(e => e.target));
    let roots = nodes.filter(n => !incoming.has(n.id));
    if (roots.length === 0) roots = [nodes[0]];

    // BFS levels
    const level = new Map();
    const queue = roots.map(r => ({ id: r.id, lvl: 0 }));
    const visited = new Set();
    while (queue.length) {
      const { id, lvl } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      level.set(id, lvl);
      for (const nb of (adj.get(id) || [])) {
        if (!visited.has(nb)) queue.push({ id: nb, lvl: lvl + 1 });
      }
    }
    for (const n of nodes) if (!level.has(n.id)) level.set(n.id, 0);

    // Bucket nodes by level
    const levels = {};
    for (const n of nodes) {
      const l = level.get(n.id);
      (levels[l] = levels[l] || []).push(n);
    }
    const maxLevel = Math.max(...Object.keys(levels).map(Number));

    // Assign positions
    const pos = new Map();
    const marginX = 40, marginY = 30;
    for (const [l, ns] of Object.entries(levels)) {
      const L = Number(l);
      const x = maxLevel === 0 ? W / 2 : marginX + (L / maxLevel) * (W - 2 * marginX);
      ns.forEach((n, i) => {
        const y = marginY + ((i + 1) / (ns.length + 1)) * (H - 2 * marginY);
        pos.set(n.id, { x, y });
      });
    }
    return pos;
  }

  function render(graph) {
    const { nodes, edges } = graph;
    sNodes.textContent = nodes.filter(n => n.kind === "node").length;
    sTopics.textContent = nodes.filter(n => n.kind === "topic").length;
    sEdges.textContent = edges.length;

    const pos = layout(nodes, edges);
    let html = "";

    // Edges
    for (const e of edges) {
      const a = pos.get(e.source), b = pos.get(e.target);
      if (!a || !b) continue;
      html += '<path d="M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y + '" stroke="rgba(242,168,59,0.28)" stroke-width="1" stroke-dasharray="3 3" fill="none"/>';
    }

    // Nodes
    for (const n of nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const label = n.label.length > 14 ? n.label.slice(0, 13) + "…" : n.label;
      const w = Math.max(label.length * 6 + 10, 50);
      const isTopic = n.kind === "topic";
      const fill = isTopic ? "transparent" : "rgba(242,168,59,0.10)";
      const stroke = isTopic ? "#6dd3c8" : "#f2a83b";
      const strokeDash = isTopic ? ' stroke-dasharray="2 2"' : '';
      const textColor = isTopic ? "#6dd3c8" : "#f2a83b";
      html += '<rect x="' + (p.x - w/2) + '" y="' + (p.y - 9) + '" width="' + w + '" height="18" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"' + strokeDash + '/>';
      html += '<text x="' + p.x + '" y="' + (p.y + 3) + '" text-anchor="middle" font-family="Geist Mono, monospace" font-size="8" fill="' + textColor + '">' + label + '</text>';
    }

    svg.innerHTML = html;
  }

  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (m.type === "graph") {
      render({ nodes: m.nodes, edges: m.edges });
      if (m.mock) {
        statusPill.className = "status-pill mock";
        statusText.textContent = "DEMO";
      } else {
        statusPill.className = "status-pill live";
        statusText.textContent = "LIVE";
      }
    }
  });

  vscode.postMessage({ type: "ready" });
</script>
</body>
</html>
`;
  }
}
