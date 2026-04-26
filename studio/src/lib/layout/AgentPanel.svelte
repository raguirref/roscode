<script lang="ts">
  import { rightPanelWidth } from "../stores/layout";
  import Chat from "../Chat.svelte";

  export let port: number = 9000;
  export let workspacePath: string = "";
</script>

<div class="agent-panel" style="width: {$rightPanelWidth}px">
  <!-- soft accent strip on left edge -->
  <div class="edge-glow"></div>
  <div class="content">
    <Chat {port} workspace={workspacePath} />
  </div>
</div>

<style>
  .agent-panel {
    flex-shrink: 0;
    position: relative;
    background:
      radial-gradient(circle at 100% 0%, rgba(167,139,250,.06), transparent 60%),
      radial-gradient(circle at 0% 100%, rgba(242,168,59,.04), transparent 60%),
      var(--bg-1);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    min-width: 240px;
  }

  .edge-glow {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 1px;
    background: linear-gradient(to bottom,
      transparent 0%,
      rgba(242,168,59,.4) 30%,
      rgba(167,139,250,.3) 70%,
      transparent 100%);
    opacity: .4;
    pointer-events: none;
  }

  .content {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column;
    position: relative;
  }
</style>
