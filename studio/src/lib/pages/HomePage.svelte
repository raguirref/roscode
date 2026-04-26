<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    workspacePath,
    isRuntimeReady,
    showNewPackageModal,
    activePage,
    chatMessages,
    rightPanelOpen,
    openFile,
    activeFile,
  } from "../stores/layout";
  import { rosCallTool, parseRosGraph, fsReadDir, fsReadFile } from "../tauri";

  // ── Live ROS graph stats ────────────────────────────────────────────────────
  let nodeCount: number | null = null;
  let topicCount: number | null = null;
  let serviceCount: number | null = null;
  let lastRefresh = "";
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let pollErr = "";

  async function refreshStats() {
    if (!$isRuntimeReady) return;
    try {
      const raw = await rosCallTool("ros_graph", {});
      const parsed = parseRosGraph(raw);
      nodeCount = parsed.nodes.length;
      topicCount = parsed.topics.length;
      serviceCount = parsed.services.length;
      lastRefresh = new Date().toLocaleTimeString();
      pollErr = "";
    } catch (e) {
      pollErr = String(e).slice(0, 60);
    }
  }

  onMount(() => {
    refreshStats();
    pollInterval = setInterval(refreshStats, 12_000);
  });
  onDestroy(() => { if (pollInterval) clearInterval(pollInterval); });

  $: if ($isRuntimeReady && nodeCount === null) refreshStats();

  // ── Workspace package list (src/) ───────────────────────────────────────────
  interface PackageDir { name: string; path: string; }
  let packages: PackageDir[] = [];
  let pkgErr = "";

  async function loadPackages(ws: string) {
    if (!ws) { packages = []; return; }
    try {
      const srcEntries = await fsReadDir(`${ws}/src`).catch(() => fsReadDir(ws));
      packages = srcEntries.filter((e) => e.is_dir).map((e) => ({ name: e.name, path: e.path }));
      pkgErr = "";
    } catch (e) {
      pkgErr = String(e).slice(0, 80);
      packages = [];
    }
  }

  $: loadPackages($workspacePath);

  // ── Open a package's package.xml in the editor ──────────────────────────────
  async function openPackage(p: PackageDir) {
    try {
      const xmlPath = `${p.path}/package.xml`;
      const content = await fsReadFile(xmlPath);
      openFile({
        path: xmlPath,
        name: "package.xml",
        language: "xml",
        content,
        dirty: false,
      });
      activeFile.set(xmlPath);
      activePage.set("files");
    } catch {
      activePage.set("files");
    }
  }

  // ── Quick agent prompts ─────────────────────────────────────────────────────
  function ask(prompt: string) {
    chatMessages.update((ms) => [...ms, { kind: "user", text: prompt }]);
    rightPanelOpen.set(true);
  }

  function buildWorkspace() {
    ask("Build the colcon workspace and report the result.");
  }

  function inspectGraph() {
    activePage.set("nodes");
  }

  // ── Header data ─────────────────────────────────────────────────────────────
  $: wsName = $workspacePath ? ($workspacePath.split("/").pop() ?? "workspace") : "no workspace";
  $: shortPath = $workspacePath
    ? $workspacePath.replace(`/Users/${($workspacePath.split("/")[2] ?? "")}`, "~")
    : "";
</script>

<div class="page">
  <div class="bp-grid grid-bg"></div>

  <!-- ═══ Header ═══ -->
  <div class="ws-header">
    <div>
      <div class="label-sm accent">// WORKSPACE</div>
      <div class="ws-name">{wsName}</div>
      <div class="ws-meta">
        {#if $workspacePath}
          {shortPath}
          &nbsp;·&nbsp;
          {#if $isRuntimeReady}
            <span class="ok">runtime live</span>
          {:else}
            <span class="warn">runtime offline</span>
          {/if}
        {:else}
          no workspace open — return to welcome
        {/if}
      </div>
    </div>
    <div class="header-actions">
      <button class="btn-sm" on:click={() => showNewPackageModal.set(true)}>+ new package</button>
      <button class="btn-sm" on:click={buildWorkspace} disabled={!$isRuntimeReady}>⌘ build</button>
      <button class="btn-sm btn-primary" on:click={inspectGraph} disabled={!$isRuntimeReady}>inspect graph →</button>
    </div>
  </div>

  <!-- ═══ Live stats ═══ -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-label">NODES</div>
      <div class="stat-val accent">{nodeCount ?? "—"}</div>
      <div class="stat-sub">{$isRuntimeReady ? (lastRefresh || "polling…") : "OFFLINE"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">TOPICS</div>
      <div class="stat-val">{topicCount ?? "—"}</div>
      <div class="stat-sub">{$isRuntimeReady ? "via ros_graph" : "OFFLINE"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">SERVICES</div>
      <div class="stat-val">{serviceCount ?? "—"}</div>
      <div class="stat-sub">{$isRuntimeReady ? "via ros_graph" : "OFFLINE"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">PACKAGES</div>
      <div class="stat-val ok">{packages.length}</div>
      <div class="stat-sub">in {packages.length === 0 ? "src/" : "workspace"}</div>
    </div>
  </div>

  <!-- ═══ Two-column body ═══ -->
  <div class="two-col">
    <!-- Left: workspace packages -->
    <div class="panel">
      <div class="panel-header">
        <span class="mono-label">WORKSPACE PACKAGES</span>
        <button class="link-btn" on:click={() => showNewPackageModal.set(true)}>+ NEW</button>
      </div>
      <div class="pkg-list">
        {#if !$workspacePath}
          <div class="empty">No workspace open.</div>
        {:else if pkgErr}
          <div class="empty err">{pkgErr}</div>
        {:else if packages.length === 0}
          <div class="empty">
            No packages found in <code>src/</code>.
            <br/>
            <button class="inline-link" on:click={() => showNewPackageModal.set(true)}>
              + scaffold your first package
            </button>
          </div>
        {:else}
          {#each packages as p}
            <button class="pkg-row" on:click={() => openPackage(p)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8l-9 5-9-5M21 8v8l-9 5-9-5V8M21 8l-9-5-9 5"/></svg>
              <span class="pkg-name">{p.name}</span>
              <span class="pkg-arrow">→</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Right: quick actions -->
    <div class="panel">
      <div class="panel-header">
        <span class="mono-label">QUICK ACTIONS</span>
      </div>
      <div class="actions-grid">
        <button class="action" on:click={() => activePage.set("files")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 012-2h4l2 2h9a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
          <div>
            <div class="action-label">FILES</div>
            <div class="action-sub">browse + edit code</div>
          </div>
        </button>

        <button class="action" on:click={() => activePage.set("nodes")} disabled={!$isRuntimeReady}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>
          <div>
            <div class="action-label">NODES</div>
            <div class="action-sub">{nodeCount !== null ? `${nodeCount} live` : "runtime offline"}</div>
          </div>
        </button>

        <button class="action" on:click={() => activePage.set("topics")} disabled={!$isRuntimeReady}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7l8 4 8-4"/><path d="M4 12l8 4 8-4"/><path d="M4 17l8 4 8-4"/></svg>
          <div>
            <div class="action-label">TOPICS</div>
            <div class="action-sub">{topicCount !== null ? `${topicCount} live` : "runtime offline"}</div>
          </div>
        </button>

        <button class="action" on:click={() => activePage.set("library")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 4h11a2 2 0 012 2v13H7a2 2 0 00-2 2V4z"/><path d="M5 4v16"/></svg>
          <div>
            <div class="action-label">LIBRARY</div>
            <div class="action-sub">install ROS packages</div>
          </div>
        </button>

        <button class="action" on:click={() => activePage.set("terminal")} disabled={!$isRuntimeReady}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10l3 2-3 2M12 15h5"/></svg>
          <div>
            <div class="action-label">TERMINAL</div>
            <div class="action-sub">{$isRuntimeReady ? "container shell" : "runtime offline"}</div>
          </div>
        </button>

        <button class="action accent-action" on:click={() => showNewPackageModal.set(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
          <div>
            <div class="action-label">NEW PACKAGE</div>
            <div class="action-sub">scaffold ament_python</div>
          </div>
        </button>
      </div>
    </div>
  </div>

  <!-- ═══ Quick-ask agent strip ═══ -->
  <div class="panel ask-panel">
    <div class="panel-header">
      <span class="mono-label">ASK THE AGENT</span>
      {#if !$isRuntimeReady}
        <span class="warn-pill">runtime offline</span>
      {/if}
    </div>
    <div class="ask-grid">
      {#each [
        ["describe the ROS graph", "Describe the current ROS graph: list every node, the topics it publishes/subscribes to, and any services."],
        ["why is /tf drifting?", "Inspect the /tf tree, look at recent rates and any errors in /rosout, and explain why frames may be drifting."],
        ["tune Nav2 PID", "Look at the controller_server parameters and propose PID gains for stable holonomic motion using the relay-autotune procedure."],
        ["audit safety", "Audit my workspace for any node that publishes /cmd_vel without subscribing to /obstacle_detected and propose a fix."],
      ] as [label, prompt]}
        <button class="ask-card" on:click={() => ask(prompt)} disabled={!$isRuntimeReady}>
          <span class="ask-bullet">›</span>
          <span class="ask-text">{label}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .page {
    flex: 1; overflow-y: auto;
    padding: 24px 28px;
    display: flex; flex-direction: column; gap: 14px;
    position: relative; min-height: 0;
  }
  .grid-bg { position:absolute; inset:0; opacity:.3; pointer-events:none; }

  .ws-header { display:flex; align-items:flex-end; justify-content:space-between; position:relative; gap:14px; }
  .ws-name { font-size:28px; font-weight:600; letter-spacing:-.6px; margin-top:4px; }
  .ws-meta { font-family:var(--font-mono); font-size:11px; color:var(--fg-2); margin-top:4px; }
  .header-actions { display:flex; gap:8px; flex-shrink:0; }
  .label-sm { font-family:var(--font-mono); font-size:10px; letter-spacing:2px; text-transform:uppercase; }
  .accent { color:var(--accent); }
  .ok { color:var(--ok); }
  .warn { color:var(--warn); }
  .err { color:var(--err); }

  .stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; position:relative; }
  .stat-card { background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius); padding:14px 16px; }
  .stat-label { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:1.5px; }
  .stat-val { font-family:var(--font-mono); font-size:30px; line-height:1; margin-top:8px; font-weight:500; color:var(--fg-0); }
  .stat-val.accent { color:var(--accent); }
  .stat-val.ok { color:var(--ok); }
  .stat-sub { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); margin-top:6px; letter-spacing:.5px; }

  .two-col { display:grid; grid-template-columns:1.1fr 1fr; gap:12px; position:relative; }
  .panel { background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius); position:relative; overflow:hidden; }
  .panel-header { display:flex; align-items:center; justify-content:space-between; padding:9px 14px; border-bottom:1px solid var(--border); }
  .mono-label { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:1.5px; text-transform:uppercase; }

  .link-btn {
    background: transparent; border: none; color: var(--accent);
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 1px;
    cursor: pointer; padding: 0;
  }
  .link-btn:hover { color: var(--accent); text-decoration: underline; border: none; }

  /* Package list */
  .pkg-list { max-height: 280px; overflow:auto; }
  .empty {
    padding: 24px 16px; font-family: var(--font-mono); font-size: 11px;
    color: var(--fg-3); text-align: center; line-height: 1.6;
  }
  .empty code { background: var(--bg-3); padding: 1px 5px; border-radius: 3px; color: var(--fg-1); }
  .inline-link {
    background: transparent; border: 1px solid var(--accent-line);
    color: var(--accent); padding: 6px 12px; border-radius: var(--radius);
    font-family: var(--font-mono); font-size: 10px; cursor: pointer; margin-top: 8px;
  }
  .inline-link:hover { background: var(--accent-dim); }

  .pkg-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; border-bottom: 1px solid var(--border);
    background: transparent; border-left: 2px solid transparent; border-radius: 0;
    width: 100%; text-align: left; cursor: pointer; color: var(--fg-1);
  }
  .pkg-row:last-child { border-bottom: none; }
  .pkg-row:hover { background: var(--bg-3); border-left-color: var(--accent); color: var(--fg-0); }
  .pkg-row svg { color: var(--accent); flex-shrink: 0; }
  .pkg-name { flex: 1; font-family: var(--font-mono); font-size: 12px; }
  .pkg-arrow { color: var(--fg-3); }
  .pkg-row:hover .pkg-arrow { color: var(--accent); }

  /* Quick actions grid */
  .actions-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
    background: var(--border);
  }
  .action {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; background: var(--bg-2);
    border: none; border-radius: 0; cursor: pointer; text-align: left;
    transition: background 80ms;
  }
  .action:hover:not(:disabled) { background: var(--bg-3); }
  .action.accent-action { background: var(--accent-dim); }
  .action.accent-action:hover { background: rgba(242,168,59,.18); }
  .action:disabled { opacity: .35; cursor: not-allowed; }
  .action svg { color: var(--accent); flex-shrink: 0; }
  .action-label { font-family: var(--font-mono); font-size: 11px; font-weight: 600; letter-spacing: .5px; color: var(--fg-0); }
  .action-sub { font-family: var(--font-mono); font-size: 9.5px; color: var(--fg-2); margin-top: 2px; letter-spacing: .3px; }

  /* Ask the agent */
  .ask-panel { flex-shrink: 0; }
  .ask-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--border); }
  .ask-card {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px; background: var(--bg-2);
    border: none; border-radius: 0; cursor: pointer; text-align: left;
    font-size: 12.5px; color: var(--fg-1);
  }
  .ask-card:hover:not(:disabled) { background: var(--bg-3); color: var(--fg-0); }
  .ask-card:disabled { opacity: .4; cursor: not-allowed; }
  .ask-bullet { color: var(--accent); font-family: var(--font-mono); font-size: 14px; flex-shrink: 0; }
  .ask-text { font-family: "Geist", "Inter", system-ui, sans-serif; }

  .warn-pill {
    font-family: var(--font-mono); font-size: 9px;
    color: var(--warn); border: 1px solid rgba(242,200,75,.35);
    padding: 2px 7px; border-radius: var(--radius);
  }

  .btn-sm { padding:5px 10px; font-size:10px; letter-spacing:.4px; text-transform:uppercase; border-radius:var(--radius-sm); }
  .btn-primary { background:var(--accent); color:#1a1408; border-color:var(--accent); font-weight:600; }
  .btn-primary:hover:not(:disabled) { background:var(--accent); opacity:.9; color:#1a1408; border-color:var(--accent); }
  .btn-sm:disabled { opacity: .4; cursor: not-allowed; }
</style>
