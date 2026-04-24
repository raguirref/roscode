import * as vscode from "vscode";
import type { RosConnection } from "../ros/connection";

export class TopicMonitorPanel {
  static currentPanel: TopicMonitorPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _stopEcho: (() => void) | undefined;

  static createOrShow(context: vscode.ExtensionContext, ros: RosConnection, topicName?: string) {
    if (TopicMonitorPanel.currentPanel) {
      TopicMonitorPanel.currentPanel._panel.reveal();
      if (topicName) TopicMonitorPanel.currentPanel._startEcho(topicName, ros);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "roscode.topicMonitor",
      "Topic Monitor",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    const instance = new TopicMonitorPanel(panel, ros);
    TopicMonitorPanel.currentPanel = instance;
    if (topicName) instance._startEcho(topicName, ros);
  }

  private constructor(panel: vscode.WebviewPanel, private readonly ros: RosConnection) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => {
      this._stopEcho?.();
      TopicMonitorPanel.currentPanel = undefined;
    });
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "subscribe") this._startEcho(msg.topic, ros);
      else if (msg.type === "unsubscribe") { this._stopEcho?.(); this._stopEcho = undefined; }
      else if (msg.type === "ready") {
        const topics = await ros.listTopics();
        this._panel.webview.postMessage({ type: "topicList", topics });
      }
    });
  }

  private _startEcho(topic: string, ros: RosConnection) {
    this._stopEcho?.();
    this._panel.webview.postMessage({ type: "subscribed", topic });
    this._stopEcho = ros.echoTopic(topic, (data) => {
      this._panel.webview.postMessage({ type: "data", topic, data });
    });
  }

  private _getHtml(): string {
    const nonce = getNonce();
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);display:flex;flex-direction:column;height:100vh}
#toolbar{padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap}
select{background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border:1px solid var(--vscode-dropdown-border);border-radius:3px;padding:4px 8px;font-size:12px;min-width:200px}
button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:3px;padding:4px 12px;cursor:pointer;font-size:12px}
button:hover{background:var(--vscode-button-hoverBackground)}
button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
#hz{font-size:11px;color:var(--vscode-textLink-foreground);margin-left:4px}
#output{flex:1;overflow-y:auto;padding:10px 14px;font-family:var(--vscode-editor-font-family);font-size:12px;line-height:1.5}
.entry{border-bottom:1px solid var(--vscode-panel-border);padding:6px 0;display:grid;grid-template-columns:auto 1fr;gap:0 10px}
.ts{color:var(--vscode-descriptionForeground);font-size:10px;white-space:nowrap;padding-top:1px}
.payload{white-space:pre-wrap;word-break:break-all;color:var(--vscode-terminal-foreground,var(--vscode-editor-foreground))}
#empty{display:flex;align-items:center;justify-content:center;flex:1;color:var(--vscode-descriptionForeground)}
</style>
</head>
<body>
<div id="toolbar">
  <select id="topicSelect"><option value="">— select a topic —</option></select>
  <button id="subBtn">Subscribe</button>
  <button id="clearBtn" class="secondary">Clear</button>
  <span id="hz"></span>
  <span id="topicLabel" style="font-size:11px;color:var(--vscode-descriptionForeground);margin-left:auto"></span>
</div>
<div id="empty">Select a topic to monitor</div>
<div id="output" style="display:none"></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const sel = document.getElementById('topicSelect');
const subBtn = document.getElementById('subBtn');
const clearBtn = document.getElementById('clearBtn');
const output = document.getElementById('output');
const empty = document.getElementById('empty');
const hzEl = document.getElementById('hz');
const topicLabel = document.getElementById('topicLabel');

let subscribed = false, msgCount = 0, lastHz = Date.now();
const MAX_ENTRIES = 200;

subBtn.onclick = () => {
  const t = sel.value; if(!t) return;
  if(subscribed){ vscode.postMessage({type:'unsubscribe'}); subBtn.textContent='Subscribe'; subscribed=false; topicLabel.textContent=''; hzEl.textContent=''; return; }
  vscode.postMessage({type:'subscribe', topic:t});
};
clearBtn.onclick = () => { output.innerHTML=''; };

function appendEntry(data) {
  if(output.style.display==='none'){ output.style.display='block'; empty.style.display='none'; }
  const d = document.createElement('div'); d.className='entry';
  const now = new Date(); const ts = now.toTimeString().split(' ')[0]+'.'+String(now.getMilliseconds()).padStart(3,'0');
  d.innerHTML='<span class="ts">'+ts+'</span><span class="payload">'+esc(data.trim())+'</span>';
  output.prepend(d);
  // Limit entries
  while(output.children.length > MAX_ENTRIES) output.removeChild(output.lastChild);
  // Hz calc
  msgCount++;
  const now2 = Date.now();
  if(now2 - lastHz >= 1000){ hzEl.textContent = msgCount.toFixed(0)+' msg/s'; msgCount=0; lastHz=now2; }
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

window.addEventListener('message', e => {
  const m = e.data;
  if(m.type==='topicList'){
    sel.innerHTML='<option value="">— select a topic —</option>'+m.topics.map(t=>'<option value="'+esc(t.name)+'">'+esc(t.name)+'</option>').join('');
  } else if(m.type==='subscribed'){
    subscribed=true; subBtn.textContent='Unsubscribe'; topicLabel.textContent=m.topic; output.innerHTML=''; output.style.display='block'; empty.style.display='none';
  } else if(m.type==='data'){
    appendEntry(m.data);
  }
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
