<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    showCommandPalette,
    showNewPackageModal,
    activePage,
    workspacePath,
    isRuntimeReady,
    chatMessages,
    rightPanelOpen,
    bottomPanelOpen,
    type ActivePage,
  } from "../stores/layout";
  import { rosCallTool, parseRosGraph } from "../tauri";

  type Cmd = {
    id: string;
    label: string;
    sub?: string;
    group: "navigate" | "action" | "node" | "topic" | "agent";
    run: () => void | Promise<void>;
  };

  let query = "";
  let selectedIdx = 0;
  let inputEl: HTMLInputElement;

  // Live ROS graph (cached while palette is open)
  let liveNodes: string[] = [];
  let liveTopics: string[] = [];

  $: open = $showCommandPalette;

  $: if (open) {
    query = "";
    selectedIdx = 0;
    tick().then(() => inputEl?.focus());
    refreshGraph();
  }

  async function refreshGraph() {
    if (!$isRuntimeReady) return;
    try {
      const raw = await rosCallTool("ros_graph", {});
      const g = parseRosGraph(raw);
      liveNodes = g.nodes;
      liveTopics = g.topics.map((t) => t.name);
    } catch { /* ignore */ }
  }

  function close() {
    showCommandPalette.set(false);
  }

  function nav(p: ActivePage) {
    activePage.set(p);
    close();
  }

  function ask(prompt: string) {
    chatMessages.update((ms) => [...ms, { kind: "user", text: prompt }]);
    rightPanelOpen.set(true);
    close();
  }

  // Build the master command list
  $: navCommands = [
    { id: "nav:home",     label: "Go to Home",     sub: "workspace overview",        group: "navigate", run: () => nav("home") },
    { id: "nav:files",    label: "Go to Files",    sub: "explorer + editor",         group: "navigate", run: () => nav("files") },
    { id: "nav:nodes",    label: "Go to Nodes",    sub: "live ROS nodes",            group: "navigate", run: () => nav("nodes") },
    { id: "nav:topics",   label: "Go to Topics",   sub: "live ROS topics",           group: "navigate", run: () => nav("topics") },
    { id: "nav:network",  label: "Go to Network",  sub: "LAN scan",                  group: "navigate", run: () => nav("network") },
    { id: "nav:library",  label: "Go to Library",  sub: "ROS package index",         group: "navigate", run: () => nav("library") },
    { id: "nav:terminal", label: "Go to Terminal", sub: "container shell",           group: "navigate", run: () => nav("terminal") },
    { id: "nav:settings", label: "Go to Settings", sub: "config",                    group: "navigate", run: () => nav("settings") },
  ] as Cmd[];

  $: actionCommands = [
    {
      id: "act:new-package",
      label: "New ROS Package",
      sub: "scaffold ament_python",
      group: "action",
      run: () => { showNewPackageModal.set(true); close(); },
    },
    {
      id: "act:toggle-bottom",
      label: $bottomPanelOpen ? "Hide Bottom Panel" : "Show Bottom Panel (Terminal)",
      sub: "Ctrl+`",
      group: "action",
      run: () => { bottomPanelOpen.update((v) => !v); close(); },
    },
    {
      id: "act:build",
      label: "Build Workspace",
      sub: "colcon build via agent",
      group: "action",
      run: () => ask("Build the colcon workspace and report the result."),
    },
    {
      id: "act:graph",
      label: "Describe ROS Graph",
      sub: "ask agent",
      group: "action",
      run: () => ask("Describe the current ROS graph: list every node, the topics it publishes/subscribes to, and any services."),
    },
  ] as Cmd[];

  $: nodeCommands = liveNodes.map((n) => ({
    id: `node:${n}`,
    label: n,
    sub: "ROS node",
    group: "node" as const,
    run: () => { activePage.set("nodes"); close(); },
  })) as Cmd[];

  $: topicCommands = liveTopics.map((t) => ({
    id: `topic:${t}`,
    label: t,
    sub: "ROS topic",
    group: "topic" as const,
    run: () => { activePage.set("topics"); close(); },
  })) as Cmd[];

  $: agentSuggestions = [
    { label: "ask: explain the ROS graph",     prompt: "Walk me through the current ROS graph end-to-end." },
    { label: "ask: tune the controller PID",   prompt: "Inspect the running controller and propose better PID gains." },
    { label: "ask: why is /tf drifting?",      prompt: "Inspect the /tf tree and explain why frames may be drifting." },
    { label: "ask: list all packages",         prompt: "List every package in my workspace and summarize what each does." },
  ].map<Cmd>((s) => ({
    id: `agent:${s.label}`,
    label: s.label,
    sub: "→ chat",
    group: "agent",
    run: () => ask(s.prompt),
  }));

  $: allCommands = [
    ...navCommands,
    ...actionCommands,
    ...agentSuggestions,
    ...nodeCommands,
    ...topicCommands,
  ];

  function score(c: Cmd, q: string): number {
    if (!q) return 1;
    const ql = q.toLowerCase();
    const haystack = (c.label + " " + (c.sub ?? "")).toLowerCase();
    if (haystack.includes(ql)) return 100 - haystack.indexOf(ql);
    // letter-by-letter fuzzy
    let pos = 0;
    let hits = 0;
    for (const ch of ql) {
      const idx = haystack.indexOf(ch, pos);
      if (idx === -1) return 0;
      pos = idx + 1;
      hits++;
    }
    return hits;
  }

  $: filtered = allCommands
    .map((c) => ({ c, s: score(c, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 50)
    .map((x) => x.c);

  $: if (filtered.length && selectedIdx >= filtered.length) selectedIdx = 0;

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = Math.min(filtered.length - 1, selectedIdx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = Math.max(0, selectedIdx - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[selectedIdx];
      if (cmd) cmd.run();
    }
  }

  function groupLabel(g: Cmd["group"]): string {
    switch (g) {
      case "navigate": return "Navigate";
      case "action":   return "Actions";
      case "agent":    return "Agent";
      case "node":     return "Live nodes";
      case "topic":    return "Live topics";
    }
  }

  // group consecutive items by group
  function groupRuns<T extends Cmd>(items: T[]): { label: string; items: T[] }[] {
    const groups: { label: string; items: T[] }[] = [];
    for (const it of items) {
      const last = groups[groups.length - 1];
      if (last && last.label === groupLabel(it.group)) {
        last.items.push(it);
      } else {
        groups.push({ label: groupLabel(it.group), items: [it] });
      }
    }
    return groups;
  }

  $: grouped = groupRuns(filtered);

  // Track absolute index across groups for arrow nav
  function absIdx(groupIdx: number, itemIdx: number): number {
    let n = 0;
    for (let g = 0; g < groupIdx; g++) n += grouped[g].items.length;
    return n + itemIdx;
  }
</script>

{#if open}
  <div class="overlay" on:click={close} role="dialog" aria-modal="true" aria-label="Command palette">
    <div class="palette" on:click|stopPropagation>
      <div class="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          on:keydown={onKey}
          placeholder={$workspacePath ? "Type a command, page, node, topic…" : "Search…"}
          spellcheck="false"
        />
        <span class="esc">esc</span>
      </div>

      <div class="results">
        {#if filtered.length === 0}
          <div class="empty">No matches.</div>
        {:else}
          {#each grouped as g, gi}
            <div class="group-label">{g.label}</div>
            {#each g.items as item, ii}
              {@const idx = absIdx(gi, ii)}
              <button
                class="row"
                class:sel={idx === selectedIdx}
                on:click={() => item.run()}
                on:mouseenter={() => (selectedIdx = idx)}
              >
                <span class="row-icon">
                  {#if item.group === "navigate"}→
                  {:else if item.group === "action"}◆
                  {:else if item.group === "agent"}✦
                  {:else if item.group === "node"}◎
                  {:else if item.group === "topic"}↹
                  {/if}
                </span>
                <span class="row-label">{item.label}</span>
                {#if item.sub}<span class="row-sub">{item.sub}</span>{/if}
              </button>
            {/each}
          {/each}
        {/if}
      </div>

      <div class="footer">
        <span class="kbd">↑↓</span> navigate
        <span class="kbd">⏎</span> select
        <span class="kbd">esc</span> dismiss
        <div style="flex:1"></div>
        <span class="footer-meta">{filtered.length} results</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 1500;
    background: rgba(0,0,0,.45);
    backdrop-filter: blur(3px);
    display: flex; justify-content: center;
    padding-top: 10vh;
    animation: fadein 100ms ease;
  }
  @keyframes fadein { from{opacity:0} to{opacity:1} }

  .palette {
    width: min(640px, 92vw);
    max-height: 70vh;
    background: var(--bg-1);
    border: 1px solid var(--border-bright);
    border-radius: var(--radius);
    box-shadow: 0 16px 60px rgba(0,0,0,.6);
    overflow: hidden;
    display: flex; flex-direction: column;
  }

  .search {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    color: var(--fg-3);
  }
  .search input {
    flex: 1;
    background: transparent; border: none; outline: none;
    color: var(--fg-0);
    font-family: "Geist", "Inter", system-ui, sans-serif;
    font-size: 14px;
  }
  .esc {
    font-family: var(--font-mono); font-size: 9px;
    color: var(--fg-3); border: 1px solid var(--border);
    padding: 1px 6px; border-radius: 3px; letter-spacing: .5px;
  }

  .results {
    flex: 1;
    overflow: auto;
    padding: 4px 0;
    min-height: 100px;
  }

  .empty {
    padding: 18px 16px;
    font-family: var(--font-mono); font-size: 11px;
    color: var(--fg-3); text-align: center;
  }

  .group-label {
    font-family: var(--font-mono); font-size: 9px; letter-spacing: 1.5px;
    color: var(--fg-3); text-transform: uppercase;
    padding: 8px 14px 4px;
  }

  .row {
    display: flex; align-items: center; gap: 12px;
    width: 100%; text-align: left;
    background: transparent; border: none; border-radius: 0;
    padding: 7px 14px;
    color: var(--fg-1);
    cursor: pointer;
    border-left: 2px solid transparent;
    font-family: inherit; font-size: 13px;
  }
  .row:hover, .row.sel {
    background: var(--accent-dim);
    border-left-color: var(--accent);
    color: var(--fg-0);
  }
  .row-icon {
    width: 14px; flex-shrink: 0;
    color: var(--accent);
    font-family: var(--font-mono); font-size: 12px; text-align: center;
  }
  .row-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 12px; }
  .row-sub { font-family: var(--font-mono); font-size: 10px; color: var(--fg-3); flex-shrink: 0; }

  .footer {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 14px;
    border-top: 1px solid var(--border);
    font-family: var(--font-mono); font-size: 10px;
    color: var(--fg-3); letter-spacing: .3px;
  }
  .kbd {
    border: 1px solid var(--border);
    padding: 0 5px; border-radius: 3px;
    color: var(--fg-2); margin-right: 2px;
  }
  .footer-meta { color: var(--fg-3); }
</style>
