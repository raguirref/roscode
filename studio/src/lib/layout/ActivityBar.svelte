<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { activePanel, type ActivityPanel } from "../stores/layout";

  const dispatch = createEventDispatcher<{ select: ActivityPanel }>();

  function select(panel: ActivityPanel) {
    if ($activePanel === panel) {
      // toggle sidebar if same icon clicked
      activePanel.set(panel);
    } else {
      activePanel.set(panel);
    }
    dispatch("select", panel);
  }

  const topIcons: { id: ActivityPanel; label: string; svg: string }[] = [
    {
      id: "packages",
      label: "Packages",
      svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="7" height="7" rx="1"/><rect x="15" y="3" width="7" height="7" rx="1"/><rect x="2" y="14" width="7" height="7" rx="1"/><rect x="15" y="14" width="7" height="7" rx="1"/></svg>`,
    },
    {
      id: "editor",
      label: "Explorer",
      svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    },
    {
      id: "chat",
      label: "Agent Chat",
      svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    },
    {
      id: "graph",
      label: "ROS Graph",
      svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
    },
  ];
</script>

<aside class="activity-bar">
  <div class="top">
    {#each topIcons as icon}
      <button
        class="icon-btn"
        class:active={$activePanel === icon.id}
        title={icon.label}
        on:click={() => select(icon.id)}
      >
        {@html icon.svg}
        {#if $activePanel === icon.id}
          <span class="active-bar"></span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="bottom">
    <button class="icon-btn" title="Settings" on:click={() => select("settings")}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </div>
</aside>

<style>
  .activity-bar {
    width: var(--activity-bar-width);
    background: var(--bg-1);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    z-index: 10;
  }

  .top { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 100%; padding-top: 8px; }
  .bottom { margin-top: auto; padding-bottom: 8px; }

  .icon-btn {
    position: relative;
    width: 44px;
    height: 44px;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-2);
    transition: color 120ms;
  }
  .icon-btn:hover { background: transparent; border: none; color: var(--fg-1); }
  .icon-btn.active { color: var(--fg-0); }
  .icon-btn.active:hover { color: var(--fg-0); }

  .active-bar {
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: var(--accent);
    border-radius: 0 2px 2px 0;
  }
</style>
