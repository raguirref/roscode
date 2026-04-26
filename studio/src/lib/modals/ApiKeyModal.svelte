<script lang="ts">
  import { onMount } from "svelte";
  import { apiKeySave, apiKeyStatus } from "../tauri";
  import { apiKeyOk, showApiKeyModal } from "./apiKeyState";

  let key = "";
  let saving = false;
  let savedAt = "";
  let error = "";

  async function refresh() {
    try {
      const ok = await apiKeyStatus();
      apiKeyOk.set(ok);
    } catch {
      apiKeyOk.set(false);
    }
  }

  onMount(refresh);

  function close() {
    if (saving) return;
    showApiKeyModal.set(false);
    key = "";
    error = "";
    savedAt = "";
  }

  async function save() {
    if (!key.trim() || saving) return;
    saving = true;
    error = "";
    try {
      const path = await apiKeySave(key.trim());
      savedAt = path;
      apiKeyOk.set(true);
      key = "";
      setTimeout(() => showApiKeyModal.set(false), 1200);
    } catch (e) {
      error = String(e);
    } finally {
      saving = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if $showApiKeyModal}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="API Key" on:click={close}>
    <div class="modal" on:click|stopPropagation>
      <div class="head">
        <div>
          <div class="eyebrow">// CONFIGURATION</div>
          <div class="title">Anthropic API Key</div>
        </div>
        <button class="x" on:click={close} disabled={saving}>×</button>
      </div>

      <div class="body">
        <p class="copy">
          The agent uses Claude via your own Anthropic API key. It's stored
          in this repo's <code>.env</code> file and never leaves your machine.
        </p>

        <a class="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          → Get your key at console.anthropic.com
        </a>

        <label class="label" for="api-key">API KEY</label>
        <input
          id="api-key"
          type="password"
          placeholder="sk-ant-…"
          bind:value={key}
          spellcheck="false"
          autocomplete="off"
          disabled={saving}
        />

        {#if error}
          <div class="msg err">⚠ {error}</div>
        {/if}
        {#if savedAt}
          <div class="msg ok">✓ Saved to {savedAt}. Restart the runtime to pick it up.</div>
        {/if}

        <div class="actions">
          <button class="btn ghost" on:click={close} disabled={saving}>Cancel</button>
          <button class="btn primary" on:click={save} disabled={!key.trim() || saving}>
            {saving ? "Saving…" : "Save key"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 1200;
    background: rgba(0,0,0,.55); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 40px;
    animation: fade 120ms ease;
  }
  @keyframes fade { from{opacity:0} to{opacity:1} }

  .modal {
    width: min(520px, 100%);
    background: var(--bg-1); border: 1px solid var(--border-bright);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }
  .head {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 18px 20px; border-bottom: 1px solid var(--border);
  }
  .eyebrow { font-family: var(--font-mono); font-size: 10px; color: var(--accent); letter-spacing: 1.5px; }
  .title { font-size: 20px; font-weight: 600; letter-spacing: -.3px; margin-top: 3px; }
  .x {
    background: transparent; border: 1px solid var(--border); width: 28px; height: 28px;
    border-radius: var(--radius-sm); color: var(--fg-2); font-size: 18px; line-height: 1;
    padding: 0; cursor: pointer;
  }
  .x:hover { color: var(--err); border-color: var(--err); }

  .body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
  .copy { color: var(--fg-1); font-size: 13px; line-height: 1.6; margin: 0; }
  .copy code { background: var(--bg-3); padding: 1px 6px; border-radius: 4px; color: var(--accent); font-family: var(--font-mono); font-size: 12px; }
  .link { color: var(--accent); font-size: 12.5px; text-decoration: none; }
  .link:hover { text-decoration: underline; }

  .label {
    font-family: var(--font-mono); font-size: 9.5px; color: var(--fg-2);
    letter-spacing: 1.5px; text-transform: uppercase;
  }
  input {
    padding: 10px 12px; font-family: var(--font-mono); font-size: 13px;
    background: var(--bg-0); border: 1px solid var(--border-bright);
    border-radius: var(--radius-sm); color: var(--fg-0); width: 100%;
  }

  .msg {
    padding: 9px 12px; border-radius: var(--radius-sm);
    font-size: 12px; line-height: 1.4;
  }
  .msg.err { background: rgba(240,124,124,.08); border: 1px solid rgba(240,124,124,.3); color: var(--err); }
  .msg.ok { background: rgba(108,208,107,.08); border: 1px solid rgba(108,208,107,.3); color: var(--ok); }

  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
  .btn {
    padding: 8px 18px; font-size: 12px; font-weight: 500;
    border-radius: var(--radius-sm); cursor: pointer; border: 1px solid;
    font-family: var(--font-sans);
  }
  .btn.ghost { background: transparent; border-color: var(--border-bright); color: var(--fg-1); }
  .btn.ghost:hover:not(:disabled) { color: var(--fg-0); border-color: var(--fg-2); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #1a1408; font-weight: 600; }
  .btn.primary:hover:not(:disabled) { opacity: .92; }
</style>
