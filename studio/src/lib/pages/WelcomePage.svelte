<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { recentWorkspaces, addRecentWorkspace } from "../stores/layout";
  import { pickWorkspaceFolder } from "../tauri";
  import lockupUrl from "../brand/lockup-roscode.svg";
  import nameUrl from "../brand/name-roscode-studio.svg";

  const dispatch = createEventDispatcher<{ open: string }>();

  let openingPath = "";
  let pickLoading = false;

  // Format current date/time for the header
  const now = new Date();
  const dateStr = now
    .toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
    .replace(/\//g, " · ");
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short",
  });

  async function openPicker() {
    pickLoading = true;
    try {
      const chosen = await pickWorkspaceFolder();
      if (chosen) openWorkspace(chosen);
    } finally {
      pickLoading = false;
    }
  }

  function openWorkspace(path: string) {
    addRecentWorkspace(path);
    dispatch("open", path);
  }

  async function openNew() {
    // "New Project" picks a folder for the workspace — once inside the IDE,
    // the user can scaffold packages via the + button or ⌘K palette.
    pickLoading = true;
    try {
      const chosen = await pickWorkspaceFolder();
      if (chosen) {
        dispatch("open", chosen);
        // Signal to App.svelte: open the package modal right after
        // (handled there via empty-path branch — but here we have a path,
        // so we just dispatch a synthetic "open-and-scaffold" by using a
        // sentinel suffix the App.svelte parses)
        // Simpler: workspace is now open; user clicks "+ new package" themselves.
      }
    } finally {
      pickLoading = false;
    }
  }

  function shortenPath(p: string) {
    const home = "/Users/" + (p.split("/")[2] ?? "");
    return p.replace(home, "~");
  }

  const actions = [
    { id: "new",   icon: "plus",    label: "NEW PROJECT", sub: "ros 2 template",   primary: true  },
    { id: "open",  icon: "folder",  label: "OPEN WS",     sub: "from disk",        primary: false },
    { id: "clone", icon: "clone",   label: "CLONE REPO",  sub: "git / github",     primary: false },
    { id: "ssh",   icon: "ssh",     label: "CONNECT",     sub: "remote via ssh",   primary: false },
  ] as const;
</script>

<div class="welcome-root">
  <!-- dot-grid background -->
  <div class="dot-grid"></div>

  <!-- ── Header strip ── -->
  <header class="w-header">
    <div class="brand">
      <img src={nameUrl} alt="roscode studio" class="brand-wordmark" />
    </div>
    <div style="flex:1"></div>
    <div class="pill ok-pill">SYS READY</div>
    <div class="pill">ROS 2 · JAZZY</div>
    <div class="pill">v0.1.0</div>
  </header>

  <!-- ── Main layout ── -->
  <div class="w-body">
    <!-- ── Left: main content ── -->
    <div class="w-main">
      <!-- headline with hero lockup -->
      <div class="headline-block">
        <img src={lockupUrl} alt="" class="hero-lockup" />
        <div class="headline-text">
          <div class="headline-date">// {dateStr} — {timeStr}</div>
          <h1 class="headline">what are we building today?</h1>
          <div class="headline-sub">→ pick a recent workspace or boot a new session</div>
        </div>
      </div>

      <!-- quick action cards -->
      <div class="actions-grid">
        {#each actions as a, i}
          <button
            class="action-card"
            class:primary={a.primary}
            on:click={() => a.id === "new" ? openNew() : a.id === "open" ? openPicker() : null}
          >
            <div class="action-top">
              <!-- icon -->
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                {#if a.icon === "plus"}
                  <path d="M12 5v14M5 12h14"/>
                {:else if a.icon === "folder"}
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                {:else if a.icon === "clone"}
                  <rect x="8" y="4" width="12" height="12" rx="2"/><path d="M4 20V9a2 2 0 012-2"/>
                {:else if a.icon === "ssh"}
                  <rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 10l3 2-3 2M13 14h4"/>
                {/if}
              </svg>
              <span class="action-num">0{i + 1}</span>
            </div>
            <div class="action-label">{a.label}</div>
            <div class="action-sub">{a.sub}</div>
            {#if a.id === "open" && pickLoading}
              <div class="action-loading">opening…</div>
            {/if}
          </button>
        {/each}
      </div>

      <!-- recent workspaces table -->
      <div class="recents-panel">
        <div class="panel-header">
          <span class="panel-label">RECENT WORKSPACES</span>
          <span class="pill">{String($recentWorkspaces.length).padStart(2, "0")} total</span>
        </div>
        {#if $recentWorkspaces.length === 0}
          <div class="recents-empty">No recent workspaces. Open one to get started.</div>
        {:else}
          <div class="recents-table-head">
            <span>#</span><span>Workspace</span><span>Path</span>
          </div>
          {#each $recentWorkspaces as p, i}
            <button class="recents-row" on:click={() => openWorkspace(p)}>
              <span class="r-num">{String(i + 1).padStart(2, "0")}</span>
              <span class="r-name">{p.split("/").pop() ?? p}</span>
              <span class="r-path">{shortenPath(p)}</span>
              <span class="r-arrow">→</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <!-- ── Right rail ── -->
    <div class="w-rail">
      <!-- robot status -->
      <div class="rail-panel">
        <div class="rail-label">ROBOT STATUS</div>
        <div class="status-row">
          <div class="status-dot warn"></div>
          <div class="status-text">NO ROBOT LINKED</div>
        </div>
        <div class="status-meta">
          <div>domain: <span class="meta-val">0</span></div>
          <div>network: <span class="meta-val">192.168.1.0/24</span></div>
          <div>hosts found: <span class="meta-val">— awaiting scan —</span></div>
        </div>
        <div class="rail-actions">
          <button class="btn-sm">scan lan</button>
          <button class="btn-sm primary" on:click={openPicker}>start</button>
        </div>
      </div>

      <!-- agent panel -->
      <div class="rail-panel agent-panel">
        <div class="rail-label">AGENT · CLAUDE SONNET</div>
        <p class="agent-desc">
          Your ROS-aware copilot. Ask about graphs, author nodes, debug transforms — with full project context.
        </p>
        <div class="agent-chips">
          {#each ["inspect /tf", "why is amcl drifting?", "new pub/sub", "tune nav2"] as chip}
            <span class="chip">{chip}</span>
          {/each}
        </div>
        <div style="flex:1"></div>
        <div class="agent-input-row">
          <span class="agent-prompt-glyph">❯</span>
          <span class="agent-placeholder">open a workspace to chat…</span>
          <span class="agent-kbd">⌘K</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .welcome-root {
    display: flex; flex-direction: column;
    width: 100vw; height: 100vh;
    background: var(--bg-0);
    position: relative; overflow: hidden;
    color: var(--fg-0);
    font-family: var(--font-sans, 'Geist', 'Inter', ui-sans-serif);
  }

  .dot-grid {
    position: absolute; inset: 0; pointer-events: none;
    background-image: radial-gradient(var(--border-bright) 1px, transparent 1px);
    background-size: 24px 24px;
    opacity: 0.45;
  }

  /* ── Header ── */
  .w-header {
    display: flex; align-items: center; gap: 10px;
    padding: 0 20px; height: 42px; flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: var(--bg-1);
    position: relative; z-index: 2;
    -webkit-app-region: drag;
  }
  .w-header > * { -webkit-app-region: no-drag; }

  .brand { display: flex; align-items: center; color: var(--fg-0); }
  .brand-wordmark {
    height: 18px; width: auto;
    filter: invert(0.95);
  }

  .pill {
    padding: 3px 8px;
    border: 1px solid var(--border); border-radius: var(--radius);
    font-family: var(--font-mono); font-size: 10px; color: var(--fg-2); letter-spacing: 0.3px;
  }
  .ok-pill { border-color: rgba(139,195,74,.35); color: var(--ok); }

  /* ── Body ── */
  .w-body {
    flex: 1; min-height: 0;
    display: grid; grid-template-columns: 1fr 360px;
    position: relative; z-index: 1;
    overflow: hidden;
  }

  .w-main {
    padding: 40px 52px;
    display: flex; flex-direction: column; gap: 24px;
    overflow: auto;
  }

  /* ── Headline ── */
  .headline-block { display: flex; align-items: center; gap: 24px; }
  .hero-lockup {
    width: 240px; height: auto;
    flex-shrink: 0;
    filter: drop-shadow(0 8px 32px rgba(242,168,59,.18));
    animation: pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes pop {
    from { transform: scale(0.7); opacity: 0; }
    to   { transform: scale(1); opacity: 1; }
  }
  .headline-text { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
  .headline-date {
    font-family: var(--font-mono); font-size: 10px; color: var(--accent);
    letter-spacing: 3px; text-transform: uppercase;
  }
  .headline {
    font-size: 42px; font-weight: 600; letter-spacing: -1.5px; line-height: 1.05;
    color: var(--fg-0); margin: 0;
  }
  .headline-sub {
    font-family: var(--font-mono); font-size: 12px; color: var(--fg-3); letter-spacing: 0.3px;
  }

  /* ── Action cards ── */
  .actions-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }

  .action-card {
    background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 16px; text-align: left; cursor: pointer;
    display: flex; flex-direction: column; gap: 2px;
    position: relative; overflow: hidden;
    transition: border-color 100ms, background 100ms;
  }
  .action-card:hover { border-color: var(--accent-line); background: var(--bg-2); }
  .action-card.primary { background: var(--accent-dim); border-color: var(--accent-line); }
  .action-card.primary:hover { border-color: var(--accent); }

  .action-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .action-top svg { color: var(--fg-0); }
  .action-card.primary .action-top svg { color: var(--accent); }
  .action-num { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); }

  .action-label {
    font-family: var(--font-mono); font-size: 12px; font-weight: 600;
    letter-spacing: 0.5px; color: var(--fg-0);
  }
  .action-card.primary .action-label { color: var(--accent); }
  .action-sub { font-size: 11px; color: var(--fg-3); }
  .action-loading { position: absolute; bottom: 8px; right: 10px; font-family: var(--font-mono); font-size: 9px; color: var(--accent); letter-spacing: 1px; }

  /* ── Recents table ── */
  .recents-panel {
    background: var(--bg-1); border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; flex: 1;
  }
  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 14px; border-bottom: 1px solid var(--border);
  }
  .panel-label { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); letter-spacing: 1.5px; text-transform: uppercase; }

  .recents-empty { padding: 16px; font-family: var(--font-mono); font-size: 11px; color: var(--fg-3); }

  .recents-table-head {
    display: grid; grid-template-columns: 32px 1fr 2fr;
    padding: 7px 14px; border-bottom: 1px solid var(--border);
    font-family: var(--font-mono); font-size: 10px; color: var(--fg-3);
    letter-spacing: 1px; text-transform: uppercase; gap: 12px;
  }

  .recents-row {
    display: grid; grid-template-columns: 32px 1fr 2fr 20px;
    padding: 11px 14px; border-bottom: 1px solid var(--border);
    font-family: var(--font-mono); font-size: 12px; gap: 12px;
    cursor: pointer; background: transparent; border-left: 2px solid transparent;
    text-align: left; width: 100%; border-radius: 0;
    transition: background 80ms;
  }
  .recents-row:last-child { border-bottom: none; }
  .recents-row:hover { background: var(--bg-2); border-left-color: var(--accent); }

  .r-num { color: var(--fg-3); }
  .r-name { color: var(--fg-0); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .r-path { color: var(--fg-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .r-arrow { color: var(--accent); text-align: right; }

  /* ── Rail ── */
  .w-rail {
    border-left: 1px solid var(--border);
    background: var(--bg-1);
    padding: 18px;
    display: flex; flex-direction: column; gap: 12px;
    overflow: hidden;
  }

  .rail-panel {
    background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 14px; display: flex; flex-direction: column; gap: 10px;
  }
  .agent-panel { flex: 1; }

  .rail-label {
    font-family: var(--font-mono); font-size: 10px; color: var(--fg-3);
    letter-spacing: 1.5px; text-transform: uppercase;
  }

  .status-row { display: flex; align-items: center; gap: 8px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .status-dot.warn { background: var(--warn); box-shadow: 0 0 8px var(--warn); }
  .status-text { font-size: 13px; font-weight: 500; color: var(--fg-0); }

  .status-meta { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); line-height: 1.8; }
  .meta-val { color: var(--fg-1); }

  .rail-actions { display: flex; gap: 6px; }

  .btn-sm {
    padding: 5px 10px; font-size: 10px; letter-spacing: 0.4px;
    text-transform: uppercase; border-radius: var(--radius-sm);
    background: transparent; cursor: pointer;
  }
  .btn-sm:hover { background: var(--bg-3); }
  .btn-sm.primary { background: var(--accent); color: #1a1408; border-color: var(--accent); font-weight: 600; }
  .btn-sm.primary:hover { opacity: 0.9; border-color: var(--accent); color: #1a1408; }

  .agent-desc { font-size: 12px; color: var(--fg-2); line-height: 1.5; margin: 0; }

  .agent-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip {
    padding: 3px 8px; border: 1px solid var(--border); border-radius: var(--radius);
    font-family: var(--font-mono); font-size: 10px; color: var(--fg-2);
  }

  .agent-input-row {
    display: flex; align-items: center; gap: 8px;
    border: 1px solid var(--border-bright); border-radius: var(--radius);
    padding: 9px 10px; background: var(--bg-0);
  }
  .agent-prompt-glyph { color: var(--accent); font-family: var(--font-mono); font-size: 12px; }
  .agent-placeholder { flex: 1; font-family: var(--font-mono); font-size: 12px; color: var(--fg-3); }
  .agent-kbd { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); }
</style>
