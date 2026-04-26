<script lang="ts">
  import { isRuntimeReady, removeToolFromPanel } from "../stores/layout";
  import WidgetShell from "./WidgetShell.svelte";

  export let id: string;
</script>

<WidgetShell title="Map" kind="map" onRemove={() => removeToolFromPanel(id)}>
  <div class="map-stub">
    <svg viewBox="0 0 200 140" width="100%" height="140" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="g{id}" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M 14 0 L 0 0 0 14" fill="none" stroke="rgba(242,168,59,.08)" stroke-width=".5"/>
        </pattern>
      </defs>
      <rect width="200" height="140" fill="url(#g{id})"/>
      <!-- mock occupancy cells -->
      {#each Array(40) as _, i}
        <rect
          x={(i % 10) * 18 + 12}
          y={Math.floor(i / 10) * 22 + 14}
          width="14" height="18" rx="1"
          fill={Math.random() > 0.7 ? "rgba(242,168,59,.20)" : "rgba(242,168,59,.04)"}
        />
      {/each}
      <!-- robot -->
      <circle cx="100" cy="70" r="6" fill="rgba(242,168,59,.25)" stroke="#f2a83b" stroke-width="1.5"/>
      <circle cx="100" cy="70" r="2.2" fill="#f2a83b"/>
    </svg>
    <div class="caption">
      {$isRuntimeReady ? "/map · preview" : "Start runtime for live map"}
    </div>
  </div>
</WidgetShell>

<style>
  .map-stub { padding: 6px 6px 0; }
  .caption {
    text-align: center; padding: 6px 8px;
    font-family: var(--font-mono); font-size: 9.5px;
    color: var(--fg-2); letter-spacing: .8px;
  }
</style>
