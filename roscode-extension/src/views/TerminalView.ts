import * as vscode from "vscode";

function nonce() {
  let n = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) n += c[Math.floor(Math.random() * c.length)];
  return n;
}

export class TerminalView implements vscode.WebviewViewProvider {
  public static readonly viewType = "roscode.terminal";
  private _view?: vscode.WebviewView;
  private _onVisCb?: () => void;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  onVisibilityChange(cb: () => void) { this._onVisCb = cb; }

  resolveWebviewView(webview: vscode.WebviewView) {
    this._view = webview;
    webview.webview.options = { enableScripts: true, localResourceRoots: [this._context.extensionUri] };
    webview.webview.html = this._html(webview.webview);
    webview.webview.onDidReceiveMessage((m) => this._handle(m));
    webview.onDidChangeVisibility(() => { if (webview.visible) this._onVisCb?.(); });
    if (webview.visible) this._onVisCb?.();
  }

  private _handle(m: any) {
    if (m.type === "open") {
      vscode.commands.executeCommand("workbench.action.terminal.toggleTerminal");
    } else if (m.type === "run") {
      this._runInTerminal(String(m.cmd || ""));
    } else if (m.type === "new") {
      this._runInTerminal("", true);
    }
  }

  private _runInTerminal(cmd: string, alwaysCreate = false) {
    let term = vscode.window.activeTerminal;
    if (!term || alwaysCreate) {
      term = vscode.window.createTerminal({ name: "roscode · terminal" });
    }
    term.show();
    if (cmd) {
      term.sendText(cmd);
    }
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
    --teal: #6dd3c8;
    --mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg-0); color: var(--fg-0); font-family: var(--mono); font-size: 11px; padding: 8px; }
  .hd { font-size: 10px; color: var(--fg-2); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
  .hd-accent { color: var(--accent); }

  .hero {
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 4px; padding: 14px 12px;
    display: flex; flex-direction: column; gap: 10px;
    margin-bottom: 12px;
  }
  .hero-title {
    font-size: 13px; font-weight: 600; color: var(--fg-0);
    letter-spacing: 0.3px; text-transform: uppercase;
  }
  .hero-sub {
    font-size: 10.5px; color: var(--fg-2); line-height: 1.5;
  }
  button {
    padding: 7px 10px;
    border: 1px solid var(--border-bright);
    border-radius: 4px; background: transparent; color: var(--fg-0);
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.5px;
    text-transform: uppercase; cursor: pointer;
    transition: border-color 120ms, background 120ms, color 120ms;
    display: flex; align-items: center; gap: 6px;
    justify-content: flex-start;
  }
  button:hover { border-color: var(--accent); color: var(--accent); }
  button.primary {
    background: var(--accent); color: #1a1408; border-color: var(--accent);
    font-weight: 600; justify-content: center;
  }
  button.primary:hover { opacity: 0.9; background: var(--accent); color: #1a1408; }

  .row { display: flex; gap: 6px; }

  .section {
    margin-top: 14px;
  }
  .cmd-list { display: flex; flex-direction: column; gap: 4px; }
  .cmd {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 9px;
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: 3px; cursor: pointer;
    font-family: var(--mono); font-size: 10.5px;
    color: var(--fg-0);
    transition: all 120ms;
  }
  .cmd:hover {
    border-color: var(--accent-line);
    background: var(--accent-dim);
    color: var(--accent);
  }
  .cmd-prompt { color: var(--accent); flex-shrink: 0; }
  .cmd-text { flex: 1; font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cmd-desc {
    font-size: 9px; color: var(--fg-2); letter-spacing: 0.3px;
    flex-shrink: 0; text-transform: uppercase;
  }

  .hint {
    font-size: 9.5px; color: var(--fg-2);
    margin-top: 10px; line-height: 1.5; letter-spacing: 0.3px;
  }
  kbd {
    background: var(--bg-1); border: 1px solid var(--border-bright);
    border-radius: 2px; padding: 1px 5px;
    font-family: var(--mono); font-size: 9px; color: var(--fg-1);
  }
</style>
</head>
<body>
  <div class="hd"><span class="hd-accent">// TERMINAL</span> · ROS 2 SHELL</div>

  <div class="hero">
    <div class="hero-title">Integrated terminal</div>
    <div class="hero-sub">
      Spawn a shell with the roscode environment. ROS 2 sourced automatically when connected.
    </div>
    <div class="row">
      <button class="primary" id="open">▶ OPEN TERMINAL</button>
      <button id="new">＋ NEW</button>
    </div>
  </div>

  <div class="hd">ROS 2 QUICK COMMANDS</div>
  <div class="cmd-list">
    <div class="cmd" data-cmd="ros2 node list">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">ros2 node list</span>
      <span class="cmd-desc">nodes</span>
    </div>
    <div class="cmd" data-cmd="ros2 topic list -t">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">ros2 topic list -t</span>
      <span class="cmd-desc">topics</span>
    </div>
    <div class="cmd" data-cmd="ros2 topic echo /cmd_vel">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">ros2 topic echo /cmd_vel</span>
      <span class="cmd-desc">echo</span>
    </div>
    <div class="cmd" data-cmd="ros2 topic hz /scan">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">ros2 topic hz /scan</span>
      <span class="cmd-desc">rate</span>
    </div>
    <div class="cmd" data-cmd="ros2 param list">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">ros2 param list</span>
      <span class="cmd-desc">params</span>
    </div>
    <div class="cmd" data-cmd="ros2 run rqt_graph rqt_graph">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">ros2 run rqt_graph rqt_graph</span>
      <span class="cmd-desc">rqt</span>
    </div>
    <div class="cmd" data-cmd="colcon build --symlink-install">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">colcon build --symlink-install</span>
      <span class="cmd-desc">build</span>
    </div>
    <div class="cmd" data-cmd="source install/setup.bash">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">source install/setup.bash</span>
      <span class="cmd-desc">env</span>
    </div>
    <div class="cmd" data-cmd="ros2 launch">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">ros2 launch &lt;pkg&gt; &lt;file&gt;</span>
      <span class="cmd-desc">launch</span>
    </div>
    <div class="cmd" data-cmd="ros2 bag record -a">
      <span class="cmd-prompt">❯</span>
      <span class="cmd-text">ros2 bag record -a</span>
      <span class="cmd-desc">bag</span>
    </div>
  </div>

  <div class="hint">
    Click a command to send it to the active terminal. Shortcut: <kbd>Ctrl ~</kbd> toggles terminal.
  </div>

<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  document.getElementById("open").addEventListener("click", () => {
    vscode.postMessage({ type: "open" });
  });
  document.getElementById("new").addEventListener("click", () => {
    vscode.postMessage({ type: "new" });
  });
  document.querySelectorAll(".cmd").forEach((el) => {
    el.addEventListener("click", () => {
      vscode.postMessage({ type: "run", cmd: el.getAttribute("data-cmd") });
    });
  });
</script>
</body>
</html>
`;
  }
}
