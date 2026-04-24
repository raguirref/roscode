import * as vscode from "vscode";
import { RosConnection } from "../ros/connection";

function nonce() {
  let n = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) n += c[Math.floor(Math.random() * c.length)];
  return n;
}

export class PlotView implements vscode.WebviewViewProvider {
  public static readonly viewType = "roscode.plot";
  private _view?: vscode.WebviewView;
  private _interval?: NodeJS.Timeout;
  private _topic = "";
  private _field = "";
  private _mock = true;

  constructor(private readonly _context: vscode.ExtensionContext, private readonly _ros: RosConnection) {}

  resolveWebviewView(webview: vscode.WebviewView) {
    this._view = webview;
    webview.webview.options = { enableScripts: true, localResourceRoots: [this._context.extensionUri] };
    webview.webview.html = this._html(webview.webview);
    webview.webview.onDidReceiveMessage((m) => this._handle(m));
    webview.onDidDispose(() => this._stop());
  }

  private _handle(m: any) {
    if (m.type === "start") {
      this._topic = String(m.topic || "").trim();
      this._field = String(m.field || "").trim();
      this._mock = !this._ros.connectedHost;
      this._start();
    } else if (m.type === "stop") {
      this._stop();
    }
  }

  private _start() {
    this._stop();
    this._post({ type: "started", topic: this._topic, field: this._field, mock: this._mock });
    let t = 0;
    this._interval = setInterval(async () => {
      t++;
      let value: number | null = null;
      if (this._mock || !this._topic) {
        // Synthetic data so the demo works cold (sine + noise)
        value = Math.sin(t * 0.2) * 0.5 + Math.random() * 0.15;
      } else {
        try {
          const yaml = await this._ros.echoTopicOnce(this._topic);
          value = this._extractField(yaml, this._field);
        } catch {
          value = null;
        }
      }
      if (value !== null && isFinite(value)) {
        this._post({ type: "sample", t: Date.now(), value });
      }
    }, 200);
  }

  private _stop() {
    if (this._interval) clearInterval(this._interval);
    this._interval = undefined;
    this._post({ type: "stopped" });
  }

  private _post(msg: object) {
    this._view?.webview.postMessage(msg);
  }

  // Parse YAML-ish ros2 topic echo output and pull out a numeric field by dotted path.
  // Examples: "linear.x", "position.z", "ranges[0]"
  private _extractField(yaml: string, path: string): number | null {
    if (!yaml) return null;
    if (!path) {
      // If no field specified, try to find the first number anywhere
      const m = yaml.match(/:\s*(-?\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]) : null;
    }
    const parts = path.split(".");
    const leaf = parts[parts.length - 1];
    // Build regex that finds "leaf: <number>"
    const re = new RegExp(`\\b${leaf}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`);
    const m = yaml.match(re);
    return m ? parseFloat(m[1]) : null;
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
    --ok: #8bc34a;
    --warn: #f2c84b;
    --err: #e06666;
    --mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg-0); color: var(--fg-0); font-family: var(--mono); font-size: 12px; padding: 10px; }
  .hd { font-size: 10px; color: var(--fg-2); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
  .row { display: flex; gap: 6px; margin-bottom: 6px; }
  input {
    flex: 1; padding: 6px 8px;
    background: var(--bg-1); color: var(--fg-0);
    border: 1px solid var(--border-bright); border-radius: 4px;
    font-family: var(--mono); font-size: 11px;
  }
  input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-dim); }
  input::placeholder { color: var(--fg-2); }
  button {
    padding: 6px 10px; border: 1px solid var(--border-bright); border-radius: 4px;
    background: transparent; color: var(--fg-0); cursor: pointer;
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase;
    transition: border-color 120ms, background 120ms;
  }
  button:hover { border-color: var(--accent); color: var(--accent); }
  button.primary { background: var(--accent); color: #1a1408; border-color: var(--accent); font-weight: 600; }
  button.primary:hover { background: var(--accent); color: #1a1408; opacity: 0.9; }
  button:disabled { opacity: 0.35; cursor: default; }

  .status-line {
    display: flex; gap: 10px; align-items: center;
    padding: 5px 8px; margin: 6px 0 8px;
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 10px; color: var(--fg-2); letter-spacing: 0.5px;
  }
  .status-line .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fg-2); }
  .status-line.live .dot { background: var(--ok); box-shadow: 0 0 6px var(--ok); animation: pulse 1s ease-in-out infinite; }
  .status-line.mock .dot { background: var(--warn); }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .chart-wrap {
    position: relative;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px;
    margin-bottom: 8px;
  }
  canvas { display: block; width: 100%; height: 180px; }
  .chart-label {
    position: absolute; top: 8px; left: 10px;
    font-size: 9px; color: var(--fg-2); letter-spacing: 1.5px;
    text-transform: uppercase;
    pointer-events: none;
  }
  .chart-badge {
    position: absolute; top: 8px; right: 10px;
    font-size: 9px; color: var(--accent); letter-spacing: 0.5px;
  }

  .stats {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
  }
  .stat {
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 4px; padding: 6px 8px;
  }
  .stat-k { font-size: 9px; color: var(--fg-2); letter-spacing: 1px; text-transform: uppercase; }
  .stat-v { font-size: 14px; color: var(--fg-0); margin-top: 2px; font-weight: 500; }
  .stat.accent .stat-v { color: var(--accent); }
  .stat.ok .stat-v { color: var(--ok); }

  .hint { font-size: 9.5px; color: var(--fg-2); margin-top: 6px; line-height: 1.5; letter-spacing: 0.3px; }
  .hint code { background: var(--bg-1); padding: 1px 4px; border-radius: 2px; color: var(--accent); font-size: 10px; }
</style>
</head>
<body>
  <div class="hd">// LIVE PLOT · topic sampler</div>

  <div class="row">
    <input id="topic" placeholder="/cmd_vel" autocomplete="off"/>
  </div>
  <div class="row">
    <input id="field" placeholder="linear.x (optional)" autocomplete="off"/>
  </div>
  <div class="row">
    <button id="start" class="primary">▶ START</button>
    <button id="stop">■ STOP</button>
    <button id="clear">⟲ CLR</button>
  </div>

  <div class="status-line" id="status">
    <span class="dot"></span>
    <span id="status-text">IDLE · enter topic and press start</span>
  </div>

  <div class="chart-wrap">
    <div class="chart-label" id="chart-label">— no signal —</div>
    <div class="chart-badge" id="chart-rate"></div>
    <canvas id="chart"></canvas>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-k">SAMPLES</div><div class="stat-v" id="s-count">0</div></div>
    <div class="stat accent"><div class="stat-k">LATEST</div><div class="stat-v" id="s-latest">—</div></div>
    <div class="stat"><div class="stat-k">MIN</div><div class="stat-v" id="s-min">—</div></div>
    <div class="stat"><div class="stat-k">MAX</div><div class="stat-v" id="s-max">—</div></div>
  </div>

  <div class="hint">
    Sampled at 5 Hz via <code>ros2 topic echo --once</code>. For vector messages use dotted fields<br/>
    e.g. <code>linear.x</code>, <code>position.z</code>, <code>pose.pose.position.x</code>.<br/>
    If no robot is connected, synthetic sine+noise data is shown for demo.
  </div>

<script nonce="${n}">
  const vscode = acquireVsCodeApi();

  const ui = {
    topic: document.getElementById("topic"),
    field: document.getElementById("field"),
    startBtn: document.getElementById("start"),
    stopBtn: document.getElementById("stop"),
    clearBtn: document.getElementById("clear"),
    canvas: document.getElementById("chart"),
    status: document.getElementById("status"),
    statusText: document.getElementById("status-text"),
    chartLabel: document.getElementById("chart-label"),
    chartRate: document.getElementById("chart-rate"),
    sCount: document.getElementById("s-count"),
    sLatest: document.getElementById("s-latest"),
    sMin: document.getElementById("s-min"),
    sMax: document.getElementById("s-max"),
  };

  const ctx = ui.canvas.getContext("2d");
  const samples = []; // { t, v }
  const MAX = 200;
  let running = false;
  let t0 = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = ui.canvas.getBoundingClientRect();
    ui.canvas.width = rect.width * dpr;
    ui.canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    draw();
  }

  function fmt(v) {
    if (v === null || v === undefined) return "—";
    const abs = Math.abs(v);
    if (abs === 0) return "0";
    if (abs < 0.01 || abs >= 10000) return v.toExponential(2);
    return v.toFixed(abs < 1 ? 3 : 2);
  }

  function draw() {
    const W = ui.canvas.width / (window.devicePixelRatio || 1);
    const H = ui.canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, W, H);

    // background dot grid
    ctx.fillStyle = "#333b38";
    const step = 24;
    for (let x = step; x < W; x += step) {
      for (let y = step; y < H; y += step) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    if (samples.length < 2) return;

    // find range
    let minV = Infinity, maxV = -Infinity;
    for (const s of samples) {
      if (s.v < minV) minV = s.v;
      if (s.v > maxV) maxV = s.v;
    }
    if (minV === maxV) { minV -= 0.5; maxV += 0.5; }
    const pad = (maxV - minV) * 0.1;
    minV -= pad; maxV += pad;

    // center axis
    ctx.strokeStyle = "#22282690";
    ctx.lineWidth = 1;
    if (minV <= 0 && maxV >= 0) {
      const yZero = H - ((0 - minV) / (maxV - minV)) * H;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, yZero); ctx.lineTo(W, yZero);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // line
    ctx.strokeStyle = "#f2a83b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = (i / (MAX - 1)) * W;
      const y = H - ((s.v - minV) / (maxV - minV)) * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // glow on last point
    const last = samples[samples.length - 1];
    const lastX = ((samples.length - 1) / (MAX - 1)) * W;
    const lastY = H - ((last.v - minV) / (maxV - minV)) * H;
    ctx.fillStyle = "#f2a83b";
    ctx.shadowColor = "rgba(242, 168, 59, 0.6)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // min/max labels
    ctx.fillStyle = "#636862";
    ctx.font = "9px 'Geist Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(fmt(maxV), W - 4, 10);
    ctx.fillText(fmt(minV), W - 4, H - 2);
  }

  function updateStats() {
    ui.sCount.textContent = samples.length;
    if (samples.length === 0) {
      ui.sLatest.textContent = ui.sMin.textContent = ui.sMax.textContent = "—";
      return;
    }
    const vals = samples.map(s => s.v);
    const latest = vals[vals.length - 1];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    ui.sLatest.textContent = fmt(latest);
    ui.sMin.textContent = fmt(min);
    ui.sMax.textContent = fmt(max);
  }

  ui.startBtn.addEventListener("click", () => {
    const topic = ui.topic.value.trim();
    if (!topic) { ui.topic.focus(); return; }
    samples.length = 0;
    t0 = Date.now();
    vscode.postMessage({ type: "start", topic, field: ui.field.value.trim() });
  });
  ui.stopBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "stop" });
  });
  ui.clearBtn.addEventListener("click", () => {
    samples.length = 0;
    draw();
    updateStats();
  });

  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (m.type === "started") {
      running = true;
      ui.status.classList.remove("mock");
      ui.status.classList.add(m.mock ? "mock" : "live");
      ui.statusText.textContent = m.mock
        ? "MOCK · synthetic data (no robot connected)"
        : "LIVE · " + m.topic;
      ui.chartLabel.textContent = m.topic + (m.field ? " · " + m.field : "");
    } else if (m.type === "stopped") {
      running = false;
      ui.status.classList.remove("live", "mock");
      ui.statusText.textContent = "STOPPED";
      ui.chartRate.textContent = "";
    } else if (m.type === "sample") {
      samples.push({ t: m.t, v: m.value });
      if (samples.length > MAX) samples.shift();
      draw();
      updateStats();
      if (samples.length >= 2) {
        const dt = (samples[samples.length - 1].t - samples[0].t) / 1000;
        const hz = dt > 0 ? (samples.length / dt).toFixed(1) : "—";
        ui.chartRate.textContent = hz + " Hz";
      }
    }
  });

  window.addEventListener("resize", resize);
  resize();
</script>
</body>
</html>
`;
  }
}
