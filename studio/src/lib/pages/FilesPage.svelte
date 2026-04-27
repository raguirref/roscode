<script lang="ts">
  import { onMount, tick } from "svelte";
  import { workspacePath, openFile, activeFile, openFiles, filesRefreshTick, isRuntimeReady, refreshFiles } from "../stores/layout";
  import {
    fsReadDir, fsReadFile, containerReadDir, containerReadFile, type FsNode,
    fsRemove, fsCreateDir, fsRename, fsWriteFile,
    containerRemove, containerCreateDir, containerRename, containerWriteFile,
  } from "../tauri";
  import MonacoEditor from "../editor/MonacoEditor.svelte";

  // ── Tree node type ──────────────────────────────────────────────────────────
  interface TreeNode extends FsNode {
    depth: number;
    expanded: boolean;
    loading: boolean;
    children: TreeNode[] | null;
  }

  let roots: TreeNode[] = [];
  let loadingRoot = false;
  let filter = "";
  let errorMsg = "";

  // Sidebar resize
  let treeWidth = 240;
  let resizing = false;
  let resizeStartX = 0;
  let resizeStartW = 0;

  function onResizerDown(e: MouseEvent) {
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartW = treeWidth;
    e.preventDefault();
  }

  function onGlobalMouseMove(e: MouseEvent) {
    if (!resizing) return;
    treeWidth = Math.max(160, Math.min(500, resizeStartW + (e.clientX - resizeStartX)));
  }

  function onGlobalMouseUp() { resizing = false; }

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

  // Flatten all FILES recursively (for search, ignores expansion state)
  function flattenAllFiles(nodes: TreeNode[]): TreeNode[] {
    const out: TreeNode[] = [];
    for (const n of nodes) {
      if (!n.is_dir) {
        out.push(n);
      } else if (n.children) {
        out.push(...flattenAllFiles(n.children));
      }
    }
    return out;
  }

  // ── Reactive tree ───────────────────────────────────────────────────────────
  $: visibleNodes = flatten(roots);

  $: filteredNodes = filter.trim()
    ? flattenAllFiles(roots).filter(
        (n) => n.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : visibleNodes;

  // ── Load workspace root ─────────────────────────────────────────────────────
  $: treeRoot = $isRuntimeReady ? "/workspace" : $workspacePath;
  let lastTreeRoot = "";
  $: if (treeRoot && treeRoot !== lastTreeRoot) { lastTreeRoot = treeRoot; loadRoot(treeRoot); }
  $: if ($filesRefreshTick && treeRoot) reloadDir(treeRoot);

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

  // ── Find a node by path anywhere in the tree ────────────────────────────────
  function findNode(nodes: TreeNode[], path: string): TreeNode | null {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.is_dir && n.children) {
        const found = findNode(n.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  // ── Reload a single directory without collapsing the rest of the tree ───────
  async function reloadDir(dirPath: string) {
    if (!dirPath) return;
    if (dirPath === treeRoot) {
      try {
        const entries = await readDir(dirPath);
        // Merge: preserve existing nodes' expansion state
        roots = entries.map((e) => {
          const existing = roots.find((n) => n.path === e.path);
          return existing ?? toTreeNode(e, 0);
        });
      } catch {}
      return;
    }
    const node = findNode(roots, dirPath);
    if (!node) { loadRoot(treeRoot); return; }
    try {
      const entries = await readDir(dirPath);
      node.children = entries.map((e) => {
        const existing = node.children?.find((c) => c.path === e.path);
        return existing ?? toTreeNode(e, node.depth + 1);
      });
      node.expanded = true;
    } catch {}
    roots = roots;
  }

  // ── Auto-reveal active file (expand path, scroll into view) ─────────────────
  let treeBody: HTMLDivElement;
  let revealingPath = "";

  async function revealFile(filePath: string) {
    if (!filePath || !treeRoot || !filePath.startsWith(treeRoot)) return;
    if (filePath === revealingPath) return;
    revealingPath = filePath;

    const rel = filePath.slice(treeRoot.length).replace(/^\//, "");
    const parts = rel.split("/").filter(Boolean);
    if (parts.length <= 1) {
      tick().then(scrollToSel);
      return;
    }

    let currentLevel = roots;
    let currentPath = treeRoot;
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = `${currentPath}/${parts[i]}`;
      let node = currentLevel.find((n) => n.path === currentPath);
      if (!node) break;
      if (!node.expanded) {
        node.expanded = true;
        if (node.children === null) {
          try {
            const entries = await readDir(node.path);
            node.children = entries.map((e) => toTreeNode(e, node.depth + 1));
          } catch { break; }
        }
        roots = roots;
      }
      currentLevel = node.children ?? [];
    }
    await tick();
    scrollToSel();
  }

  function scrollToSel() {
    treeBody?.querySelector<HTMLElement>(".tree-row.sel")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  $: if ($activeFile) revealFile($activeFile);

  // ── Search: preload all directories lazily ─────────────────────────────────
  let searchPreloaded = false;

  $: {
    if (filter.trim() && !searchPreloaded) {
      searchPreloaded = true;
      preloadAllDirs(roots);
    } else if (!filter.trim()) {
      searchPreloaded = false;
    }
  }

  async function preloadAllDirs(nodes: TreeNode[]): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const n of nodes) {
      if (!n.is_dir) continue;
      if (n.children === null) {
        promises.push(
          readDir(n.path)
            .then((entries) => {
              n.children = entries.map((e) => toTreeNode(e, n.depth + 1));
            })
            .catch(() => { n.children = []; })
        );
      } else {
        promises.push(preloadAllDirs(n.children));
      }
    }
    await Promise.all(promises);
    roots = roots; // trigger reactivity
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

  // ── Context menu ───────────────────────────────────────────────────────────
  interface CtxMenu { x: number; y: number; node: TreeNode | null; parentPath: string; }
  let ctxMenu: CtxMenu | null = null;

  // Inline create/rename state
  interface InlineEdit { mode: "new-file" | "new-folder" | "rename"; parentPath: string; node?: TreeNode; }
  let inlineEdit: InlineEdit | null = null;
  let inlineValue = "";
  let inlineInput: HTMLInputElement;

  // Delete confirmation (replaces window.confirm which is blocked in Tauri)
  let deleteTarget: TreeNode | null = null;

  function openCtxMenu(e: MouseEvent, node: TreeNode | null, parentPath: string) {
    e.preventDefault();
    e.stopPropagation();
    ctxMenu = { x: e.clientX, y: e.clientY, node, parentPath };
  }

  function closeCtxMenu() { ctxMenu = null; }

  function startInline(mode: "new-file" | "new-folder" | "rename", parentPath: string, node?: TreeNode) {
    closeCtxMenu();
    inlineEdit = { mode, parentPath, node };
    inlineValue = mode === "rename" && node ? node.name : "";
    tick().then(() => { inlineInput?.focus(); inlineInput?.select(); });
  }

  async function commitInline() {
    if (!inlineEdit || !inlineValue.trim()) { inlineEdit = null; return; }
    const val = inlineValue.trim();
    const parentPath = inlineEdit.parentPath;
    try {
      if (inlineEdit.mode === "new-file") {
        const p = `${parentPath}/${val}`;
        if ($isRuntimeReady) await containerWriteFile(p, "");
        else await fsWriteFile(p, "");
      } else if (inlineEdit.mode === "new-folder") {
        const p = `${parentPath}/${val}`;
        if ($isRuntimeReady) await containerCreateDir(p);
        else await fsCreateDir(p);
      } else if (inlineEdit.mode === "rename" && inlineEdit.node) {
        const dir = inlineEdit.node.path.split("/").slice(0, -1).join("/");
        const newPath = `${dir}/${val}`;
        if ($isRuntimeReady) await containerRename(inlineEdit.node.path, newPath);
        else await fsRename(inlineEdit.node.path, newPath);
        await reloadDir(dir);
        inlineEdit = null;
        return;
      }
      await reloadDir(parentPath);
    } catch (e) { console.error("file op failed:", e); }
    inlineEdit = null;
  }

  function deleteNode(node: TreeNode) {
    closeCtxMenu();
    deleteTarget = node;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const node = deleteTarget;
    deleteTarget = null;
    const parentPath = node.path.split("/").slice(0, -1).join("/");
    try {
      if ($isRuntimeReady) await containerRemove(node.path);
      else await fsRemove(node.path);
      const parent = findNode(roots, parentPath);
      if (parent && parent.children) {
        parent.children = parent.children.filter((c) => c.path !== node.path);
        roots = roots;
      } else if (parentPath === treeRoot) {
        roots = roots.filter((n) => n.path !== node.path);
      }
      await reloadDir(parentPath);
    } catch (e) { console.error("delete failed:", e); }
  }

  // ── File icon ──────────────────────────────────────────────────────────────
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

<svelte:window on:mousemove={onGlobalMouseMove} on:mouseup={onGlobalMouseUp} on:click={closeCtxMenu} on:keydown={(e) => { if (e.key === 'Escape') { ctxMenu = null; inlineEdit = null; } }} />

<div class="page">
  <!-- ── File tree sidebar ── -->
  <div class="tree-col" style="width:{treeWidth}px">
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
        autocomplete="off"
        spellcheck="false"
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
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="tree-body" bind:this={treeBody} on:contextmenu={(e) => { if (e.target === e.currentTarget) openCtxMenu(e, null, treeRoot || ""); }}>
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
            on:contextmenu={(e) => openCtxMenu(e, node, node.is_dir ? node.path : node.path.split("/").slice(0, -1).join("/"))}
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
              <!-- In search mode, show the parent path for context -->
              {#if filter.trim()}
                <span class="file-badge" style="color:{getLangColor(node.name)}">{fileIcon(node.name)}</span>
                <span class="tree-name">{node.name}</span>
                <span class="search-path">{node.path.replace(treeRoot, '').split('/').slice(1,-1).join('/')}</span>
              {:else}
                <span class="file-badge" style="color:{getLangColor(node.name)}">{fileIcon(node.name)}</span>
                <span class="tree-name">{node.name}</span>
              {/if}
            {/if}
          </button>
        {/each}
      {/if}
    </div>

    <!-- Resize handle -->
    <div
      class="tree-resizer"
      on:mousedown={onResizerDown}
      role="separator"
      aria-label="Resize file tree"
      class:resizing
    ></div>
  </div>

  <!-- ── Editor area ── -->
  <div class="editor-col">
    <MonacoEditor />
  </div>
</div>

<!-- ── Context menu ── -->
{#if ctxMenu}
  {@const _m = ctxMenu}
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <div class="ctx-overlay" on:click={closeCtxMenu} on:contextmenu|preventDefault={closeCtxMenu}></div>
  <div class="ctx-menu" style="left:{_m.x}px;top:{_m.y}px" on:click|stopPropagation>
    <button class="ctx-item" on:click={() => startInline("new-file", _m.parentPath)}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      New File
    </button>
    <button class="ctx-item" on:click={() => startInline("new-folder", _m.parentPath)}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" opacity=".7"><path d="M3 7a2 2 0 012-2h4l2 2h9a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
      New Folder
    </button>
    {#if _m.node}
      {@const _n = _m.node}
      <div class="ctx-sep"></div>
      <button class="ctx-item" on:click={() => startInline("rename", _m.parentPath, _n)}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Rename
      </button>
      <button class="ctx-item ctx-danger" on:click={() => deleteNode(_n)}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        Delete
      </button>
    {/if}
  </div>
{/if}

<!-- ── Inline rename / new file input ── -->
{#if inlineEdit}
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <div class="inline-overlay" on:click={() => { inlineEdit = null; }}></div>
  <div class="inline-popup">
    <span class="inline-label">
      {inlineEdit.mode === "new-file" ? "New file" : inlineEdit.mode === "new-folder" ? "New folder" : "Rename"}
    </span>
    <input
      bind:this={inlineInput}
      bind:value={inlineValue}
      class="inline-input"
      placeholder={inlineEdit.mode === "new-file" ? "filename.py" : inlineEdit.mode === "new-folder" ? "folder-name" : "new name"}
      on:keydown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commitInline(); }
        else if (e.key === "Escape") { inlineEdit = null; }
      }}
    />
    <div class="inline-actions">
      <button class="inline-ok" on:click={commitInline}>OK</button>
      <button class="inline-cancel" on:click={() => (inlineEdit = null)}>Cancel</button>
    </div>
  </div>
{/if}

<!-- ── Delete confirmation ── -->
{#if deleteTarget}
  {@const _dt = deleteTarget}
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <div class="inline-overlay" on:click={() => (deleteTarget = null)}></div>
  <div class="inline-popup del-popup">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--err)" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
    <span class="del-msg">Delete <strong>{_dt.name}</strong>?{_dt.is_dir ? " This will delete all contents." : ""}</span>
    <div class="inline-actions">
      <button class="inline-ok del-ok" on:click={confirmDelete}>Delete</button>
      <button class="inline-cancel" on:click={() => (deleteTarget = null)}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .page {
    flex: 1; overflow: hidden;
    display: flex; min-height: 0;
  }

  /* Tree column */
  .tree-col {
    border-right: 1px solid var(--border);
    background: var(--bg-1);
    display: flex; flex-direction: column; overflow: hidden;
    flex-shrink: 0;
    position: relative;
    min-width: 160px;
    max-width: 500px;
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
    transition: border-color 150ms;
  }
  .search-box:focus-within { border-color: var(--accent-line); }
  .search-input {
    flex: 1; background: transparent; border: none; outline: none;
    font-family: var(--font-mono); font-size: 11px; color: var(--fg-0);
    -webkit-appearance: none;
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

  .search-path {
    font-size: 9.5px; color: var(--fg-3); flex-shrink: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 80px;
  }

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

  /* Resize handle */
  .tree-resizer {
    position: absolute;
    top: 0; right: -2px; bottom: 0;
    width: 4px;
    cursor: col-resize;
    z-index: 10;
  }
  .tree-resizer:hover, .tree-resizer.resizing {
    background: var(--accent);
    opacity: 0.5;
  }

  /* Editor column */
  .editor-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-0); min-width: 0; }

  /* Context menu */
  .ctx-overlay { position: fixed; inset: 0; z-index: 900; }
  .ctx-menu {
    position: fixed; z-index: 901;
    background: var(--bg-1); border: 1px solid var(--border-bright);
    border-radius: var(--radius); box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    min-width: 160px; padding: 4px 0; overflow: hidden;
  }
  .ctx-item {
    display: flex; align-items: center; gap: 9px;
    width: 100%; padding: 6px 14px;
    background: transparent; border: none; cursor: pointer;
    font-family: var(--font-mono); font-size: 11.5px; color: var(--fg-1);
    text-align: left;
  }
  .ctx-item:hover { background: var(--bg-2); color: var(--fg-0); }
  .ctx-item svg { flex-shrink: 0; color: var(--fg-3); }
  .ctx-danger { color: var(--err); }
  .ctx-danger:hover { background: rgba(224,102,102,.08); color: var(--err); }
  .ctx-sep { height: 1px; background: var(--border); margin: 3px 0; }

  /* Inline new-file / rename popup */
  .inline-overlay { position: fixed; inset: 0; z-index: 902; }
  .inline-popup {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 903;
    background: var(--bg-1); border: 1px solid var(--border-bright);
    border-radius: var(--radius); box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    padding: 16px; display: flex; flex-direction: column; gap: 10px;
    min-width: 280px;
  }
  .inline-label { font-family: var(--font-mono); font-size: 10px; color: var(--accent); letter-spacing: 1px; text-transform: uppercase; }
  .inline-input {
    background: var(--bg-0); border: 1px solid var(--border-bright); border-radius: 6px;
    padding: 8px 12px; font-family: var(--font-mono); font-size: 12px; color: var(--fg-0);
    outline: none;
  }
  .inline-input:focus { border-color: var(--accent-line); box-shadow: 0 0 0 2px var(--accent-dim); }
  .inline-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .inline-ok {
    padding: 6px 16px; background: var(--accent); border: none; border-radius: 6px;
    font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: #1a1408; cursor: pointer;
  }
  .inline-ok:hover { opacity: .9; }
  .inline-cancel {
    padding: 6px 14px; background: transparent; border: 1px solid var(--border-bright);
    border-radius: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--fg-2); cursor: pointer;
  }
  .inline-cancel:hover { color: var(--fg-0); border-color: var(--fg-2); }

  .del-popup { gap: 12px; }
  .del-popup svg { flex-shrink: 0; align-self: center; }
  .del-msg { font-family: var(--font-sans); font-size: 13px; color: var(--fg-1); line-height: 1.5; }
  .del-msg strong { color: var(--fg-0); font-weight: 600; }
  .del-ok { background: var(--err); }
  .del-ok:hover { opacity: .85; }
</style>
