import * as vscode from "vscode";
import type { RosConnection } from "../ros/connection";

export class NodeGraphPanel {
  static currentPanel: NodeGraphPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _refreshInterval: NodeJS.Timeout | undefined;

  static createOrShow(context: vscode.ExtensionContext, ros: RosConnection) {
    if (NodeGraphPanel.currentPanel) {
      NodeGraphPanel.currentPanel._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "roscode.nodeGraph",
      "ROS Node Graph",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    NodeGraphPanel.currentPanel = new NodeGraphPanel(panel, ros);
  }

  private constructor(panel: vscode.WebviewPanel, private readonly ros: RosConnection) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => {
      clearInterval(this._refreshInterval);
      NodeGraphPanel.currentPanel = undefined;
    });

    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "ready" || msg.type === "refresh") {
        await this._pushGraph();
        if (!this._refreshInterval) {
          this._refreshInterval = setInterval(() => this._pushGraph(), 5000);
        }
      }
    });
  }

  private async _pushGraph() {
    const data = await this.ros.getGraphData();
    this._panel.webview.postMessage({ type: "graph", ...data });
  }

  private _getHtml(): string {
    const nonce = getNonce();
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' https://d3js.org; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);overflow:hidden;width:100vw;height:100vh;display:flex;flex-direction:column}
#toolbar{padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:8px;align-items:center;flex-shrink:0}
button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:3px;padding:4px 10px;cursor:pointer;font-size:12px}
button:hover{background:var(--vscode-button-hoverBackground)}
#empty{display:flex;align-items:center;justify-content:center;flex:1;color:var(--vscode-descriptionForeground);font-size:13px}
#graph-svg{flex:1;width:100%;cursor:grab}
#graph-svg:active{cursor:grabbing}
.node-circle{cursor:pointer;transition:filter 0.15s}
.node-circle:hover{filter:brightness(1.4)}
.node-label{font-size:11px;fill:var(--vscode-editor-foreground);pointer-events:none;font-family:var(--vscode-font-family)}
.link{stroke:var(--vscode-panel-border);stroke-opacity:0.6;marker-end:url(#arrow)}
.link.highlight{stroke:var(--vscode-textLink-foreground);stroke-opacity:0.9}
#tooltip{position:fixed;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:6px 10px;font-size:11px;pointer-events:none;display:none;max-width:250px;z-index:100}
</style>
</head>
<body>
<div id="toolbar">
  <strong style="font-size:13px">ROS Node Graph</strong>
  <button id="refreshBtn">⟳ Refresh</button>
  <button id="resetBtn">Reset View</button>
  <span id="status" style="margin-left:auto;font-size:11px;color:var(--vscode-descriptionForeground)">loading…</span>
</div>
<div id="empty" style="display:none">No graph data — connect to a robot first</div>
<svg id="graph-svg">
  <defs>
    <marker id="arrow" viewBox="0 -5 10 10" refX="20" refY="0" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0,-5L10,0L0,5" fill="var(--vscode-panel-border)" opacity="0.8"/>
    </marker>
  </defs>
  <g id="zoom-group"></g>
</svg>
<div id="tooltip"></div>
<script nonce="${nonce}" src="https://d3js.org/d3.v7.min.js"></script>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const svg = d3.select('#graph-svg');
const g = d3.select('#zoom-group');
const tooltip = document.getElementById('tooltip');
const status = document.getElementById('status');
const empty = document.getElementById('empty');
let simulation, nodes = [], links = [];

const NODE_COLOR = '#4cc9f0';
const TOPIC_COLOR = '#a78bfa';
const NODE_R = 14, TOPIC_R = 9;

const zoom = d3.zoom().scaleExtent([0.2, 4]).on('zoom', (e) => g.attr('transform', e.transform));
svg.call(zoom);

document.getElementById('refreshBtn').onclick = () => vscode.postMessage({type:'refresh'});
document.getElementById('resetBtn').onclick = () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);

function render(nodesData, linksData) {
  if (!nodesData.length) { empty.style.display='flex'; svg.style('display','none'); status.textContent='no data'; return; }
  empty.style.display='none'; svg.style('display','block');
  status.textContent = nodesData.length + ' nodes · ' + linksData.length + ' edges';

  const w = svg.node().clientWidth || 800;
  const h = svg.node().clientHeight || 600;

  g.selectAll('*').remove();

  simulation = d3.forceSimulation(nodesData)
    .force('link', d3.forceLink(linksData).id(d => d.id).distance(90))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(w/2, h/2))
    .force('collide', d3.forceCollide().radius(d => (d.kind==='node'?NODE_R:TOPIC_R)+8));

  const link = g.append('g').selectAll('line').data(linksData).join('line').attr('class','link');

  const node = g.append('g').selectAll('g').data(nodesData).join('g')
    .call(d3.drag()
      .on('start', (e,d) => { if(!e.active) simulation.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag', (e,d) => { d.fx=e.x; d.fy=e.y; })
      .on('end', (e,d) => { if(!e.active) simulation.alphaTarget(0); d.fx=null; d.fy=null; }));

  node.append('circle')
    .attr('class','node-circle')
    .attr('r', d => d.kind==='node' ? NODE_R : TOPIC_R)
    .attr('fill', d => d.kind==='node' ? NODE_COLOR : TOPIC_COLOR)
    .attr('fill-opacity', d => d.kind==='node' ? 0.9 : 0.7)
    .on('mouseover', (e, d) => {
      tooltip.style.display='block';
      tooltip.style.left=e.clientX+12+'px'; tooltip.style.top=e.clientY-20+'px';
      tooltip.innerHTML='<strong>'+d.id+'</strong><br/><span style="color:#888">'+d.kind+'</span>';
      link.classed('highlight', l => l.source.id===d.id || l.target.id===d.id);
    })
    .on('mousemove', (e) => { tooltip.style.left=e.clientX+12+'px'; tooltip.style.top=e.clientY-20+'px'; })
    .on('mouseout', () => { tooltip.style.display='none'; link.classed('highlight',false); });

  node.append('text').attr('class','node-label').attr('dy','0.35em')
    .attr('text-anchor','middle').attr('y', d => (d.kind==='node'?NODE_R:TOPIC_R)+13)
    .text(d => d.label.length>16 ? d.label.slice(0,14)+'…' : d.label);

  simulation.on('tick', () => {
    link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    node.attr('transform',d=>\`translate(\${d.x},\${d.y})\`);
  });
}

window.addEventListener('message', e => {
  const m = e.data;
  if (m.type === 'graph') render(m.nodes, m.edges);
});

vscode.postMessage({type:'ready'});
</script>
</body>
</html>`;
  }
}

function getNonce() {
  let t = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) t += c[Math.floor(Math.random() * c.length)];
  return t;
}
