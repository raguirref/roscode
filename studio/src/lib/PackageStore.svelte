<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import registry from "./registry.json";

  const dispatch = createEventDispatcher<{ install: { prompt: string } }>();

  type Pkg = (typeof registry)[number];

  const CATEGORIES = [
    { id: "all",          label: "All",           icon: "◉" },
    { id: "manipulators", label: "Manipulators",  icon: "⚙" },
    { id: "mobile",       label: "Mobile",        icon: "◎" },
    { id: "sensors",      label: "Sensors",       icon: "◈" },
    { id: "simulation",   label: "Simulation",    icon: "⬡" },
    { id: "utilities",    label: "Utilities",     icon: "◻" },
  ] as const;

  const CAT_COLOR: Record<string, string> = {
    manipulators: "#4cc9f0",
    mobile:       "#3dd68c",
    sensors:      "#f0a050",
    simulation:   "#a78bfa",
    utilities:    "#888",
  };

  const CAT_ICON: Record<string, string> = {
    manipulators: "⚙",
    mobile:       "◎",
    sensors:      "◈",
    simulation:   "⬡",
    utilities:    "◻",
  };

  let query = "";
  let activeCategory = "all";

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
      : `clone and build from source (${p.repo})`;
    return `install the ${p.name} ROS 2 package (${how}) inside the container and confirm it is available`;
  }
</script>

<div class="store">
  <!-- Search -->
  <div class="search-wrap">
    <span class="search-icon">⌕</span>
    <input
      class="search"
      type="search"
      placeholder="Search packages…"
      bind:value={query}
    />
  </div>

  <!-- Category filter -->
  <div class="cats">
    {#each CATEGORIES as cat}
      <button
        class="cat-chip"
        class:active={activeCategory === cat.id}
        on:click={() => (activeCategory = cat.id)}
        style={activeCategory === cat.id && cat.id !== "all"
          ? `--chip-color: ${CAT_COLOR[cat.id] ?? "var(--accent)"}`
          : ""}
      >
        <span class="cat-icon">{cat.icon}</span>
        {cat.label}
      </button>
    {/each}
  </div>

  <!-- Results count -->
  <div class="results-meta">
    {filtered.length} package{filtered.length !== 1 ? "s" : ""}
    {#if query || activeCategory !== "all"} matching{/if}
  </div>

  <!-- Card grid -->
  <div class="grid">
    {#each filtered as pkg (pkg.id)}
      {@const color = CAT_COLOR[pkg.category] ?? "#888"}
      <div class="card" style="--cat-color: {color}">
        <div class="card-accent"></div>
        <div class="card-inner">
          <div class="card-top">
            <span class="cat-badge" style="color:{color}">
              {CAT_ICON[pkg.category]} {pkg.category}
            </span>
            <div class="meta-pills">
              {#if pkg.dof}<span class="pill">{pkg.dof} DOF</span>{/if}
              {#if pkg.holonomic === true}<span class="pill">holonomic</span>
              {:else if pkg.holonomic === false}<span class="pill">non-holo</span>{/if}
            </div>
          </div>

          <div class="pkg-name">{pkg.name}</div>
          <p class="pkg-desc">{pkg.description}</p>

          <div class="tags">
            {#each pkg.tags.slice(0, 4) as t}
              <span class="tag">{t}</span>
            {/each}
          </div>

          <div class="card-footer">
            {#if pkg.apt}
              <code class="apt-cmd">{pkg.apt}</code>
            {:else}
              <code class="apt-cmd source">source build</code>
            {/if}
            <button
              class="install-btn"
              style="--btn-color: {color}"
              on:click={() => dispatch("install", { prompt: installPrompt(pkg) })}
            >
              Install
            </button>
          </div>
        </div>
      </div>
    {:else}
      <div class="no-results">
        <span>No packages match "<strong>{query}</strong>"</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .store {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--bg-1);
  }

  /* ── Search ── */
  .search-wrap {
    position: relative;
    padding: 10px 12px 0;
    flex-shrink: 0;
  }
  .search-icon {
    position: absolute;
    left: 22px;
    top: 50%;
    transform: translateY(-4px);
    font-size: 15px;
    color: var(--fg-2);
    pointer-events: none;
  }
  .search {
    width: 100%;
    padding: 7px 10px 7px 30px;
    font-size: 12px;
    border-radius: var(--radius-sm);
  }
  .search::-webkit-search-cancel-button { display: none; }

  /* ── Category chips ── */
  .cats {
    display: flex;
    gap: 5px;
    padding: 8px 12px 6px;
    flex-wrap: wrap;
    flex-shrink: 0;
  }
  .cat-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    font-size: 10.5px;
    border-radius: 20px;
    background: var(--bg-2);
    border: 1px solid var(--border-bright);
    color: var(--fg-2);
    cursor: pointer;
    transition: all 120ms;
  }
  .cat-chip:hover { color: var(--fg-1); border-color: var(--fg-2); background: var(--bg-2); }
  .cat-chip.active {
    background: color-mix(in srgb, var(--chip-color, var(--accent)) 15%, transparent);
    border-color: color-mix(in srgb, var(--chip-color, var(--accent)) 40%, transparent);
    color: var(--chip-color, var(--accent));
  }
  .cat-icon { font-size: 9px; }

  /* ── Results meta ── */
  .results-meta {
    padding: 0 12px 6px;
    font-size: 10px;
    color: var(--fg-2);
    letter-spacing: 0.3px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  /* ── Card grid ── */
  .grid {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    align-content: start;
  }

  /* ── Card ── */
  .card {
    display: flex;
    border-radius: var(--radius);
    border: 1px solid var(--border-bright);
    background: var(--bg-2);
    overflow: hidden;
    transition: border-color 160ms, transform 160ms, box-shadow 160ms;
    cursor: default;
  }
  .card:hover {
    border-color: var(--cat-color);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }
  .card-accent {
    width: 3px;
    background: var(--cat-color);
    flex-shrink: 0;
    opacity: 0.7;
  }
  .card:hover .card-accent { opacity: 1; }
  .card-inner {
    flex: 1;
    padding: 9px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  .cat-badge {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }

  .meta-pills {
    display: flex;
    gap: 3px;
  }
  .pill {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--bg-3);
    border: 1px solid var(--border-bright);
    color: var(--fg-2);
  }

  .pkg-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--fg-0);
    letter-spacing: -0.1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pkg-desc {
    font-size: 10.5px;
    color: var(--fg-1);
    line-height: 1.45;
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
    letter-spacing: 0.2px;
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .apt-cmd {
    flex: 1;
    font-size: 9px;
    font-family: "SF Mono", Menlo, monospace;
    color: var(--fg-2);
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .apt-cmd.source { color: var(--accent-warm); border-color: rgba(245,158,11,0.25); }

  .install-btn {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--btn-color) 18%, transparent);
    color: var(--btn-color);
    border: 1px solid color-mix(in srgb, var(--btn-color) 35%, transparent);
    letter-spacing: 0.2px;
    transition: all 120ms;
  }
  .install-btn:hover {
    background: var(--btn-color);
    color: var(--bg-0);
    border-color: var(--btn-color);
    transform: none;
  }

  .no-results {
    grid-column: 1 / -1;
    text-align: center;
    padding: 32px 16px;
    color: var(--fg-2);
    font-size: 12px;
  }
</style>
