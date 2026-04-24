import * as vscode from "vscode";
import { RosConnection } from "../ros/connection";

export type PageKind = "network" | "nodes" | "topics" | "library" | "graph" | "plot" | "terminal";

function nonce() {
  let n = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) n += c[Math.floor(Math.random() * c.length)];
  return n;
}

const PAGE_META: Record<PageKind, { title: string; tag: string; heading: string; subtitle: string }> = {
  network:  { title: "roscode/studio — network",  tag: "NET", heading: "network",  subtitle: "// LAN SCAN · ROS 1 & 2 DISCOVERY" },
  nodes:    { title: "roscode/studio — nodes",    tag: "NOD", heading: "nodes",    subtitle: "// RUNNING NODES · LIVE CONNECTIONS" },
  topics:   { title: "roscode/studio — topics",   tag: "TOP", heading: "topics",   subtitle: "// TOPIC INDEX · LIVE ECHO · PLOT" },
  library:  { title: "roscode/studio — library",  tag: "LIB", heading: "library",  subtitle: "// PKG INDEX · 8,429 packages" },
  graph:    { title: "roscode/studio — graph",    tag: "GRF", heading: "graph",    subtitle: "// NODE GRAPH · PUB-SUB · LIVE" },
  plot:     { title: "roscode/studio — plot",     tag: "PLT", heading: "plot",     subtitle: "// TOPIC PLOT · REAL-TIME" },
  terminal: { title: "roscode/studio — terminal", tag: "TRM", heading: "terminal", subtitle: "// ROS CONSOLE · READY" },
};

export class RoscodePagePanel {
  private static readonly viewType = "roscode.page";
  private static instances: Map<PageKind, RoscodePagePanel> = new Map();

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _kind: PageKind;
  private readonly _ros: RosConnection;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(context: vscode.ExtensionContext, kind: PageKind, ros: RosConnection): RoscodePagePanel {
    const existing = RoscodePagePanel.instances.get(kind);
    if (existing) {
      existing._panel.reveal(vscode.ViewColumn.One);
      return existing;
    }
    const meta = PAGE_META[kind];
    const panel = vscode.window.createWebviewPanel(
      RoscodePagePanel.viewType,
      meta.title,
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      }
    );
    const instance = new RoscodePagePanel(panel, context, kind, ros);
    RoscodePagePanel.instances.set(kind, instance);
    return instance;
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, kind: PageKind, ros: RosConnection) {
    this._panel = panel;
    this._context = context;
    this._kind = kind;
    this._ros = ros;
    this._panel.webview.html = this._html();
    this._panel.webview.onDidReceiveMessage((m) => this._handle(m), null, this._disposables);
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    if (ros && ros.onStatusChange) {
      ros.onStatusChange(() => this._postState());
    }
  }

  private _postState() {
    this._panel.webview.postMessage({
      type: "rosState",
      connected: this._ros?.status === "connected",
      host: this._ros?.connectedHost ?? null,
    });
  }

  private async _handle(msg: any) {
    switch (msg?.type) {
      case "ready":
        this._postState();
        break;
      case "openAgent":
        await vscode.commands.executeCommand("roscode.focusAgent");
        break;
      case "scanNetwork":
        await vscode.commands.executeCommand("roscode.discoverNetwork");
        break;
      case "refreshNodes":
        await vscode.commands.executeCommand("roscode.refreshNodes");
        break;
      case "echoTopic":
        if (msg.name) await vscode.commands.executeCommand("roscode.echoTopic", { topicName: msg.name });
        break;
      case "openTerminal":
        await vscode.commands.executeCommand("workbench.action.terminal.new");
        break;
      case "runShell":
        if (msg.cmd) {
          const t = vscode.window.createTerminal("roscode");
          t.show();
          t.sendText(msg.cmd);
        }
        break;
    }
  }

  private _dispose() {
    RoscodePagePanel.instances.delete(this._kind);
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  private _html(): string {
    const n = nonce();
    const meta = PAGE_META[this._kind];
    const body = this._bodyFor(this._kind);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${n}' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${n}' 'unsafe-inline';">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" nonce="${n}" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">
<style nonce="${n}">
:root{
  --bg:#0a0c0b; --bg2:#0f1211; --bg3:#121615; --bg4:#181d1b;
  --fg:#e4e6e1; --fg2:#9ea39a; --fg3:#636862;
  --border:#22282660; --border2:#333b38;
  --accent:#f2a83b; --accent-dim:rgba(242,168,59,.10); --accent-line:rgba(242,168,59,.28);
  --accent-glow:rgba(242,168,59,.4);
  --accent2:#6dd3c8;
  --ok:#8bc34a; --warn:#f2c84b; --red:#e06666;
  --font-mono:'Geist Mono','JetBrains Mono',ui-monospace,monospace;
  --font-sans:'Geist','Inter',system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--font-sans);font-size:13px}
button{cursor:pointer;font-family:inherit;font-size:inherit;border:none;background:none;color:inherit}
input{font-family:var(--font-mono);font-size:12px;color:var(--fg);background:var(--bg2);border:1px solid var(--border2);border-radius:4px;padding:7px 10px;outline:none;transition:border-color 100ms}
input:focus{border-color:var(--accent)}
input::placeholder{color:var(--fg3)}

#bg-grid{position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:radial-gradient(rgba(242,168,59,.05) 1px, transparent 1px);
  background-size:22px 22px; opacity:.8}

#page{position:relative;z-index:1;display:grid;grid-template-columns:260px 1fr;gap:0;height:100%;overflow:hidden}

/* ── LEFT LIST PANE ─── */
#left{border-right:1px solid var(--border);background:var(--bg2);display:flex;flex-direction:column;overflow:hidden}
.l-head{padding:22px 18px 14px 18px;border-bottom:1px solid var(--border)}
.l-tag{font-family:var(--font-mono);font-size:10px;color:var(--fg3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}
.l-tag::before{content:"// "}
.l-title{font-family:var(--font-sans);font-size:28px;font-weight:600;color:var(--fg);letter-spacing:-.3px;line-height:1;margin-bottom:10px}
.l-pills{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
.l-pill{font-family:var(--font-mono);font-size:9.5px;padding:3px 7px;border:1px solid var(--border2);border-radius:3px;color:var(--fg2);letter-spacing:.5px;text-transform:uppercase}
.l-pill.active{background:var(--accent-dim);border-color:var(--accent-line);color:var(--accent)}
.l-pill.ok{color:var(--ok);border-color:rgba(139,195,74,.3)}
.l-pill.warn{color:var(--warn);border-color:rgba(242,200,75,.3)}
.l-search{padding:10px 14px;border-bottom:1px solid var(--border)}
.l-search input{width:100%}
.l-list{flex:1;overflow-y:auto;padding:6px}
.l-item{display:flex;flex-direction:column;gap:2px;padding:9px 12px;border-radius:4px;cursor:pointer;transition:background 80ms}
.l-item:hover{background:var(--bg3)}
.l-item.active{background:var(--accent-dim);border-left:2px solid var(--accent);padding-left:10px}
.l-item .l-name{font-family:var(--font-mono);font-size:12px;color:var(--fg);font-weight:500}
.l-item .l-meta{font-family:var(--font-mono);font-size:10px;color:var(--fg3);letter-spacing:.2px}
.l-item.active .l-name{color:var(--accent)}

/* ── RIGHT DETAIL ─── */
#right{padding:22px 32px 28px 32px;overflow-y:auto;display:flex;flex-direction:column;gap:18px}

.r-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.crumbs{font-family:var(--font-mono);font-size:11px;color:var(--fg3);letter-spacing:.3px;display:flex;gap:6px;align-items:center}
.crumbs .slash{color:var(--fg3)}
.crumbs .target{color:var(--accent)}
.crumbs .live{display:inline-flex;align-items:center;gap:5px;margin-left:10px;padding:3px 8px;border-radius:3px;border:1px solid var(--border2);font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--ok)}
.crumbs .live::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--ok);box-shadow:0 0 4px var(--ok)}
.r-btns{display:flex;gap:6px}
.btn{padding:6px 12px;font-family:var(--font-mono);font-size:10.5px;font-weight:500;letter-spacing:.8px;text-transform:uppercase;border:1px solid var(--border2);background:transparent;color:var(--fg2);cursor:pointer;border-radius:4px;transition:all 100ms}
.btn:hover{border-color:var(--accent-line);color:var(--fg)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#1a1408;font-weight:600}
.btn.primary:hover{opacity:.92}

/* KPI stats */
.kpis{display:grid;grid-template-columns:repeat(4, minmax(120px, 1fr));gap:8px}
.kpi{border:1px solid var(--border);background:var(--bg2);border-radius:4px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.kpi .k-t{font-family:var(--font-mono);font-size:9.5px;color:var(--fg3);letter-spacing:1.2px;text-transform:uppercase}
.kpi .k-v{font-family:var(--font-sans);font-size:28px;font-weight:600;color:var(--accent);line-height:1;margin-top:2px}
.kpi .k-sub{font-family:var(--font-mono);font-size:9.5px;color:var(--fg3);letter-spacing:.4px}

/* Cards */
.card{border:1px solid var(--border);background:var(--bg2);border-radius:4px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.card-head{display:flex;align-items:center;justify-content:space-between;font-family:var(--font-mono);font-size:10.5px;color:var(--fg3);letter-spacing:1px;text-transform:uppercase}
.card-head::before{content:"// ";color:var(--accent)}
.card-body{font-family:var(--font-mono);font-size:11.5px;color:var(--fg2);line-height:1.6}
.card-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--border)}
.card-row:last-child{border-bottom:none}
.card-row .k{color:var(--fg3)}
.card-row .v{color:var(--fg);font-family:var(--font-mono)}

/* Split: 2 columns */
.split-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.split-12{display:grid;grid-template-columns:1.5fr 1fr;gap:10px}

/* Log/echo area */
.log{font-family:var(--font-mono);font-size:11px;color:var(--fg2);white-space:pre-wrap;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:10px 12px;max-height:260px;overflow-y:auto;line-height:1.6}
.log .time{color:var(--fg3)}
.log .ok{color:var(--ok)}
.log .warn{color:var(--warn)}
.log .err{color:var(--red)}
.log .tag{color:var(--accent)}

/* SVG graph (for graph kind + previews) */
.graph-canvas{border:1px solid var(--border);background-image:radial-gradient(var(--border2) 1px, transparent 1px);background-size:18px 18px;background-color:var(--bg2);border-radius:4px;min-height:360px;position:relative}
.graph-canvas svg{width:100%;height:100%}

/* Empty state */
.empty{padding:40px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--fg3);letter-spacing:.5px}
.empty::before{content:"// "}
</style>
</head>
<body>
<div id="bg-grid"></div>

<div id="page">
  <!-- LEFT list pane -->
  <aside id="left">
    <div class="l-head">
      <div class="l-tag">${meta.tag} INDEX</div>
      <div class="l-title">${meta.heading}</div>
      <div class="l-pills" id="l-pills"></div>
    </div>
    <div class="l-search">
      <input type="text" id="l-filter" placeholder="filter…"/>
    </div>
    <div class="l-list" id="l-list"></div>
  </aside>

  <!-- RIGHT detail -->
  <main id="right">
    ${body}
  </main>
</div>

<script nonce="${n}">
const vscode = acquireVsCodeApi();
const KIND = ${JSON.stringify(this._kind)};
const META = ${JSON.stringify(meta)};

// ── demo data per kind ─────────────────────
const DATA = {
  network: {
    pills: [
      { t: 'domain 0', active: true },
      { t: 'live 4', cls: 'ok' },
      { t: 'offline 1' }
    ],
    items: [
      { name: 'tb4-01.local', meta: '192.168.1.42 · 1ms', selected: true },
      { name: 'tb4-02.local', meta: '192.168.1.43 · —' },
      { name: 'arm-sim',      meta: '192.168.1.80 · 3ms' },
      { name: 'rasp1-drone',  meta: '192.168.1.53 · 42ms' },
      { name: 'dev-laptop',   meta: '192.168.1.10 · 1ms' },
    ],
  },
  nodes: {
    pills: [ { t: 'running 12', cls: 'ok' }, { t: 'stalled 2', cls: 'warn' } ],
    items: [
      { name: '/amcl', meta: '10 Hz · CPU 4%', selected: true },
      { name: '/nav2_bt_navigator', meta: '—' },
      { name: '/controller_server', meta: '20 Hz · CPU 8%' },
      { name: '/planner_server', meta: '5 Hz' },
      { name: '/local_costmap', meta: '2 Hz' },
      { name: '/robot_state_pub', meta: '—' },
      { name: '/map_server', meta: '—' },
    ],
  },
  topics: {
    pills: [ { t: 'all 8', active: true }, { t: 'live 6', cls: 'ok' }, { t: 'stale 2', cls: 'warn' } ],
    items: [
      { name: '/cmd_vel', meta: 'geometry_msgs/Twist · 20Hz', selected: true },
      { name: '/scan', meta: 'sensor_msgs/LaserScan · 10Hz' },
      { name: '/odom', meta: 'nav_msgs/Odometry · 30Hz' },
      { name: '/tf', meta: 'tf2_msgs/TFMessage · 50Hz' },
      { name: '/camera/image_raw', meta: 'sensor_msgs/Image · 0Hz' },
      { name: '/map', meta: 'nav_msgs/OccupancyGrid · 1Hz' },
      { name: '/imu/data', meta: 'sensor_msgs/Imu · 100Hz' },
      { name: '/goal_pose', meta: 'geometry_msgs/PoseStamped · 0Hz' },
    ],
  },
  library: {
    pills: [ { t: 'all', active: true }, { t: 'inst · 08', cls: 'ok' }, { t: 'upd · 02', cls: 'warn' } ],
    items: [
      { name: 'nav2_bringup', meta: 'ros-planning · v1.3.2', selected: true },
      { name: 'moveit2', meta: 'ros-planning · v2.10.0' },
      { name: 'realsense-ros', meta: 'IntelRealSense · v4.55.1' },
      { name: 'slam_toolbox', meta: 'SteveMacenski · v2.6.8' },
      { name: 'robot_localization', meta: 'automatic · v3.5.4' },
      { name: 'ros2_control', meta: 'ros-controls · v4.12.0' },
      { name: 'rplidar_ros', meta: 'Slamtec · v2.1.4' },
      { name: 'usb_cam', meta: 'ros-drivers · v0.8.1' },
    ],
  },
  graph:   { pills: [ { t: 'nodes 12', cls: 'ok' }, { t: 'topics 34' } ], items: [] },
  plot:    { pills: [ { t: 'live 2', cls: 'ok' } ], items: [
      { name: '/cmd_vel · linear.x', meta: 'active', selected: true },
      { name: '/cmd_vel · angular.z', meta: 'active' },
      { name: '/odom · pose.x', meta: '—' },
      { name: '/scan · ranges[0]', meta: '—' },
  ]},
  terminal:{ pills: [ { t: 'ready', cls: 'ok' } ], items: [
      { name: 'ros2 node list', meta: 'enumerate nodes' },
      { name: 'ros2 topic list', meta: 'enumerate topics' },
      { name: 'colcon build', meta: 'workspace build' },
      { name: 'ros2 bag record /scan /odom', meta: 'start bag' },
      { name: 'rviz2', meta: 'visualization' },
  ]},
};

// Render left list
(function() {
  const data = DATA[KIND] || { pills: [], items: [] };
  const pillsHost = document.getElementById('l-pills');
  pillsHost.innerHTML = (data.pills || []).map(p =>
    '<span class="l-pill ' + (p.active?'active':'') + ' ' + (p.cls||'') + '">' + p.t + '</span>'
  ).join('');
  const list = document.getElementById('l-list');
  if (!data.items.length) {
    list.innerHTML = '<div class="empty">NO ITEMS YET · connect a robot to populate</div>';
  } else {
    list.innerHTML = data.items.map(it =>
      '<div class="l-item ' + (it.selected?'active':'') + '" data-n="' + (it.name||'') + '"><span class="l-name">' + (it.name||'') + '</span><span class="l-meta">' + (it.meta||'') + '</span></div>'
    ).join('');
  }
  list.querySelectorAll('.l-item').forEach(el => {
    el.addEventListener('click', () => {
      list.querySelectorAll('.l-item').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      if (KIND === 'terminal') vscode.postMessage({ type: 'runShell', cmd: el.dataset.n });
      if (KIND === 'topics') vscode.postMessage({ type: 'echoTopic', name: el.dataset.n });
    });
  });
})();

document.getElementById('l-filter').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.l-item').forEach(el => {
    el.style.display = el.dataset.n.toLowerCase().includes(q) ? '' : 'none';
  });
});

// Buttons
document.querySelectorAll('[data-cmd]').forEach(el => {
  el.addEventListener('click', () => vscode.postMessage({ type: el.dataset.cmd, ...(el.dataset.arg ? { cmd: el.dataset.arg } : {}) }));
});

window.addEventListener('message', e => {
  const m = e.data;
  if (m.type === 'rosState') {
    // Could repaint live indicators here if desired
  }
});

vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }

  private _bodyFor(kind: PageKind): string {
    // Each kind gets its own detail-area HTML (right column).
    switch (kind) {
      case "network":
        return `
<div class="r-head">
  <div class="crumbs"><span>NET</span><span class="slash">/</span><span class="target">tb4-01.local</span><span class="live">LIVE</span></div>
  <div class="r-btns">
    <button class="btn" data-cmd="scanNetwork">↻ RESCAN</button>
    <button class="btn primary" data-cmd="openAgent">+ BRIDGE</button>
  </div>
</div>
<div class="kpis">
  <div class="kpi"><div class="k-t">DISTRO</div><div class="k-v">jazzy</div><div class="k-sub">ros 2</div></div>
  <div class="kpi"><div class="k-t">DOMAIN</div><div class="k-v">0</div><div class="k-sub">rmw · dds</div></div>
  <div class="kpi"><div class="k-t">OS</div><div class="k-v">ubuntu</div><div class="k-sub">24.04</div></div>
  <div class="kpi"><div class="k-t">BATT</div><div class="k-v">82%</div><div class="k-sub">4.2V · OK</div></div>
</div>
<div class="split-12">
  <div class="card">
    <div class="card-head">NODES · 12</div>
    <div class="card-body">
      <div class="card-row"><span class="k">/nav2_bt_navigator</span><span class="v">10Hz</span></div>
      <div class="card-row"><span class="k">/amcl</span><span class="v">10Hz</span></div>
      <div class="card-row"><span class="k">/controller_server</span><span class="v">20Hz</span></div>
      <div class="card-row"><span class="k">/planner_server</span><span class="v">5Hz</span></div>
      <div class="card-row"><span class="k">/local_costmap</span><span class="v">2Hz</span></div>
      <div class="card-row"><span class="k">/robot_state_pub</span><span class="v">—</span></div>
      <div class="card-row"><span class="k">/joint_state_pub</span><span class="v">50Hz</span></div>
      <div class="card-row"><span class="k">/map_server</span><span class="v">—</span></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head">TELEMETRY · 60s</div>
    <div class="graph-canvas" style="min-height:200px">
      <svg viewBox="0 0 300 200" preserveAspectRatio="none">
        <polyline fill="none" stroke="#f2a83b" stroke-width="1.5" points="0,120 20,100 40,130 60,80 80,140 100,60 120,110 140,40 160,130 180,70 200,150 220,90 240,50 260,120 280,80 300,100"/>
        <polyline fill="none" stroke="#6dd3c8" stroke-width="1.2" stroke-dasharray="2 3" opacity=".6" points="0,150 20,160 40,140 60,170 80,145 100,155 120,135 140,165 160,140 180,160 200,130 220,155 240,140 260,160 280,150 300,165"/>
      </svg>
    </div>
    <div class="card-body" style="font-size:10.5px">
      <span style="color:var(--accent)">●</span> CPU 34%  <span style="color:var(--accent2);margin-left:10px">●</span> MEM 28%
    </div>
  </div>
</div>`;

      case "nodes":
        return `
<div class="r-head">
  <div class="crumbs"><span>NODES</span><span class="slash">/</span><span class="target">/amcl</span><span class="live">RUNNING</span></div>
  <div class="r-btns">
    <button class="btn" data-cmd="refreshNodes">↻ REFRESH</button>
    <button class="btn" data-cmd="openAgent">◍ INSPECT</button>
  </div>
</div>
<div class="kpis">
  <div class="kpi"><div class="k-t">RATE</div><div class="k-v">10</div><div class="k-sub">Hz · nominal</div></div>
  <div class="kpi"><div class="k-t">CPU</div><div class="k-v">4%</div><div class="k-sub">avg 10s</div></div>
  <div class="kpi"><div class="k-t">MEM</div><div class="k-v">18</div><div class="k-sub">MB</div></div>
  <div class="kpi"><div class="k-t">PARAMS</div><div class="k-v">24</div><div class="k-sub">↑ 0 stale</div></div>
</div>
<div class="split-2">
  <div class="card">
    <div class="card-head">SUBSCRIPTIONS · 04</div>
    <div class="card-body">
      <div class="card-row"><span class="k">/scan</span><span class="v">sensor_msgs/LaserScan · 10Hz</span></div>
      <div class="card-row"><span class="k">/tf</span><span class="v">tf2_msgs/TFMessage · 50Hz</span></div>
      <div class="card-row"><span class="k">/map</span><span class="v">nav_msgs/OccupancyGrid · 1Hz</span></div>
      <div class="card-row"><span class="k">/initialpose</span><span class="v">PoseWithCov · —</span></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head">PUBLICATIONS · 03</div>
    <div class="card-body">
      <div class="card-row"><span class="k">/amcl_pose</span><span class="v">PoseWithCov · 10Hz</span></div>
      <div class="card-row"><span class="k">/particle_cloud</span><span class="v">ParticleCloud · 2Hz</span></div>
      <div class="card-row"><span class="k">/diagnostics</span><span class="v">DiagnosticArray · 1Hz</span></div>
    </div>
  </div>
</div>
<div class="card">
  <div class="card-head">LIVE LOGS · STREAM</div>
  <div class="log">
<span class="time">1698.122</span> <span class="ok">INFO</span>  Received initial pose
<span class="time">1698.125</span> <span class="ok">INFO</span>  Filter initialised · 500 particles
<span class="time">1698.412</span> <span class="warn">WARN</span>  scan frame 'laser' not in tf tree
<span class="time">1698.834</span> <span class="tag">DEBG</span> updateFilter took 12ms
<span class="time">1699.201</span> <span class="ok">INFO</span>  Pose: [1.42, 0.88, -0.12]
<span class="time">1699.422</span> <span class="ok">INFO</span>  Resampling (KLD-Sampling)
<span class="time">1699.833</span> <span class="tag">DEBG</span> updateFilter took 14ms
  </div>
</div>`;

      case "topics":
        return `
<div class="r-head">
  <div class="crumbs"><span>TOPICS</span><span class="slash">/</span><span class="target">/cmd_vel</span><span class="live">20 HZ</span></div>
  <div class="r-btns">
    <button class="btn" data-cmd="echoTopic" data-arg="/cmd_vel">▶ ECHO</button>
    <button class="btn primary" data-cmd="openAgent">+ PUBLISH</button>
  </div>
</div>
<div class="card">
  <div class="card-head">PLOT · 10s</div>
  <div class="graph-canvas" style="min-height:200px">
    <svg viewBox="0 0 400 180" preserveAspectRatio="none">
      <polyline fill="none" stroke="#f2a83b" stroke-width="1.8" points="0,110 20,90 40,120 60,80 80,130 100,70 120,100 140,60 160,115 180,80 200,125 220,95 240,70 260,110 280,85 300,115 320,75 340,100 360,90 380,105 400,95"/>
      <polyline fill="none" stroke="#6dd3c8" stroke-width="1.4" stroke-dasharray="3 3" points="0,140 20,130 40,150 60,120 80,145 100,135 120,150 140,125 160,140 180,130 200,150 220,125 240,135 260,140 280,125 300,140 320,130 340,150 360,125 380,140 400,135"/>
    </svg>
  </div>
  <div class="card-body" style="font-size:10.5px">
    <span style="color:var(--accent)">— linear.x</span>  <span style="color:var(--accent2);margin-left:16px">-- angular.z</span>
  </div>
</div>
<div class="split-12">
  <div class="card">
    <div class="card-head">LIVE ECHO · STREAM</div>
    <div class="log">
<span class="time">— MSG #1247 · 15:42:03.218 —</span>
linear:
  x: 0.25
  y: 0.0
  z: -0.12
angular:
  x: 0.0
  y: 0.0
  z: -0.12
<span class="time">— MSG #1248 · 15:42:03.268 —</span>
linear: ( x: 0.25, y: 0.0, z: 0.0 )
    </div>
  </div>
  <div class="card">
    <div class="card-head">PUB / SUB</div>
    <div class="card-body">
      <div class="card-row"><span class="k">publishers · 1</span><span class="v">/teleop_twist_joy</span></div>
      <div class="card-row"><span class="k">subscribers · 2</span><span class="v">/controller_server</span></div>
      <div class="card-row"><span class="k"></span><span class="v">/diff_drive_controller</span></div>
    </div>
    <div class="card-head" style="margin-top:6px">RATE · 60s</div>
    <div class="card-body">
      <div class="card-row"><span class="k">avg</span><span class="v">20.1 Hz</span></div>
      <div class="card-row"><span class="k">min</span><span class="v">18 Hz</span></div>
      <div class="card-row"><span class="k">max</span><span class="v">22 Hz</span></div>
    </div>
  </div>
</div>`;

      case "library":
        return `
<div class="r-head">
  <div class="crumbs"><span>LIB</span><span class="slash">/</span><span class="target">nav2_bringup</span><span class="live">VERIFIED</span></div>
  <div class="r-btns">
    <button class="btn primary" data-cmd="openAgent">↓ INSTALL</button>
  </div>
</div>
<div class="kpis">
  <div class="kpi"><div class="k-t">DISTRO</div><div class="k-v">jazzy</div><div class="k-sub">+ humble · iron</div></div>
  <div class="kpi"><div class="k-t">VERSION</div><div class="k-v">v1.3.2</div><div class="k-sub">APACHE 2.0</div></div>
  <div class="kpi"><div class="k-t">INSTALLS</div><div class="k-v">1.2M</div><div class="k-sub">last 30d</div></div>
  <div class="kpi"><div class="k-t">DEPS</div><div class="k-v">4</div><div class="k-sub">~18 MB</div></div>
</div>
<div class="card">
  <div class="card-head">README</div>
  <div class="card-body">
    Launch files and config for the Nav2 navigation stack — production-ready planners, controllers, behavior trees.<br/><br/>
    <span class="k" style="color:var(--fg3)"># install and launch</span><br/>
    <span style="color:var(--accent)">$</span> ros2 run nav2_bringup tb4_launch.py
  </div>
</div>
<div class="split-2">
  <div class="card">
    <div class="card-head">DEPENDENCIES · 4</div>
    <div class="card-body">
      <div class="card-row"><span class="k">nav2_common</span><span class="v">&gt;= 1.3</span></div>
      <div class="card-row"><span class="k">nav2_util</span><span class="v">&gt;= 1.3</span></div>
      <div class="card-row"><span class="k">nav2_lifecycle_manager</span><span class="v">&gt;= 1.3</span></div>
      <div class="card-row"><span class="k">launch_ros</span><span class="v">&gt;= 0.19</span></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head">ARCHITECTURE</div>
    <div class="graph-canvas" style="min-height:180px">
      <svg viewBox="0 0 400 160">
        <g fill="none" stroke="#f2a83b" stroke-width="1.2">
          <rect x="40"  y="40" width="90" height="26" rx="3"/>
          <rect x="160" y="15" width="90" height="26" rx="3"/>
          <rect x="160" y="65" width="90" height="26" rx="3"/>
          <rect x="280" y="40" width="70" height="26" rx="3"/>
        </g>
        <g fill="#f2a83b" font-family="Geist Mono" font-size="10" text-anchor="middle">
          <text x="85"  y="57">bt_navigator</text>
          <text x="205" y="32">planner_server</text>
          <text x="205" y="82">controller_server</text>
          <text x="315" y="57">costmap</text>
        </g>
        <g fill="none" stroke="#6dd3c8" stroke-width="1" stroke-dasharray="2 3">
          <line x1="130" y1="50" x2="160" y2="28"/>
          <line x1="130" y1="55" x2="160" y2="78"/>
          <line x1="250" y1="28" x2="280" y2="50"/>
          <line x1="250" y1="78" x2="280" y2="55"/>
        </g>
      </svg>
    </div>
  </div>
</div>`;

      case "graph":
        return `
<div class="r-head">
  <div class="crumbs"><span>GRAPH</span><span class="slash">/</span><span class="target">runtime</span><span class="live">LIVE</span></div>
  <div class="r-btns">
    <button class="btn" data-cmd="refreshNodes">↻ REFRESH</button>
  </div>
</div>
<div class="kpis">
  <div class="kpi"><div class="k-t">NODES</div><div class="k-v">12</div><div class="k-sub">08 running</div></div>
  <div class="kpi"><div class="k-t">TOPICS</div><div class="k-v">34</div><div class="k-sub">06 stale</div></div>
  <div class="kpi"><div class="k-t">EDGES</div><div class="k-v">78</div><div class="k-sub">pub/sub</div></div>
  <div class="kpi"><div class="k-t">SERVICES</div><div class="k-v">22</div><div class="k-sub">—</div></div>
</div>
<div class="card" style="flex:1">
  <div class="card-head">NODE GRAPH</div>
  <div class="graph-canvas" style="min-height:360px">
    <svg viewBox="0 0 600 360">
      <g fill="none" stroke="#f2a83b" stroke-width="1.3">
        <rect x="30"  y="160" width="100" height="32" rx="4"/>
        <rect x="170" y="60"  width="100" height="32" rx="4"/>
        <rect x="170" y="260" width="100" height="32" rx="4"/>
        <rect x="320" y="160" width="100" height="32" rx="4"/>
        <rect x="470" y="60"  width="100" height="32" rx="4"/>
        <rect x="470" y="260" width="100" height="32" rx="4"/>
      </g>
      <g fill="#f2a83b" font-family="Geist Mono" font-size="11" text-anchor="middle">
        <text x="80"  y="180">/robot</text>
        <text x="220" y="80">/amcl</text>
        <text x="220" y="280">/nav2_bt</text>
        <text x="370" y="180">/controller</text>
        <text x="520" y="80">/planner</text>
        <text x="520" y="280">/cmd_vel</text>
      </g>
      <g fill="none" stroke="#6dd3c8" stroke-width="1.1" stroke-dasharray="3 3">
        <line x1="130" y1="175" x2="170" y2="76"/>
        <line x1="130" y1="178" x2="170" y2="276"/>
        <line x1="270" y1="76"  x2="320" y2="175"/>
        <line x1="270" y1="276" x2="320" y2="178"/>
        <line x1="420" y1="175" x2="470" y2="76"/>
        <line x1="420" y1="178" x2="470" y2="276"/>
      </g>
    </svg>
  </div>
</div>`;

      case "plot":
        return `
<div class="r-head">
  <div class="crumbs"><span>PLOT</span><span class="slash">/</span><span class="target">/cmd_vel · linear.x</span><span class="live">LIVE</span></div>
  <div class="r-btns">
    <button class="btn" data-cmd="refreshNodes">↻ REFRESH</button>
  </div>
</div>
<div class="card" style="flex:1">
  <div class="card-head">REAL-TIME · 30s WINDOW</div>
  <div class="graph-canvas" style="min-height:380px">
    <svg viewBox="0 0 600 380" preserveAspectRatio="none">
      <line x1="0" y1="190" x2="600" y2="190" stroke="#22282660" stroke-dasharray="2 4"/>
      <polyline fill="none" stroke="#f2a83b" stroke-width="1.8" points="0,230 30,180 60,200 90,160 120,210 150,150 180,190 210,140 240,200 270,155 300,195 330,145 360,205 390,160 420,200 450,140 480,185 510,150 540,195 570,155 600,180"/>
      <polyline fill="none" stroke="#6dd3c8" stroke-width="1.2" stroke-dasharray="3 3" points="0,260 30,250 60,270 90,230 120,260 150,240 180,270 210,235 240,265 270,245 300,275 330,230 360,260 390,250 420,270 450,235 480,265 510,245 540,270 570,240 600,255"/>
    </svg>
  </div>
  <div class="card-body" style="font-size:10.5px">
    <span style="color:var(--accent)">— linear.x</span>  <span style="color:var(--accent2);margin-left:16px">-- angular.z</span>
    <span style="float:right">min -0.2 · max 0.8 · avg 0.32</span>
  </div>
</div>`;

      case "terminal":
        return `
<div class="r-head">
  <div class="crumbs"><span>TRM</span><span class="slash">/</span><span class="target">ros 2 console</span><span class="live">READY</span></div>
  <div class="r-btns">
    <button class="btn primary" data-cmd="openTerminal">+ NEW TERMINAL</button>
  </div>
</div>
<div class="card">
  <div class="card-head">QUICK COMMANDS</div>
  <div class="card-body">
    Pick from the left list or hit <code style="color:var(--accent)">Ctrl+\`</code> to open a new shell.
    All commands use the workspace's sourced environment (Humble / Jazzy / Iron).
  </div>
</div>
<div class="card" style="flex:1">
  <div class="card-head">OUTPUT · READY</div>
  <div class="log">
<span class="time">roscode@studio</span>:<span class="tag">~/ros2_ws</span>$ source install/setup.bash
<span class="ok">OK</span>  sourced
<span class="time">roscode@studio</span>:<span class="tag">~/ros2_ws</span>$ ros2 daemon status
<span class="ok">OK</span>  running · rmw_fastrtps_cpp · domain 0
  </div>
</div>`;
    }
  }
}
