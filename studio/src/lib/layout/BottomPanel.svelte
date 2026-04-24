<script lang="ts">
  import { onMount, tick } from "svelte";
  import { activeBottomTab, bottomPanelHeight, type BottomTab } from "../stores/layout";
  import Chat from "../Chat.svelte";
  import Terminal from "../Terminal.svelte";
  import RosMap from "../RosMap.svelte";
  import type { SvelteComponent } from "svelte";
  import type { RuntimeStatus } from "../tauri";

  export let status: RuntimeStatus;
  export let workspacePath: string;

  // Forward chatRef to parent via binding
  export let chatRef: (SvelteComponent & { fill: (text: string) => void }) | undefined = undefined;

  let internalChatRef: SvelteComponent & { fill: (text: string) => void };
  $: chatRef = internalChatRef;

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  const TABS: { id: BottomTab; label: string }[] = [
    { id: "terminal", label: "TERMINAL" },
    { id: "chat",     label: "AGENT CHAT" },
    { id: "graph",    label: "ROS GRAPH" },
  ];

  function onMouseDown(e: MouseEvent) {
    isDragging = true;
    startY = e.clientY;
    startHeight = $bottomPanelHeight;
    e.preventDefault();
  }
  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const delta = startY - e.clientY;
    bottomPanelHeight.set(Math.max(120, Math.min(600, startHeight + delta)));
  }
  function onMouseUp() { isDragging = false; }

  onMount(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  });

  async function switchTab(tab: BottomTab) {
    activeBottomTab.set(tab);
    await tick();
    // Trigger resize on components that need it after being revealed
    window.dispatchEvent(new Event("resize"));
  }

  $: port = status.kind === "ready" ? status.agent_ws_port : 0;
  $: isReady = status.kind === "ready";
</script>

<div class="bottom-panel" style="height: {$bottomPanelHeight}px">
  <div class="drag-handle" on:mousedown={onMouseDown} role="separator" aria-label="Resize panel"></div>

  <div class="panel-tabs">
    {#each TABS as tab}
      <button
        class="ptab"
        class:active={$activeBottomTab === tab.id}
        on:click={() => switchTab(tab.id)}
      >
        {tab.label}
      </button>
    {/each}
    <div class="tab-spacer"></div>
    {#if isReady}
      <span class="runtime-badge">
        <span class="live-dot"></span>
        RUNTIME ACTIVE
      </span>
    {/if}
  </div>

  <div class="panel-body">
    <!-- Terminal — always mounted, hidden when inactive -->
    <div class="panel-view" class:hidden={$activeBottomTab !== "terminal"}>
      {#if isReady}
        <Terminal {port} />
      {:else}
        <div class="offline-msg">
          <span>▶ Start the runtime to access the terminal</span>
        </div>
      {/if}
    </div>

    <!-- Chat — always mounted, hidden when inactive -->
    <div class="panel-view" class:hidden={$activeBottomTab !== "chat"}>
      {#if isReady}
        <Chat bind:this={internalChatRef} {port} workspace={workspacePath} />
      {:else}
        <div class="offline-msg">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.2" opacity="0.4">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Start the runtime to chat with the roscode agent</span>
        </div>
      {/if}
    </div>

    <!-- ROS Graph — always mounted, hidden when inactive -->
    <div class="panel-view" class:hidden={$activeBottomTab !== "graph"}>
      {#if isReady}
        <RosMap {port} on:nodeclick={(e) => chatRef?.fill(e.detail.prompt)} />
      {:else}
        <div class="offline-msg">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.2" opacity="0.4">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span>Start the runtime to view the live ROS graph</span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .bottom-panel {
    display: flex;
    flex-direction: column;
    background: var(--bg-1);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }

  .drag-handle {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4px;
    cursor: row-resize;
    z-index: 20;
  }
  .drag-handle:hover { background: var(--accent); opacity: 0.4; }

  .panel-tabs {
    height: 32px;
    display: flex;
    align-items: stretch;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
    padding: 0;
    flex-shrink: 0;
    gap: 0;
  }

  .ptab {
    padding: 0 16px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid transparent;
    border-radius: 0;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--fg-2);
    cursor: pointer;
    transition: color 120ms, background 120ms;
    position: relative;
  }
  .ptab:hover { color: var(--fg-1); background: transparent; border: none; border-right: 1px solid var(--border); }
  .ptab.active {
    color: var(--accent);
    background: var(--bg-0);
  }
  .ptab.active::before {
    content: "";
    position: absolute; top: 0; left: 0; right: 0;
    height: 2px; background: var(--accent);
  }

  .tab-spacer { flex: 1; }

  .runtime-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--ok);
  }

  .live-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 6px var(--green);
    animation: pulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

  .panel-body {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .panel-view {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel-view.hidden { display: none; }

  .offline-msg {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--fg-2);
    font-size: 12px;
  }
</style>
