<script lang="ts">
  import { isRuntimeReady, runtimeStatus } from "../stores/layout";
  import {
    terminalSessions, activeTerminalId,
    createTerminalSession, connectSession, closeSession, renameSession,
  } from "../stores/terminalStore";
  import TerminalView from "../TerminalView.svelte";

  $: port = $runtimeStatus.kind === "ready" ? ($runtimeStatus as any).agent_ws_port : 0;
  $: activeSession = $terminalSessions.find(s => s.id === $activeTerminalId);

  let editingId: string | null = null;
  let editingName = "";

  function addTab() {
    if (!$isRuntimeReady) return;
    const id = createTerminalSession(port, `Terminal ${$terminalSessions.length + 1}`);
    connectSession(id);
  }

  function removeTab(id: string, e: MouseEvent) {
    e.stopPropagation();
    closeSession(id);
  }

  function startRename(id: string, name: string, e: MouseEvent) {
    e.stopPropagation();
    editingId = id;
    editingName = name;
  }

  function commitRename() {
    if (editingId && editingName.trim()) {
      renameSession(editingId, editingName.trim());
    }
    editingId = null;
  }

  function handleRenameKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") editingId = null;
  }
</script>

<div class="page">
  <!-- ── Tab bar ── -->
  <div class="tab-bar">
    {#each $terminalSessions as s (s.id)}
      <button
        class="tab"
        class:active={$activeTerminalId === s.id}
        on:click={() => activeTerminalId.set(s.id)}
        on:dblclick={(e) => startRename(s.id, s.name, e)}
        title="Double-click to rename"
      >
        <span class="tab-dot" class:live={s.connected}></span>
        {#if editingId === s.id}
          <!-- svelte-ignore a11y-autofocus -->
          <input
            class="tab-rename"
            bind:value={editingName}
            on:blur={commitRename}
            on:keydown={handleRenameKey}
            on:click|stopPropagation={() => {}}
            autofocus
          />
        {:else}
          <span class="tab-name">{s.name}</span>
        {/if}
        <button class="tab-close" on:click={(e) => removeTab(s.id, e)} title="Close terminal" disabled={$terminalSessions.length === 1}>×</button>
      </button>
    {/each}

    {#if $isRuntimeReady}
      <button class="tab-add" on:click={addTab} title="New terminal">+</button>
    {/if}

    <div class="tab-spacer"></div>
  </div>

  <!-- ── Terminal body ── -->
  <div class="term-body">
    {#if !$isRuntimeReady}
      <div class="offline-msg">
        <div class="spinner-large"></div>
        <p>Waiting for runtime to be ready…</p>
      </div>
    {:else if $terminalSessions.length === 0}
      <div class="offline-msg">
        <p>No terminal sessions. Click <strong>+</strong> to create one.</p>
      </div>
    {:else if $activeTerminalId}
      {#key $activeTerminalId}
        <TerminalView sessionId={$activeTerminalId} />
      {/key}
    {/if}
  </div>
</div>

<style>
  .page { flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0; background: var(--bg-0); }

  /* Tab bar */
  .tab-bar {
    height: 32px;
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
    gap: 6px;
    padding: 0 10px 0 12px;
    min-width: 100px;
    max-width: 180px;
    background: var(--bg-1);
    border: none;
    border-right: 1px solid var(--border);
    border-top: 2px solid transparent;
    border-radius: 0;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--fg-2);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color 100ms, background 100ms;
  }
  .tab:hover { color: var(--fg-0); background: var(--bg-2); border-color: var(--border); border-top-color: transparent; }
  .tab.active {
    color: var(--fg-0);
    background: var(--bg-0);
    border-top-color: var(--accent);
  }

  .tab-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--fg-3); flex-shrink: 0;
  }
  .tab-dot.live { background: var(--ok); box-shadow: 0 0 4px var(--ok); }

  .tab-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }

  .tab-rename {
    flex: 1; background: var(--bg-3); border: 1px solid var(--accent-line);
    color: var(--fg-0); font-family: var(--font-mono); font-size: 11px;
    padding: 1px 4px; border-radius: 3px; outline: none; min-width: 60px;
  }

  .tab-close {
    width: 16px; height: 16px;
    background: transparent; border: none; border-radius: 3px;
    font-size: 13px; line-height: 1; color: var(--fg-3);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; cursor: pointer; padding: 0;
  }
  .tab-close:hover { background: var(--bg-3); color: var(--err); border: none; }
  .tab-close:disabled { opacity: 0.3; cursor: default; pointer-events: none; }

  .tab-add {
    padding: 0 14px;
    background: transparent; border: none; border-right: 1px solid var(--border);
    font-size: 18px; line-height: 1;
    color: var(--fg-2); cursor: pointer;
    flex-shrink: 0;
    display: flex; align-items: center;
    transition: color 100ms, background 100ms;
  }
  .tab-add:hover { color: var(--accent); background: var(--bg-2); }

  .tab-spacer { flex: 1; }

  /* Terminal body */
  .term-body {
    flex: 1; overflow: hidden;
    background: #0a0d0c;
    display: flex; flex-direction: column;
  }

  .offline-msg {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; color: var(--fg-3); font-family: var(--font-mono); font-size: 13px;
  }
  .offline-msg strong { color: var(--accent); }

  .spinner-large {
    width: 32px; height: 32px; border: 2px solid var(--border); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
