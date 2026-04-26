<script lang="ts">
  import { onMount } from "svelte";
  import { showNewPackageModal, isRuntimeReady, workspacePath } from "../stores/layout";
  import { rosCallTool } from "../tauri";

  const templates = [
    {
      id: "minimal",
      label: "MINIMAL NODE",
      cat: "BARE",
      desc: "Bare ament_python package with one hello-world node, package.xml, setup.py, and resource/ marker.",
      node: "hello_node",
      deps: [] as string[],
    },
    {
      id: "publisher",
      label: "PUBLISHER",
      cat: "BASIC",
      desc: "A timer-driven publisher that emits std_msgs/String at 1 Hz on a configurable topic.",
      node: "publisher_node",
      deps: ["std_msgs"],
    },
    {
      id: "subscriber",
      label: "SUBSCRIBER",
      cat: "BASIC",
      desc: "Subscribes to a configurable topic and logs incoming messages.",
      node: "subscriber_node",
      deps: ["std_msgs"],
    },
    {
      id: "service",
      label: "SERVICE",
      cat: "BASIC",
      desc: "Exposes an std_srvs/Trigger service the user can call from the CLI.",
      node: "service_node",
      deps: ["std_srvs"],
    },
    {
      id: "controller",
      label: "PID CONTROLLER",
      cat: "CONTROL",
      desc: "Skeleton PID controller that subscribes to a setpoint topic and publishes a control output.",
      node: "pid_node",
      deps: ["std_msgs", "control_msgs"],
    },
    {
      id: "lifecycle",
      label: "LIFECYCLE NODE",
      cat: "ADVANCED",
      desc: "Lifecycle-managed node with on_configure / on_activate / on_deactivate hooks.",
      node: "lifecycle_node",
      deps: ["lifecycle_msgs"],
    },
  ];

  type Template = (typeof templates)[0];

  let selected: Template = templates[0];
  let packageName = "my_package";
  let nodeName = selected.node;
  let description = "A new ROS 2 package";
  let creating = false;
  let result = "";
  let error = "";

  $: if (selected) nodeName = selected.node;

  $: nameValid = /^[a-z][a-z0-9_]*$/.test(packageName);
  $: nodeValid = /^[a-z][a-z0-9_]*$/.test(nodeName);
  $: canCreate = nameValid && nodeValid && description.trim().length > 0 && !creating;

  function close() {
    if (creating) return;
    showNewPackageModal.set(false);
    result = "";
    error = "";
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  async function create() {
    if (!canCreate) return;
    if (!$isRuntimeReady) {
      error = "Start the runtime first (top-right START ROS button).";
      return;
    }
    creating = true;
    error = "";
    result = "";
    try {
      const out = await rosCallTool("package_scaffold", {
        package_name: packageName,
        node_name: nodeName,
        description,
      });
      if (out.toLowerCase().startsWith("error")) {
        error = out;
      } else {
        result = out;
        // close after 1.5s
        setTimeout(() => {
          showNewPackageModal.set(false);
          result = "";
        }, 1800);
      }
    } catch (e) {
      error = String(e);
    } finally {
      creating = false;
    }
  }

  onMount(() => {
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });
</script>

{#if $showNewPackageModal}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label="New ROS Package"
    on:click={close}
  >
    <div class="modal" on:click|stopPropagation>
      <!-- header -->
      <div class="modal-header">
        <div>
          <div class="label-sm accent">// SCAFFOLD</div>
          <div class="modal-title">new ROS package</div>
        </div>
        <button class="x-btn" on:click={close} title="Close (Esc)" disabled={creating}>×</button>
      </div>

      <div class="modal-body">
        <!-- left: templates -->
        <div class="tpl-col">
          <div class="col-label">TEMPLATE</div>
          {#each templates as t}
            <button
              class="tpl-card"
              class:sel={selected.id === t.id}
              on:click={() => (selected = t)}
              disabled={creating}
            >
              <div class="tpl-top">
                <span class="tpl-cat">{t.cat}</span>
                {#if selected.id === t.id}<span class="check">✓</span>{/if}
              </div>
              <div class="tpl-name">{t.label}</div>
              <div class="tpl-desc">{t.desc}</div>
            </button>
          {/each}
        </div>

        <!-- right: config -->
        <div class="cfg-col">
          <div class="col-label">CONFIGURE</div>

          <div class="field">
            <label for="pkg-name">PACKAGE NAME</label>
            <input
              id="pkg-name"
              bind:value={packageName}
              spellcheck="false"
              disabled={creating}
              class:invalid={!nameValid && packageName.length > 0}
            />
            {#if !nameValid && packageName.length > 0}
              <div class="hint err">must start with lowercase letter; only a-z 0-9 _</div>
            {/if}
          </div>

          <div class="field">
            <label for="node-name">NODE NAME</label>
            <input
              id="node-name"
              bind:value={nodeName}
              spellcheck="false"
              disabled={creating}
              class:invalid={!nodeValid && nodeName.length > 0}
            />
            {#if !nodeValid && nodeName.length > 0}
              <div class="hint err">must start with lowercase letter; only a-z 0-9 _</div>
            {/if}
          </div>

          <div class="field">
            <label for="desc">DESCRIPTION</label>
            <input
              id="desc"
              bind:value={description}
              spellcheck="false"
              disabled={creating}
            />
          </div>

          <div class="field">
            <label>WORKSPACE</label>
            <div class="ws-display">
              {$workspacePath || "—"}
              <span class="dim">/src/{packageName || "…"}</span>
            </div>
          </div>

          <div class="field">
            <label>DEPENDENCIES</label>
            <div class="dep-list">
              {#if selected.deps.length === 0}
                <span class="dim mono">none — bare workspace</span>
              {:else}
                {#each selected.deps as d}
                  <span class="dep-chip">{d}</span>
                {/each}
              {/if}
            </div>
          </div>

          <!-- result / error -->
          {#if creating}
            <div class="status creating">
              <span class="spinner"></span>
              scaffolding {packageName}…
            </div>
          {:else if result}
            <pre class="status ok">{result.split("\n").slice(0, 10).join("\n")}</pre>
          {:else if error}
            <div class="status err">⚠ {error}</div>
          {:else if !$isRuntimeReady}
            <div class="status warn">Runtime not running — start it before scaffolding.</div>
          {/if}

          <div class="actions">
            <button class="cancel" on:click={close} disabled={creating}>CANCEL</button>
            <button class="create" on:click={create} disabled={!canCreate}>
              {#if creating}CREATING…{:else}CREATE PACKAGE{/if}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,.55);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 40px;
    animation: fadein 120ms ease;
  }
  @keyframes fadein { from{opacity:0} to{opacity:1} }

  .modal {
    width: min(880px, 100%); max-height: calc(100vh - 80px);
    background: var(--bg-1); border: 1px solid var(--border-bright);
    border-radius: var(--radius); overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 24px 80px rgba(0,0,0,.5);
  }

  .modal-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 18px 20px; border-bottom: 1px solid var(--border);
    background: var(--bg-1);
  }
  .label-sm { font-family:var(--font-mono); font-size:10px; letter-spacing:2px; text-transform:uppercase; }
  .accent { color: var(--accent); }
  .modal-title { font-size: 22px; font-weight: 600; letter-spacing: -.4px; margin-top: 2px; }
  .x-btn {
    background: transparent; border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--fg-2); font-size: 20px; line-height: 1;
    width: 28px; height: 28px; padding: 0; cursor: pointer;
  }
  .x-btn:hover { color: var(--err); border-color: var(--err); }

  .modal-body {
    flex: 1; overflow: hidden;
    display: grid; grid-template-columns: 280px 1fr;
    min-height: 0;
  }

  .col-label {
    font-family: var(--font-mono); font-size: 9px; color: var(--fg-3);
    letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px;
  }

  /* templates */
  .tpl-col {
    border-right: 1px solid var(--border); background: var(--bg-0);
    padding: 16px; overflow: auto; display: flex; flex-direction: column; gap: 6px;
  }
  .tpl-card {
    background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 10px 12px; text-align: left; cursor: pointer;
    display: flex; flex-direction: column; gap: 3px;
  }
  .tpl-card:hover:not(:disabled) { border-color: var(--border-bright); background: var(--bg-3); }
  .tpl-card.sel { border-color: var(--accent-line); background: var(--accent-dim); }
  .tpl-card:disabled { opacity: .5; cursor: default; }
  .tpl-top { display: flex; align-items: center; justify-content: space-between; }
  .tpl-cat { font-family: var(--font-mono); font-size: 9px; color: var(--fg-3); letter-spacing: 1.2px; }
  .tpl-card.sel .tpl-cat { color: var(--accent); }
  .check { color: var(--accent); font-size: 11px; }
  .tpl-name { font-family: var(--font-mono); font-size: 11.5px; color: var(--fg-0); font-weight: 600; }
  .tpl-desc { font-size: 10.5px; color: var(--fg-2); line-height: 1.4; }

  /* configure */
  .cfg-col { padding: 16px 20px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }

  .field { display: flex; flex-direction: column; gap: 4px; }
  .field label {
    font-family: var(--font-mono); font-size: 9px; color: var(--fg-3);
    letter-spacing: 1.5px; text-transform: uppercase;
  }
  .field input {
    padding: 8px 10px; font-family: var(--font-mono); font-size: 13px;
    background: var(--bg-2); border: 1px solid var(--border-bright); border-radius: var(--radius);
    color: var(--fg-0); outline: none;
  }
  .field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .field input.invalid { border-color: var(--err); }
  .field input:disabled { opacity: .5; cursor: not-allowed; }

  .hint { font-family: var(--font-mono); font-size: 10px; }
  .hint.err { color: var(--err); }

  .ws-display {
    padding: 7px 10px; font-family: var(--font-mono); font-size: 12px;
    background: var(--bg-0); border: 1px solid var(--border); border-radius: var(--radius);
    color: var(--fg-1);
  }
  .dim { color: var(--fg-3); }
  .mono { font-family: var(--font-mono); font-size: 11px; }

  .dep-list { display: flex; flex-wrap: wrap; gap: 5px; padding: 4px 0; }
  .dep-chip {
    padding: 3px 8px; border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--bg-2); font-family: var(--font-mono); font-size: 10px; color: var(--fg-1);
  }

  .status {
    padding: 10px 12px; border-radius: var(--radius);
    font-family: var(--font-mono); font-size: 11px; line-height: 1.5;
  }
  .status.creating {
    background: var(--accent-dim); border: 1px solid var(--accent-line); color: var(--accent);
    display: flex; align-items: center; gap: 8px;
  }
  .status.ok {
    background: rgba(139,195,74,.08); border: 1px solid rgba(139,195,74,.3); color: var(--ok);
    white-space: pre-wrap; max-height: 140px; overflow: auto; margin: 0;
  }
  .status.err { background: rgba(224,102,102,.08); border: 1px solid rgba(224,102,102,.3); color: var(--err); }
  .status.warn { background: rgba(242,200,75,.08); border: 1px solid rgba(242,200,75,.3); color: var(--warn); }

  .spinner {
    width: 12px; height: 12px;
    border: 2px solid var(--accent-dim); border-top-color: var(--accent);
    border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: auto; padding-top: 8px; }
  .cancel, .create {
    padding: 8px 18px; font-family: var(--font-mono); font-size: 11px; font-weight: 600;
    letter-spacing: .5px; border-radius: var(--radius); cursor: pointer; border: 1px solid;
  }
  .cancel { background: transparent; border-color: var(--border-bright); color: var(--fg-1); }
  .cancel:hover:not(:disabled) { color: var(--fg-0); border-color: var(--fg-1); }
  .create { background: var(--accent); border-color: var(--accent); color: #1a1408; }
  .create:hover:not(:disabled) { opacity: .9; }
  .create:disabled, .cancel:disabled { opacity: .35; cursor: not-allowed; }
</style>
