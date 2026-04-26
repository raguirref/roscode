<script lang="ts">
  import { onMount } from "svelte";
  import {
    getRuntimeStatus,
    startRuntime,
    type RuntimeStatus,
    type StartupEvent,
  } from "./lib/tauri";
  import {
    activePage,
    runtimeStatus,
    workspacePath,
    addRecentWorkspace,
    showNewPackageModal,
    showCommandPalette,
    bottomPanelOpen,
    leftPanelOpen,
    rightPanelOpen,
    leftPanelWidth,
    rightPanelWidth,
    bottomPanelHeight,
    activeBottomTab,
  } from "./lib/stores/layout";

  import Splash from "./lib/Splash.svelte";
  import WelcomePage from "./lib/pages/WelcomePage.svelte";

  // Layout
  import ActivityBar from "./lib/layout/ActivityBar.svelte";
  import LeftToolPanel from "./lib/layout/LeftToolPanel.svelte";
  import AgentPanel from "./lib/layout/AgentPanel.svelte";
  import StatusBar from "./lib/layout/StatusBar.svelte";
  import Resizer from "./lib/layout/Resizer.svelte";

  // Pages
  import HomePage from "./lib/pages/HomePage.svelte";
  import FilesPage from "./lib/pages/FilesPage.svelte";
  import NetworkPage from "./lib/pages/NetworkPage.svelte";
  import NodesPage from "./lib/pages/NodesPage.svelte";
  import TopicsPage from "./lib/pages/TopicsPage.svelte";
  import LibraryPage from "./lib/pages/LibraryPage.svelte";
  import TerminalPage from "./lib/pages/TerminalPage.svelte";

  // Modals & overlays
  import NewPackageModal from "./lib/modals/NewPackageModal.svelte";
  import CommandPalette from "./lib/modals/CommandPalette.svelte";
  import ApiKeyModal from "./lib/modals/ApiKeyModal.svelte";
  import { showApiKeyModal, apiKeyOk } from "./lib/modals/apiKeyState";
  import { apiKeyStatus } from "./lib/tauri";
  import iconUrl from "./lib/brand/icon-dark.svg";
  import studioNameUrl from "./lib/brand/name-roscode-studio.svg";

  // ── State ──────────────────────────────────────────────────────────────────
  let splashDone = false;
  let ideOpen = false;         // true = show IDE shell; false = WelcomePage
  let localWorkspacePath = ""; // mirrors workspacePath store for non-reactive use

  let status: RuntimeStatus = { kind: "uninitialized" };
  let booting = false;
  let stageLabel = "";
  let stagePercent = 0;

  // ── Boot ───────────────────────────────────────────────────────────────────
  onMount(() => {
    window.addEventListener("keydown", handleGlobalKey);
    (async () => {
      const [s] = await Promise.all([
        getRuntimeStatus().catch(() => ({ kind: "uninitialized" }) as RuntimeStatus),
        new Promise<void>((r) => setTimeout(r, 1400)),
      ]);
      status = s as RuntimeStatus;
      runtimeStatus.set(status);
      splashDone = true;
      // Poll the API-key status — refreshed when user saves a new key.
      apiKeyStatus().then((ok) => apiKeyOk.set(ok)).catch(() => apiKeyOk.set(false));
    })();
    return () => window.removeEventListener("keydown", handleGlobalKey);
  });

  // ── Welcome → IDE transition ───────────────────────────────────────────────
  function handleOpen(e: CustomEvent<string>) {
    const path = e.detail;
    localWorkspacePath = path;
    workspacePath.set(path);
    if (path) addRecentWorkspace(path);
    ideOpen = true;
    // If user hit "New Project" (empty path), open the modal to scaffold one
    if (!path) {
      activePage.set("home");
      showNewPackageModal.set(true);
    }
  }

  // Auto-close bottom terminal if main terminal page is opened
  $: if ($activePage === "terminal" && $bottomPanelOpen && $activeBottomTab === "terminal") {
    bottomPanelOpen.set(false);
  }

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  function handleGlobalKey(e: KeyboardEvent) {
    if (!ideOpen) return;
    // ⌘K / Ctrl+K → command palette
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      showCommandPalette.update((v) => !v);
      return;
    }
    // Ctrl+` → toggle bottom panel
    if (e.ctrlKey && e.key === "`") {
      e.preventDefault();
      bottomPanelOpen.update((v) => !v);
      return;
    }
  }

  // ── Runtime startup ────────────────────────────────────────────────────────
  async function boot() {
    if (!localWorkspacePath) return;
    booting = true;
    stageLabel = "";
    stagePercent = 0;
    try {
      status = await startRuntime(localWorkspacePath, handleEvent);
      runtimeStatus.set(status);
    } catch (e) {
      status = { kind: "error", message: String(e) };
      runtimeStatus.set(status);
    } finally {
      booting = false;
    }
  }

  function handleEvent(ev: StartupEvent) {
    switch (ev.event) {
      case "stage":  stageLabel = ev.label; stagePercent = ev.percent; break;
      case "log":    break; // discard; could show in a log panel later
      case "done":   status = ev.status; runtimeStatus.set(status); break;
      case "failed": status = { kind: "error", message: ev.message }; runtimeStatus.set(status); break;
    }
  }

  $: statusImage = status.kind === "ready" ? (status as any).image ?? "" : "";

  // ── Go back to welcome ─────────────────────────────────────────────────────
  function backToWelcome() {
    ideOpen = false;
    workspacePath.set("");
    localWorkspacePath = "";
  }
</script>

<!-- ── Splash ── -->
<Splash done={splashDone} />

<!-- ── Welcome screen ── -->
{#if splashDone && !ideOpen}
  <WelcomePage on:open={handleOpen} />
{/if}

<!-- ── IDE Shell ── -->
{#if ideOpen}
  <div class="ide-root">

    <!-- ════ HEADER ════ -->
    <header class="ide-header">
      <!-- brand: icon + studio name -->
      <button class="brand" on:click={() => activePage.set("home")} title="Home">
        <img src={iconUrl} alt="roscode" class="brand-icon" />
        <img src={studioNameUrl} alt="roscode studio" class="brand-name" />
      </button>

      {#if localWorkspacePath}
        <button class="ws-chip" on:click={backToWelcome} title="Change workspace">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" opacity=".6">
            <path d="M3 7a2 2 0 012-2h4l2 2h9a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          </svg>
          {localWorkspacePath.split("/").pop() ?? localWorkspacePath}
          <span class="ws-change">change</span>
        </button>
      {/if}

      <!-- search bar — Antigravity style -->
      <button class="search-bar" on:click={() => showCommandPalette.set(true)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <span class="search-placeholder">Search commands, nodes, files…</span>
        <span class="kbd-hint">⌘K</span>
      </button>

      <!-- ── Panel toggles (VSCode-style) ── -->
      <div class="panel-toggles">
        <button
          class="ptg"
          class:on={$leftPanelOpen}
          title="Toggle Primary Sidebar"
          on:click={() => leftPanelOpen.update((v) => !v)}
          aria-label="Toggle primary sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="16" rx="1.5"/>
            <line x1="9" y1="4" x2="9" y2="20"/>
            <rect x="3" y="4" width="6" height="16" fill="currentColor" opacity={$leftPanelOpen ? 0.35 : 0}/>
          </svg>
        </button>

        <button
          class="ptg"
          class:on={$bottomPanelOpen}
          title="Toggle Panel (Ctrl+`)"
          on:click={() => bottomPanelOpen.update((v) => !v)}
          aria-label="Toggle bottom panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="16" rx="1.5"/>
            <line x1="3" y1="14" x2="21" y2="14"/>
            <rect x="3" y="14" width="18" height="6" fill="currentColor" opacity={$bottomPanelOpen ? 0.35 : 0}/>
          </svg>
        </button>

        <button
          class="ptg"
          class:on={$rightPanelOpen}
          title="Toggle Secondary Sidebar (Agent)"
          on:click={() => rightPanelOpen.update((v) => !v)}
          aria-label="Toggle agent sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="16" rx="1.5"/>
            <line x1="15" y1="4" x2="15" y2="20"/>
            <rect x="15" y="4" width="6" height="16" fill="currentColor" opacity={$rightPanelOpen ? 0.35 : 0}/>
          </svg>
        </button>

        <button
          class="ptg"
          title="Customize Layout"
          on:click={() => showCommandPalette.set(true)}
          aria-label="Customize layout"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 6h16M4 12h10M4 18h16"/>
            <circle cx="18" cy="12" r="2" fill="currentColor"/>
          </svg>
        </button>
      </div>

      <div class="header-right">
        <div class="status-pill" data-kind={status.kind}>
          <span class="dot"></span>
          <span>
            {#if status.kind === "uninitialized"}OFFLINE
            {:else if status.kind === "starting"}{stageLabel || "STARTING…"}
            {:else if status.kind === "ready"}{(statusImage || "LIVE").toUpperCase()}
            {:else if status.kind === "error"}ERROR
            {/if}
          </span>
        </div>

        {#if status.kind !== "ready"}
          <button class="start-btn" on:click={boot} disabled={booting}>
            {#if booting}
              <span class="spinner"></span> {stageLabel || "STARTING…"}
            {:else}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              START ROS
            {/if}
          </button>
        {:else}
          <button class="stop-btn" on:click={() => { status = { kind: "uninitialized" }; runtimeStatus.set(status); }}>
            <span class="dot-live"></span> STOP ROS
          </button>
        {/if}
      </div>
    </header>

    <!-- ════ BOOT PROGRESS ════ -->
    {#if booting || status.kind === "starting"}
      <div class="progress-wrap">
        <div class="progress-fill" style="width:{Math.round(stagePercent * 100)}%"></div>
      </div>
    {/if}

    <!-- ════ IDE SHELL — 4 columns ════ -->
    <div class="ide-shell">
      <!-- Col 1: Activity bar -->
      <ActivityBar />

      <!-- Col 2: Left tool panel (collapsible + resizable) -->
      <LeftToolPanel />
      {#if $leftPanelOpen}
        <Resizer store={leftPanelWidth} side="left" min={160} max={500} />
      {/if}

      <!-- Col 3: Main page -->
      <main class="main-page">
        {#key $activePage}
        <div class="page-shell fade-in">
        {#if $activePage === "home"}       <HomePage />
        {:else if $activePage === "files"} <FilesPage />
        {:else if $activePage === "network"} <NetworkPage />
        {:else if $activePage === "nodes"} <NodesPage />
        {:else if $activePage === "topics"} <TopicsPage />
        {:else if $activePage === "library"} <LibraryPage />
        {:else if $activePage === "terminal"} <TerminalPage />
        {:else if $activePage === "settings"}
          <div class="settings-stub">
            <div>
              <div class="stub-label">// settings</div>
              <h1 class="settings-title">configure your studio</h1>
            </div>

            <!-- API Key card -->
            <div class="settings-card">
              <div class="card-head">
                <div>
                  <div class="card-title">Anthropic API Key</div>
                  <div class="card-sub">Required for the agent. Stored in this repo's <code>.env</code> file.</div>
                </div>
                <div class="key-status" data-ok={$apiKeyOk}>
                  {#if $apiKeyOk === true}
                    <span class="dot ok"></span> Configured
                  {:else if $apiKeyOk === false}
                    <span class="dot warn"></span> Missing
                  {:else}
                    <span class="dot idle"></span> Checking…
                  {/if}
                </div>
              </div>
              <div class="card-actions">
                <button class="btn primary" on:click={() => showApiKeyModal.set(true)}>
                  {$apiKeyOk ? "Update key" : "Add key"}
                </button>
                <a class="btn ghost" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                  Get a key →
                </a>
              </div>
            </div>

            <!-- Workspace info -->
            <div class="settings-card">
              <div class="card-head">
                <div>
                  <div class="card-title">Workspace</div>
                  <div class="card-sub">{localWorkspacePath || "No workspace open"}</div>
                </div>
                {#if localWorkspacePath}
                  <button class="btn ghost" on:click={backToWelcome}>Change</button>
                {/if}
              </div>
            </div>

            <!-- Read-only env -->
            <div class="settings-card">
              <div class="card-title" style="margin-bottom:8px">Runtime</div>
              <div class="stub-grid">
                {#each [
                  ["MODEL","claude-opus-4-7"],
                  ["ROS DISTRO","humble"],
                  ["DOMAIN ID","0"],
                  ["RUNTIME","lima + containerd"],
                  ["AGENT WS","ws://localhost:9000"],
                ] as [k,v]}
                  <div class="stub-row">
                    <span class="stub-k">{k}</span>
                    <span class="stub-v">{v}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
        </div>
        {/key}
      </main>

      <!-- Col 4: Agent panel (resizable + collapsible) -->
      {#if $rightPanelOpen}
        <Resizer store={rightPanelWidth} side="right" min={220} max={640} />
        <AgentPanel port={9000} workspacePath={localWorkspacePath} />
      {/if}
    </div>

    <!-- ════ BOTTOM PANEL (pinned terminal) ════ -->
    {#if $bottomPanelOpen}
      <Resizer store={bottomPanelHeight} direction="vertical" side="top" min={140} max={700} />
      <div class="bottom-pin" style="height: {$bottomPanelHeight}px">
        <div class="bottom-pin-header">
          <span class="bp-label">▌ TERMINAL — pinned</span>
          <div style="flex:1"></div>
          <button class="bp-close" on:click={() => bottomPanelOpen.set(false)} title="Close (Ctrl+`)">×</button>
        </div>
        <div class="bottom-pin-body">
          <TerminalPage />
        </div>
      </div>
    {/if}

    <!-- ════ STATUS BAR ════ -->
    <StatusBar {status} />
  </div>

  <!-- ════ MODALS / OVERLAYS ════ -->
  <NewPackageModal />
  <CommandPalette />
  <ApiKeyModal />
{/if}

<style>
  /* ── IDE shell ── */
  .ide-root {
    display: flex; flex-direction: column;
    height: 100vh; width: 100vw;
    overflow: hidden; background: var(--bg-0);
  }

  /* ── Header ── */
  .ide-header {
    height: var(--header-height);
    display: flex; align-items: center; gap: 10px;
    padding: 0 14px 0 2px;
    background: var(--bg-1); border-bottom: 1px solid var(--border);
    flex-shrink: 0; position: relative;
    -webkit-app-region: drag;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    z-index: 100;
  }
  .ide-header > * { -webkit-app-region: no-drag; }
  .ide-header::after {
    content: ""; position: absolute; bottom: -1px; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent) 50%, transparent); opacity: 0.15;
  }

  .brand {
    display: flex; align-items: center; flex-shrink: 0;
    color: var(--fg-0);
    background: transparent; border: none; padding: 6px 8px; border-radius: 8px;
    cursor: pointer;
    transition: all 150ms cubic-bezier(.2,.8,.2,1);
  }
  .brand:hover { background: rgba(255,255,255,0.03); }
  .brand:active { transform: scale(0.96); opacity: 0.8; }
  .brand-icon {
    height: 30px; width: 30px; flex-shrink: 0; object-fit: contain;
    transition: filter 240ms ease;
  }
  .brand-name {
    height: 12px; width: auto; flex-shrink: 0; margin-left: 9px;
    opacity: 0.85; filter: invert(1);
    transition: filter 240ms ease, opacity 240ms ease;
  }
  .brand:hover .brand-icon { filter: drop-shadow(0 0 10px rgba(242,168,59,.4)); }
  .brand:hover .brand-name { opacity: 1; filter: drop-shadow(0 0 8px rgba(242,168,59,.2)); }

  .ws-chip {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 10px; border: 1px solid var(--border); border-radius: 8px;
    background: rgba(255,255,255,0.02); cursor: pointer;
    font-family: var(--font-mono); font-size: 11px; color: var(--fg-2);
    max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    transition: all 120ms;
    flex-shrink: 0;
  }
  .ws-chip:hover { border-color: var(--accent-line); color: var(--fg-1); background: rgba(255,255,255,0.04); }
  .ws-change { color: var(--fg-3); font-size: 9px; opacity: 0.5; }
  .ws-chip:hover .ws-change { color: var(--accent); opacity: 1; }

  /* Redesigned Search Bar - Antigravity inspired */
  .search-bar {
    flex: 1; display: flex; align-items: center; gap: 10px;
    padding: 6px 16px;
    background: rgba(255, 255, 255, 0.03); 
    border: 1px solid rgba(255, 255, 255, 0.06); 
    border-radius: 10px;
    cursor: pointer; max-width: 520px; margin: 0 auto;
    transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--fg-2);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
  }
  .search-bar:hover { 
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(242, 168, 59, 0.2); 
    color: var(--fg-1); 
    box-shadow: 0 4px 12px rgba(0,0,0,0.2), inset 0 1px 2px rgba(0,0,0,0.2);
  }
  .search-bar:active { transform: scale(0.99); }
  .search-placeholder { flex: 1; text-align: left; font-family: var(--font-sans); font-size: 13px; color: var(--fg-2); letter-spacing: 0.2px; opacity: 0.7; }
  .search-bar:hover .search-placeholder { color: var(--fg-1); opacity: 1; }
  .kbd-hint {
    font-family: var(--font-mono); font-size: 10px; color: var(--fg-3);
    padding: 2px 6px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 4px;
    letter-spacing: .5px; background: rgba(0,0,0,0.3);
  }

  .header-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; margin-left: auto; }

  .status-pill {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border-bright);
    background: rgba(255,255,255,0.02);
    font-family: var(--font-mono); font-size: 10px; color: var(--fg-1); letter-spacing: 0.6px; text-transform: uppercase;
    transition: all 150ms;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fg-3); flex-shrink: 0; }
  .status-pill[data-kind="ready"] { border-color: rgba(139,195,74,.38); color: var(--ok); background: rgba(139,195,74,.08); }
  .status-pill[data-kind="ready"] .dot { background: var(--ok); animation: pulse 2s ease-in-out infinite; }
  .status-pill[data-kind="starting"] { border-color: var(--accent-line); color: var(--accent); background: var(--accent-dim); }
  .status-pill[data-kind="starting"] .dot { background: var(--accent); animation: pulse 1s ease-in-out infinite; }
  .status-pill[data-kind="error"] { border-color: rgba(224,102,102,.35); color: var(--err); background: rgba(224,102,102,.08); }
  .status-pill[data-kind="error"] .dot { background: var(--err); }
  .status-pill[data-kind="uninitialized"] .dot { background: var(--warn); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .start-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 14px;
    background: var(--accent); color: #1a1408;
    border: 1px solid var(--accent); border-radius: var(--radius);
    font-family: var(--font-mono); font-size: 10px; font-weight: 600;
    letter-spacing: 0.5px; text-transform: uppercase; cursor: pointer;
    white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis;
    transition: opacity 120ms;
  }
  .start-btn:hover { opacity: 0.9; color: #1a1408; background: var(--accent); border-color: var(--accent); }
  .start-btn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }

  .stop-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 14px;
    background: transparent; color: var(--fg-1);
    border: 1px solid var(--border-bright); border-radius: var(--radius);
    font-family: var(--font-mono); font-size: 10px; font-weight: 600;
    letter-spacing: 0.5px; text-transform: uppercase; cursor: pointer;
    white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis;
    transition: all 120ms;
  }
  .stop-btn:hover { background: rgba(224,102,102,.1); color: var(--err); border-color: rgba(224,102,102,.3); }
  .dot-live {
    width: 6px; height: 6px; border-radius: 50%; background: var(--err);
    box-shadow: 0 0 6px var(--err);
  }

  .spinner {
    display: inline-block; width: 10px; height: 10px;
    border: 2px solid rgba(26,20,8,.4); border-top-color: #1a1408;
    border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .progress-wrap { height: 2px; background: var(--bg-2); flex-shrink: 0; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--purple, #8b5cf6)); transition: width 300ms ease; }

  /* IDE body */
  .ide-shell { display: flex; flex: 1; overflow: hidden; min-height: 0; }

  .main-page {
    flex: 1; display: flex; overflow: hidden;
    min-width: 0; min-height: 0; background: var(--bg-0);
    position: relative;
  }
  .page-shell {
    flex: 1; display: flex; min-width: 0; min-height: 0;
    will-change: opacity;
  }

  /* Bottom pinned terminal */
  .bottom-pin {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--bg-1);
    display: flex; flex-direction: column; min-height: 0;
  }

  /* Panel toggle buttons */
  .panel-toggles {
    display: flex; align-items: center; gap: 2px;
    padding: 0 6px; flex-shrink: 0;
  }
  .ptg {
    width: 28px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: 1px solid transparent; border-radius: 6px;
    color: var(--fg-2); cursor: pointer; padding: 0;
    transition:
      color 160ms cubic-bezier(.2,.8,.2,1),
      background 160ms cubic-bezier(.2,.8,.2,1),
      border-color 160ms cubic-bezier(.2,.8,.2,1),
      transform 120ms cubic-bezier(.2,.8,.2,1);
    user-select: none;
  }
  .ptg:hover { color: var(--fg-0); background: var(--bg-2); border-color: transparent; }
  .ptg:active:not(:disabled) { transform: scale(0.88); filter: brightness(.92); }
  .ptg.on { color: var(--accent); background: var(--accent-dim); }
  .ptg.on:hover { color: var(--accent); background: var(--accent-dim); border-color: transparent; }
  .bottom-pin-header {
    height: 28px; display: flex; align-items: center;
    padding: 0 12px; background: var(--bg-1);
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .bp-label { font-family: var(--font-mono); font-size: 10px; color: var(--accent); letter-spacing: 1.5px; }
  .bp-close {
    background: transparent; border: 1px solid var(--border); color: var(--fg-2);
    width: 22px; height: 22px; padding: 0; line-height: 1;
    border-radius: 3px; font-size: 14px; cursor: pointer;
  }
  .bp-close:hover { color: var(--err); border-color: var(--err); }
  .bottom-pin-body { flex: 1; overflow: hidden; display: flex; min-height: 0; }

  /* Settings */
  .settings-stub {
    flex: 1; padding: 32px 36px; display: flex; flex-direction: column; gap: 16px;
    max-width: 760px; width: 100%; margin: 0 auto; overflow-y: auto;
  }
  .stub-label { font-family: var(--font-mono); font-size: 10px; color: var(--accent); letter-spacing: 1.5px; }
  .settings-title { font-size: 28px; font-weight: 600; letter-spacing: -.6px; margin-top: 4px; }

  .settings-card {
    background: var(--bg-1); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 18px 20px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
  .card-title { font-size: 15px; font-weight: 600; color: var(--fg-0); letter-spacing: -.2px; }
  .card-sub { font-size: 12.5px; color: var(--fg-2); margin-top: 4px; line-height: 1.5; }
  .card-sub code { background: var(--bg-3); padding: 1px 6px; border-radius: 4px; color: var(--accent); font-family: var(--font-mono); font-size: 11.5px; }
  .card-actions { display: flex; gap: 8px; }

  .key-status {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    font-family: var(--font-mono); font-size: 10px;
    border: 1px solid var(--border-bright); color: var(--fg-2);
    flex-shrink: 0;
  }
  .key-status[data-ok="true"] { color: var(--ok); border-color: rgba(108,208,107,.3); background: rgba(108,208,107,.08); }
  .key-status[data-ok="false"] { color: var(--warn); border-color: rgba(242,200,75,.3); background: rgba(242,200,75,.06); }
  .key-status .dot { width: 6px; height: 6px; border-radius: 50%; }
  .key-status .dot.ok { background: var(--ok); }
  .key-status .dot.warn { background: var(--warn); }
  .key-status .dot.idle { background: var(--fg-2); }

  .btn {
    padding: 8px 16px; font-size: 12.5px; font-weight: 500;
    border-radius: var(--radius-sm); cursor: pointer;
    border: 1px solid; font-family: var(--font-sans); text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
  }
  .btn.ghost { background: transparent; border-color: var(--border-bright); color: var(--fg-1); }
  .btn.ghost:hover { color: var(--fg-0); border-color: var(--fg-2); background: var(--bg-2); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #1a1408; font-weight: 600; }
  .btn.primary:hover { opacity: .92; }

  .stub-grid {
    display: flex; flex-direction: column;
    border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;
  }
  .stub-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 11px 16px; border-bottom: 1px solid var(--border);
    font-family: var(--font-mono); font-size: 12px;
  }
  .stub-row:last-child { border-bottom: none; }
  .stub-k { color: var(--fg-2); letter-spacing: .5px; text-transform: uppercase; font-size: 10px; }
  .stub-v { color: var(--fg-0); }
</style>
