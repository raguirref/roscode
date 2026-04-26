<script lang="ts">
  import { onMount } from "svelte";
  import { workspacePath, openFile, activeFile, openFiles, filesRefreshTick, isRuntimeReady } from "../stores/layout";
  import { fsReadDir, fsReadFile, containerReadDir, containerReadFile, type FsNode } from "../tauri";
  import MonacoEditor from "../editor/MonacoEditor.svelte";

  // ── Tree node type ──────────────────────────────────────────────────────────
  interface TreeNode extends FsNode {
    depth: number;
    expanded: boolean;
    loading: boolean;
    children: TreeNode[] | null; // null = not loaded yet
  }

  let roots: TreeNode[] = [];
  let loadingRoot = false;
  let filter = "";
  let errorMsg = "";

  // ── Language detection ──────────────────────────────────────────────────────
  function getLang(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      py: "python", ts: "typescript", js: "javascript", svelte: "html",
      json: "json", yaml: "yaml", yml: "yaml", xml: "xml",
      cpp: "cpp", hpp: "cpp", c: "cpp", h: "cpp",
      md: "markdown", sh: "shell", bash: "shell", cmake: "plaintext",
      toml: "plaintext", txt: "plaintext", launch: "python",
    };
    return map[ext] ?? "plaintext";
  }

  function getLangColor(name: string): string {
    const lang = getLang(name);
    const map: Record<string, string> = {
      python: "#f2a83b", typescript: "#3178c6", javascript: "#f7df1e",
      json: "#3dd68c", yaml: "#a78bfa", xml: "#f59e0b",
      cpp: "#00b4d8", markdown: "#9ea39a", html: "#e44d26",
    };
    return map[lang] ?? "var(--fg-3)";
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function toTreeNode(n: FsNode, depth: number): TreeNode {
    return { ...n, depth, expanded: false, loading: false, children: null };
  }

  function flatten(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = [];
    for (const n of nodes) {
      result.push(n);
      if (n.is_dir && n.expanded && n.children) {
        result.push(...flatten(n.children));
      }
    }
    return result;
  }

  // ── Reactive tree ───────────────────────────────────────────────────────────
  $: visibleNodes = flatten(roots);

  $: filteredNodes = filter.trim()
    ? visibleNodes.filter(
        (n) => !n.is_dir && n.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : visibleNodes;

  // ── Load workspace root ─────────────────────────────────────────────────────
  // When runtime is ready, always read from container at /workspace.
  // When runtime is not ready, fall back to host fs using workspacePath.
  $: treeRoot = $isRuntimeReady ? "/workspace" : $workspacePath;
  $: if (treeRoot) loadRoot(treeRoot);
  $: if ($filesRefreshTick && treeRoot) loadRoot(treeRoot);

  async function readDir(path: string): Promise<FsNode[]> {
    return $isRuntimeReady ? containerReadDir(path) : fsReadDir(path);
  }

  async function readFile(path: string): Promise<string> {
    return $isRuntimeReady ? containerReadFile(path) : fsReadFile(path);
  }

  async function loadRoot(path: string) {
    if (!path) return;
    loadingRoot = true;
    errorMsg = "";
    try {
      const entries = await readDir(path);
      roots = entries.map((e) => toTreeNode(e, 0));
    } catch (e) {
      errorMsg = String(e);
    }
    loadingRoot = false;
  }

  // ── Toggle directory expand ─────────────────────────────────────────────────
  async function toggleDir(node: TreeNode) {
    if (!node.is_dir) return;
    node.expanded = !node.expanded;
    if (node.expanded && node.children === null) {
      node.loading = true;
      roots = roots;
      try {
        const entries = await readDir(node.path);
        node.children = entries.map((e) => toTreeNode(e, node.depth + 1));
      } catch {}
      node.loading = false;
    }
    roots = roots;
  }

  // ── Open a file in Monaco ───────────────────────────────────────────────────
  async function clickNode(node: TreeNode) {
    if (node.is_dir) {
      await toggleDir(node);
      return;
    }
    // Already open? Just focus it.
    if ($openFiles.find((f) => f.path === node.path)) {
      activeFile.set(node.path);
      return;
    }
    try {
      const content = await readFile(node.path);
      openFile({
        path: node.path,
        name: node.name,
        language: getLang(node.name),
        content,
        dirty: false,
      });
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  }

  // ── File icon SVG ───────────────────────────────────────────────────────────
  function fileIcon(name: string): string {
    if (name.endsWith(".py")) return "py";
    if (name.endsWith(".ts") || name.endsWith(".js")) return "ts";
    if (name.endsWith(".json")) return "js";
    if (name.endsWith(".yaml") || name.endsWith(".yml")) return "y";
    if (name.endsWith(".xml") || name.endsWith(".launch")) return "x";
    if (name.endsWith(".cpp") || name.endsWith(".hpp") || name.endsWith(".h")) return "c";
    if (name.endsWith(".md")) return "m";
    return "f";
  }
</script>

<div class="page">
  <!-- ── File tree sidebar ── -->
  <div class="tree-col">
    <div class="tree-header">
      <div class="label-sm">// FILES</div>
      <div class="page-title">explorer</div>
    </div>

    <!-- search -->
    <div class="search-box">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input
        class="search-input"
        placeholder="filter files…"
        bind:value={filter}
      />
      {#if filter}
        <button class="clear-btn" on:click={() => (filter = "")}>×</button>
      {/if}
    </div>

    <!-- workspace label -->
    {#if treeRoot}
      <div class="ws-label" title={treeRoot}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" opacity=".5"><path d="M3 7a2 2 0 012-2h4l2 2h9a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
        {treeRoot.split("/").pop() ?? "workspace"}
      </div>
    {/if}

    <!-- tree body -->
    <div class="tree-body">
      {#if loadingRoot}
        <div class="tree-loading">loading…</div>
      {:else if errorMsg}
        <div class="tree-error">{errorMsg}</div>
      {:else if !treeRoot}
        <div class="tree-empty">No workspace open.<br/>Start the runtime to load a workspace.</div>
      {:else if filteredNodes.length === 0 && filter}
        <div class="tree-empty">No files match "{filter}"</div>
      {:else}
        {#each filteredNodes as node (node.path)}
          <button
            class="tree-row"
            class:dir={node.is_dir}
            class:sel={!node.is_dir && $activeFile === node.path}
            style="padding-left:{12 + node.depth * 14}px"
            on:click={() => clickNode(node)}
          >
            {#if node.is_dir}
              {#if node.loading}
                <span class="spin-icon">⟳</span>
              {:else}
                <svg
                  class="chevron"
                  class:open={node.expanded}
                  width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                ><path d="M9 6l6 6-6 6"/></svg>
              {/if}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" opacity=".55" style="flex-shrink:0">
                <path d="M3 7a2 2 0 012-2h4l2 2h9a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
              </svg>
              <span class="tree-name dir-name">{node.name}</span>
            {:else}
              <span class="file-badge" style="color:{getLangColor(node.name)}">{fileIcon(node.name)}</span>
              <span class="tree-name">{node.name}</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  </div>

  <!-- ── Editor area ── -->
  <div class="editor-col">
    <MonacoEditor />
  </div>
</div>

<style>
  .page {
    flex: 1; overflow: hidden;
    display: grid; grid-template-columns: 240px 1fr; min-height: 0;
  }

  /* Tree column */
  .tree-col {
    border-right: 1px solid var(--border);
    background: var(--bg-1);
    display: flex; flex-direction: column; overflow: hidden;
  }

  .tree-header { padding: 14px 16px 8px; flex-shrink: 0; }
  .label-sm {
    font-family: var(--font-mono); font-size: 10px; color: var(--accent);
    letter-spacing: 2px; text-transform: uppercase;
  }
  .page-title { font-size: 18px; font-weight: 600; letter-spacing: -.3px; margin-top: 2px; }

  .search-box {
    display: flex; align-items: center; gap: 7px;
    margin: 0 10px 8px; padding: 6px 10px;
    background: var(--bg-2); border: 1px solid var(--border); border-radius: 4px;
    flex-shrink: 0; color: var(--fg-2);
  }
  .search-input {
    flex: 1; background: transparent; border: none; outline: none;
    font-family: var(--font-mono); font-size: 11px; color: var(--fg-0);
  }
  .search-input::placeholder { color: var(--fg-3); }
  .clear-btn {
    background: transparent; border: none; color: var(--fg-3);
    font-size: 14px; line-height: 1; cursor: pointer; padding: 0 2px;
  }
  .clear-btn:hover { color: var(--fg-0); border: none; }

  .ws-label {
    display: flex; align-items: center; gap: 5px;
    padding: 0 12px 6px;
    font-family: var(--font-mono); font-size: 10px; color: var(--fg-3);
    letter-spacing: .5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .tree-body { flex: 1; overflow: auto; padding: 2px 0; }

  .tree-loading { padding: 12px 16px; font-family: var(--font-mono); font-size: 11px; color: var(--fg-3); }
  .tree-error { padding: 12px 16px; font-family: var(--font-mono); font-size: 11px; color: var(--err); }
  .tree-empty { padding: 12px 16px; font-family: var(--font-mono); font-size: 11px; color: var(--fg-3); line-height: 1.6; }

  .tree-row {
    display: flex; align-items: center; gap: 6px;
    width: 100%; text-align: left; padding-top: 4px; padding-bottom: 4px; padding-right: 8px;
    background: transparent; border: none; border-left: 2px solid transparent; border-radius: 0;
    color: var(--fg-1); font-family: var(--font-mono); font-size: 11.5px; cursor: pointer;
    transition: background 60ms;
  }
  .tree-row:hover { background: var(--bg-2); color: var(--fg-0); border-color: transparent; }
  .tree-row.sel { background: var(--accent-dim); border-left-color: var(--accent); color: var(--fg-0); }
  .tree-row.dir { cursor: pointer; }
  .tree-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dir-name { color: var(--fg-0); font-weight: 500; }

  .chevron {
    flex-shrink: 0; color: var(--fg-3);
    transition: transform 120ms;
    transform: rotate(0deg);
  }
  .chevron.open { transform: rotate(90deg); }

  .spin-icon {
    flex-shrink: 0; font-size: 11px; color: var(--fg-3);
    animation: spin 1s linear infinite; display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .file-badge {
    flex-shrink: 0; font-family: var(--font-mono); font-size: 8px;
    font-weight: 700; letter-spacing: .3px; opacity: .9;
    width: 14px; text-align: center;
  }

  /* Editor column */
  .editor-col { display: flex; flex-direction: column; overflow: hidden; background: var(--bg-0); }
</style>
