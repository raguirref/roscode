<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from "svelte";
  import { openFiles, activeFile, updateFileContent, closeFile, type FileTab } from "../stores/layout";
  import * as monaco from "monaco-editor";
  import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
  import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
  import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
  import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
  import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

  // Configure Monaco worker environment for Tauri/WKWebView
  (self as any).MonacoEnvironment = {
    getWorker(_: unknown, label: string) {
      if (label === "json") return new jsonWorker();
      if (label === "css" || label === "scss" || label === "less") return new cssWorker();
      if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
      if (label === "typescript" || label === "javascript") return new tsWorker();
      return new editorWorker();
    },
  };

  let container: HTMLDivElement;
  let editor: monaco.editor.IStandaloneCodeEditor | null = null;
  let currentPath: string | null = null;
  let models: Map<string, monaco.editor.ITextModel> = new Map();

  // VS Code dark+ theme colours
  const ROSCODE_THEME: monaco.editor.IStandaloneThemeData = {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "4e5868", fontStyle: "italic" },
      { token: "keyword", foreground: "4cc9f0" },
      { token: "string", foreground: "3dd68c" },
      { token: "number", foreground: "a78bfa" },
      { token: "type", foreground: "f59e0b" },
    ],
    colors: {
      "editor.background": "#080b0f",
      "editor.foreground": "#e8ecf0",
      "editor.lineHighlightBackground": "#0f1318",
      "editor.selectionBackground": "#4cc9f020",
      "editor.inactiveSelectionBackground": "#4cc9f010",
      "editorLineNumber.foreground": "#2a3340",
      "editorLineNumber.activeForeground": "#4e5868",
      "editorIndentGuide.background": "#1e2430",
      "editorIndentGuide.activeBackground": "#2a3340",
      "editorGutter.background": "#080b0f",
      "editorWidget.background": "#0f1318",
      "editorWidget.border": "#1e2430",
      "input.background": "#080b0f",
      "input.foreground": "#e8ecf0",
      "input.border": "#1e2430",
      "focusBorder": "#4cc9f0",
      "scrollbarSlider.background": "#1e243080",
      "scrollbarSlider.hoverBackground": "#2a3340",
      "scrollbarSlider.activeBackground": "#4cc9f040",
    },
  };

  onMount(() => {
    monaco.editor.defineTheme("roscode-dark", ROSCODE_THEME);

    editor = monaco.editor.create(container, {
      theme: "roscode-dark",
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      fontLigatures: true,
      lineHeight: 20,
      padding: { top: 12, bottom: 12 },
      minimap: { enabled: true, maxColumn: 80, renderCharacters: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      renderLineHighlight: "line",
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      folding: true,
      glyphMargin: false,
      wordWrap: "off",
      scrollbar: { vertical: "auto", horizontal: "auto", verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      model: null,
    });

    // Listen for content changes to mark as dirty
    editor.onDidChangeModelContent(() => {
      const path = $activeFile;
      if (path) updateFileContent(path, editor!.getValue());
    });

    return () => {
      models.forEach((m) => m.dispose());
      editor?.dispose();
    };
  });

  // Reactively switch model when active file changes
  $: if (editor && $activeFile !== currentPath) {
    switchToFile($activeFile);
  }

  $: if (editor && $openFiles) {
    syncModels($openFiles);
  }

  function syncModels(tabs: FileTab[]) {
    if (!editor) return;
    // Create missing models
    for (const tab of tabs) {
      if (!models.has(tab.path)) {
        const uri = monaco.Uri.parse(`file://${tab.path}`);
        const lang = getLang(tab.language);
        const model = monaco.editor.createModel(tab.content, lang, uri);
        models.set(tab.path, model);
      }
    }
    // Dispose removed models
    const paths = new Set(tabs.map((t) => t.path));
    for (const [path, model] of models) {
      if (!paths.has(path)) {
        model.dispose();
        models.delete(path);
      }
    }
  }

  function switchToFile(path: string | null) {
    if (!editor || !path) return;
    currentPath = path;
    const model = models.get(path);
    if (model) {
      editor.setModel(model);
      editor.focus();
    }
  }

  function getLang(lang: string) {
    const map: Record<string, string> = {
      python: "python",
      xml: "xml",
      yaml: "yaml",
      json: "json",
      cpp: "cpp",
      cmake: "plaintext",
    };
    return map[lang] ?? "plaintext";
  }

  function langColor(lang: string) {
    const map: Record<string, string> = {
      python: "#4cc9f0",
      xml: "#f59e0b",
      yaml: "#a78bfa",
      json: "#3dd68c",
      cpp: "#f59e0b",
    };
    return map[lang] ?? "var(--fg-2)";
  }
</script>

<div class="editor-wrap">
  <!-- Tab bar -->
  {#if $openFiles.length > 0}
    <div class="tab-bar">
      {#each $openFiles as tab}
        <button
          class="tab"
          class:active={$activeFile === tab.path}
          on:click={() => activeFile.set(tab.path)}
        >
          <span class="tab-lang-dot" style="background:{langColor(tab.language)}"></span>
          <span class="tab-name">{tab.name}</span>
          {#if tab.dirty}<span class="dirty-dot"></span>{/if}
          <button
            class="close-btn"
            on:click|stopPropagation={() => closeFile(tab.path)}
            title="Close"
          >×</button>
        </button>
      {/each}
    </div>

    <!-- Breadcrumb -->
    {#if $activeFile}
      {@const parts = $activeFile.replace(/^\//, "").split("/")}
      <div class="breadcrumb">
        {#each parts as part, i}
          <span class="crumb">{part}</span>
          {#if i < parts.length - 1}<span class="crumb-sep">›</span>{/if}
        {/each}
      </div>
    {/if}
  {:else}
    <!-- Welcome screen when no file open -->
    <div class="welcome">
      <div class="welcome-logo">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      </div>
      <p class="welcome-title">roscode <span>studio</span></p>
      <p class="welcome-sub">Open a file from the Explorer to start editing</p>
      <div class="welcome-hints">
        <div class="hint">
          <kbd>⊞</kbd> Browse packages
        </div>
        <div class="hint">
          <kbd>📄</kbd> Open workspace files
        </div>
        <div class="hint">
          <kbd>◈</kbd> Chat with the agent
        </div>
      </div>
    </div>
  {/if}

  <div class="monaco-container" bind:this={container}></div>
</div>

<style>
  .editor-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--bg-0);
  }

  /* Tab bar */
  .tab-bar {
    height: var(--tab-bar-height);
    display: flex;
    align-items: stretch;
    background: var(--bg-1);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    flex-shrink: 0;
  }
  .tab-bar::-webkit-scrollbar { height: 0; }

  .tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 12px;
    min-width: 100px;
    max-width: 180px;
    background: var(--bg-1);
    border: none;
    border-right: 1px solid var(--border);
    border-bottom: 2px solid transparent;
    border-radius: 0;
    font-size: 12px;
    color: var(--fg-2);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    position: relative;
    transition: color 100ms, background 100ms;
  }
  .tab:hover { color: var(--fg-0); background: var(--bg-2); border-color: var(--border); border-bottom-color: transparent; }
  .tab.active {
    color: var(--fg-0);
    background: var(--bg-0);
    border-bottom-color: var(--accent);
  }

  .tab-lang-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .tab-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }

  .dirty-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent-warm);
    flex-shrink: 0;
  }

  .close-btn {
    padding: 0;
    width: 16px; height: 16px;
    background: transparent;
    border: none;
    border-radius: 3px;
    font-size: 14px;
    line-height: 1;
    color: var(--fg-2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .close-btn:hover { background: var(--bg-3); color: var(--fg-0); border: none; }

  /* Breadcrumb */
  .breadcrumb {
    height: 22px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 4px;
    font-size: 11px;
    color: var(--fg-2);
    background: var(--bg-0);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow: hidden;
  }
  .crumb:last-child { color: var(--fg-0); }
  .crumb-sep { color: var(--fg-2); opacity: 0.5; }

  /* Monaco container */
  .monaco-container {
    flex: 1;
    overflow: hidden;
  }

  /* Welcome screen */
  .welcome {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    pointer-events: none;
    z-index: 1;
  }
  .welcome-logo { opacity: 0.3; }
  .welcome-title {
    font-size: 22px;
    font-weight: 600;
    color: var(--fg-0);
    letter-spacing: -0.5px;
    opacity: 0.5;
  }
  .welcome-title span { color: var(--accent); opacity: 1; }
  .welcome-sub { font-size: 12px; color: var(--fg-2); }
  .welcome-hints {
    display: flex;
    gap: 16px;
    margin-top: 8px;
    pointer-events: all;
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--fg-2);
  }
  kbd {
    background: var(--bg-2);
    border: 1px solid var(--border-bright);
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 11px;
    font-family: inherit;
    color: var(--fg-1);
  }
</style>
