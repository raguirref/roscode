<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import registry from "../registry.json";

  const dispatch = createEventDispatcher<{ nodeselect: { name: string; category: string; prompt: string } }>();

  type Status = "active" | "idle" | "warning" | "error";

  interface PackageNode {
    name: string;
    category: string;
    status: Status;
    description: string;
  }

  const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
    manipulators: { label: "Manipulators", icon: "⚙", color: "#a78bfa" },
    mobile:        { label: "Mobile",       icon: "◉", color: "#f2a83b" },
    sensors:       { label: "Sensors",      icon: "✦", color: "#f59e0b" },
    simulation:    { label: "Simulation",   icon: "⬡", color: "#3dd68c" },
    utilities:     { label: "Utilities",    icon: "⊞", color: "#9aa3b0" },
  };

  // Assign pseudo-statuses from registry data for the demo
  const STATUSES: Status[] = ["active", "idle", "idle", "warning", "idle", "active"];
  const nodes: PackageNode[] = (registry as any[]).map((p, i) => ({
    name: p.name,
    category: p.category,
    status: STATUSES[i % STATUSES.length],
    description: p.description,
  }));

  const grouped = Object.fromEntries(
    Object.keys(CATEGORY_META).map((cat) => [cat, nodes.filter((n) => n.category === cat)])
  );

  let collapsed: Record<string, boolean> = {};
  let search = "";

  function toggle(cat: string) {
    collapsed[cat] = !collapsed[cat];
    collapsed = { ...collapsed };
  }

  function select(node: PackageNode) {
    dispatch("nodeselect", {
      name: node.name,
      category: node.category,
      prompt: `Tell me about the ${node.name} ROS 2 package and how to integrate it in my workspace.`,
    });
  }

  $: filtered = Object.fromEntries(
    Object.entries(grouped).map(([cat, items]) => [
      cat,
      search
        ? items.filter(
            (n) =>
              n.name.toLowerCase().includes(search.toLowerCase()) ||
              n.description.toLowerCase().includes(search.toLowerCase())
          )
        : items,
    ])
  );
</script>

<div class="pkg-tree">
  <div class="search-wrap">
    <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input class="search-input" placeholder="Search packages…" bind:value={search} />
  </div>

  <div class="tree-body">
    {#each Object.entries(CATEGORY_META) as [cat, meta]}
      {@const items = filtered[cat] ?? []}
      {#if items.length > 0 || !search}
        <div class="category">
          <button class="cat-header" on:click={() => toggle(cat)}>
            <svg
              class="chevron"
              class:open={!collapsed[cat]}
              width="10" height="10" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2.5"
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span class="cat-icon" style="color:{meta.color}">{meta.icon}</span>
            <span class="cat-label">{meta.label}</span>
            <span class="cat-count">{items.length}</span>
          </button>

          {#if !collapsed[cat]}
            <div class="items">
              {#each items as node}
                <button class="pkg-item" on:click={() => select(node)}>
                  <span class="pkg-icon" style="color:{meta.color}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                  </span>
                  <span class="pkg-name">{node.name}</span>
                  <span class="dot" data-status={node.status}></span>
                  <span class="status-label" data-status={node.status}>
                    {node.status === "active" ? "Active" : node.status === "warning" ? "Warning" : "Idle"}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .pkg-tree {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .search-wrap {
    position: relative;
    padding: 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .search-icon {
    position: absolute;
    left: 18px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--fg-2);
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    padding: 5px 8px 5px 28px;
    font-size: 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-bright);
    background: var(--bg-0);
    color: var(--fg-0);
  }

  .tree-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .category { margin-bottom: 2px; }

  .cat-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    border-radius: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: var(--fg-1);
    text-transform: uppercase;
    cursor: pointer;
  }
  .cat-header:hover { background: var(--bg-2); color: var(--fg-0); border: none; }

  .chevron {
    transform: rotate(0deg);
    transition: transform 150ms;
    flex-shrink: 0;
    color: var(--fg-2);
  }
  .chevron.open { transform: rotate(90deg); }

  .cat-icon { font-size: 13px; }
  .cat-label { flex: 1; text-align: left; }
  .cat-count {
    font-size: 10px;
    background: var(--bg-3);
    color: var(--fg-2);
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 500;
  }

  .items { padding-left: 8px; }

  .pkg-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 20px;
    background: transparent;
    border: none;
    border-radius: 0;
    font-size: 12px;
    color: var(--fg-1);
    cursor: pointer;
    text-align: left;
  }
  .pkg-item:hover { background: var(--bg-2); color: var(--fg-0); border: none; }

  .pkg-icon { flex-shrink: 0; opacity: 0.8; }
  .pkg-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot[data-status="active"]  { background: var(--dot-active); box-shadow: 0 0 5px var(--dot-active); }
  .dot[data-status="idle"]    { background: var(--dot-idle); }
  .dot[data-status="warning"] { background: var(--dot-warning); }
  .dot[data-status="error"]   { background: var(--dot-error); }

  .status-label {
    font-size: 10px;
    flex-shrink: 0;
  }
  .status-label[data-status="active"]  { color: var(--dot-active); }
  .status-label[data-status="idle"]    { color: var(--dot-idle); }
  .status-label[data-status="warning"] { color: var(--dot-warning); }
  .status-label[data-status="error"]   { color: var(--dot-error); }
</style>
