<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import registry from "./registry.json";

  const dispatch = createEventDispatcher<{ install: { prompt: string } }>();

  type Pkg = (typeof registry)[number];

  const CATEGORIES = [
    { id: "all",          label: "All" },
    { id: "manipulators", label: "Manipulators" },
    { id: "mobile",       label: "Mobile bases" },
    { id: "sensors",      label: "Sensors" },
    { id: "simulation",   label: "Simulation" },
    { id: "utilities",    label: "Utilities" },
  ] as const;

  let query = "";
  let activeCategory: string = "all";

  $: filtered = (registry as Pkg[]).filter((p) => {
    const matchCat = activeCategory === "all" || p.category === activeCategory;
    const q = query.toLowerCase();
    const matchQ =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t: string) => t.toLowerCase().includes(q));
    return matchCat && matchQ;
  });

  function installPrompt(p: Pkg): string {
    const how = p.apt
      ? `apt install ${p.apt}`
      : `clone and build from ${p.repo}`;
    return `install the ${p.name} ROS 2 package (${how}) inside the container and verify it is available`;
  }

  const CATEGORY_COLORS: Record<string, string> = {
    manipulators: "#4cc9f0",
    mobile:       "#7ee787",
    sensors:      "#f0a050",
    simulation:   "#a78bfa",
    utilities:    "#888",
  };
</script>

<div class="store">
  <div class="toolbar">
    <input
      class="search"
      type="search"
      placeholder="search packages…"
      bind:value={query}
    />
    <div class="cats">
      {#each CATEGORIES as cat}
        <button
          class="cat"
          class:active={activeCategory === cat.id}
          on:click={() => (activeCategory = cat.id)}
        >{cat.label}</button>
      {/each}
    </div>
  </div>

  <div class="grid">
    {#each filtered as pkg (pkg.id)}
      <div class="card">
        <div class="card-top">
          <span class="badge" style="border-color: {CATEGORY_COLORS[pkg.category]}; color: {CATEGORY_COLORS[pkg.category]}">
            {pkg.category}
          </span>
          {#if pkg.dof}
            <span class="pill">{pkg.dof} DOF</span>
          {/if}
          {#if pkg.holonomic === true}
            <span class="pill">holonomic</span>
          {:else if pkg.holonomic === false}
            <span class="pill">non-holonomic</span>
          {/if}
        </div>

        <div class="name">{pkg.name}</div>
        <p class="desc">{pkg.description}</p>

        <div class="tags">
          {#each pkg.tags as t}
            <span class="tag">{t}</span>
          {/each}
        </div>

        <div class="card-bottom">
          {#if pkg.apt}
            <code class="apt">{pkg.apt}</code>
          {:else}
            <code class="apt source">source build</code>
          {/if}
          <button
            class="install-btn"
            on:click={() => dispatch("install", { prompt: installPrompt(pkg) })}
          >install</button>
        </div>
      </div>
    {:else}
      <p class="empty">no packages match "{query}"</p>
    {/each}
  </div>
</div>

<style>
  .store {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .toolbar {
    padding: 8px 12px 6px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .search {
    width: 100%;
    background: var(--bg-0);
    color: var(--fg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 12px;
    font-family: inherit;
    box-sizing: border-box;
  }
  .search:focus { outline: none; border-color: var(--accent); }

  .cats {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .cat {
    padding: 2px 8px;
    font-size: 10px;
    border-radius: 10px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    color: var(--fg-2);
    cursor: pointer;
    letter-spacing: 0.4px;
  }
  .cat.active {
    background: var(--accent);
    color: var(--bg-0);
    border-color: var(--accent);
  }

  .grid {
    flex: 1;
    overflow-y: auto;
    padding: 10px 10px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    align-content: start;
  }

  .card {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 11px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .card:hover { border-color: var(--accent); }

  .card-top {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .pill {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 8px;
    background: var(--bg-0);
    border: 1px solid var(--border);
    color: var(--fg-2);
    letter-spacing: 0.4px;
  }

  .name {
    font-size: 12px;
    font-weight: 600;
    color: var(--fg-0);
  }

  .desc {
    font-size: 11px;
    color: var(--fg-1);
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .tag {
    font-size: 9px;
    padding: 1px 5px;
    background: var(--bg-0);
    border-radius: 4px;
    color: var(--fg-2);
    font-family: "SF Mono", Menlo, monospace;
  }

  .card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2px;
  }

  .apt {
    font-size: 9.5px;
    color: var(--fg-2);
    font-family: "SF Mono", Menlo, monospace;
    background: var(--bg-0);
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid var(--border);
    flex: 1;
    margin-right: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .apt.source { color: #f0a050; border-color: #f0a050; }

  .install-btn {
    font-size: 10px;
    padding: 3px 10px;
    border-radius: 4px;
    background: var(--accent);
    color: var(--bg-0);
    border: none;
    cursor: pointer;
    font-weight: 600;
    flex-shrink: 0;
  }
  .install-btn:hover { opacity: 0.85; }

  .empty {
    color: var(--fg-2);
    font-size: 12px;
    grid-column: 1 / -1;
    text-align: center;
    padding: 20px 0;
  }
</style>
