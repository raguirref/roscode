<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { activePanel, type ActivityPanel } from "../stores/layout";

  const dispatch = createEventDispatcher<{ select: ActivityPanel }>();

  function select(panel: ActivityPanel) {
    activePanel.set(panel);
    dispatch("select", panel);
  }

  const topIcons: { id: ActivityPanel; label: string; code: string; svg: string }[] = [
    {
      id: "home",
      label: "Home",
      code: "HOM",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11L12 4l9 7"/><path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9"/></svg>`,
    },
    {
      id: "editor",
      label: "Files",
      code: "FIL",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>`,
    },
    {
      id: "graph",
      label: "ROS Graph",
      code: "NET",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.2"/><circle cx="12" cy="7" r="2.2"/><circle cx="18" cy="15" r="2.2"/><path d="M7.5 16.5l3-8M13.5 8.5l3 5"/></svg>`,
    },
    {
      id: "nodes",
      label: "Nodes",
      code: "NOD",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>`,
    },
    {
      id: "topics",
      label: "Topics",
      code: "TOP",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l8 4 8-4"/><path d="M4 12l8 4 8-4"/><path d="M4 17l8 4 8-4"/></svg>`,
    },
    {
      id: "packages",
      label: "Library",
      code: "LIB",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a2 2 0 012 2v13H7a2 2 0 00-2 2V4z"/><path d="M5 4v16"/></svg>`,
    },
    {
      id: "terminal",
      label: "Terminal",
      code: "TRM",
      svg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10l3 2-3 2M12 15h5"/></svg>`,
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
        <span class="ic">{@html icon.svg}</span>
        <span class="code">{icon.code}</span>
      </button>
    {/each}
  </div>

  <div class="bottom">
    <button class="icon-btn" title="Settings" on:click={() => select("settings")}>
      <span class="ic">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </span>
      <span class="code">CFG</span>
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
    align-items: stretch;
    flex-shrink: 0;
    z-index: 10;
  }

  .top { display: flex; flex-direction: column; align-items: stretch; gap: 0; width: 100%; }
  .bottom {
    margin-top: auto;
    border-top: 1px solid var(--border);
    padding: 4px 0;
  }

  .icon-btn {
    position: relative;
    width: 100%;
    padding: 10px 0 8px;
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--fg-2);
    transition: color 120ms, background 120ms;
    font-family: var(--font-mono);
    text-transform: uppercase;
  }
  .icon-btn:hover {
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    color: var(--fg-1);
  }
  .icon-btn.active {
    color: var(--accent);
    background: var(--accent-dim);
    border-left: 2px solid var(--accent);
  }
  .icon-btn.active:hover { color: var(--accent); }

  .ic {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
  .code {
    font-size: 9px;
    letter-spacing: 0.8px;
    color: inherit;
  }
</style>
