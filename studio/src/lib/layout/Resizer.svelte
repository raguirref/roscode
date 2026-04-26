<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Writable } from "svelte/store";

  export let store: Writable<number>;
  export let direction: "horizontal" | "vertical" = "horizontal"; // horizontal = drag-X (resize width); vertical = drag-Y (resize height)
  export let min = 120;
  export let max = 800;
  /** "left" if the panel is to our left (drag right grows it),
   *  "right" if to our right (drag left grows it),
   *  "top" if above (drag up grows it). */
  export let side: "left" | "right" | "top" = "left";

  let dragging = false;
  let startCoord = 0;
  let startSize = 0;

  function onDown(e: MouseEvent) {
    dragging = true;
    startCoord = direction === "horizontal" ? e.clientX : e.clientY;
    let cur = 0;
    store.subscribe((v) => (cur = v))();
    startSize = cur;
    document.body.style.cursor = direction === "horizontal" ? "ew-resize" : "ns-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }

  function onMove(e: MouseEvent) {
    if (!dragging) return;
    const cur = direction === "horizontal" ? e.clientX : e.clientY;
    let delta = cur - startCoord;
    if (side === "right" || side === "top") delta = -delta;
    const next = Math.max(min, Math.min(max, startSize + delta));
    store.set(next);
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  if (typeof window !== "undefined") {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
  });
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="resizer {direction}"
  class:dragging
  on:mousedown={onDown}
  role="separator"
  aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
  aria-label="Resize panel"
></div>

<style>
  .resizer {
    flex-shrink: 0;
    background: transparent;
    transition: background 80ms;
    z-index: 5;
  }
  .resizer.horizontal {
    width: 4px;
    cursor: ew-resize;
    margin: 0 -2px;
  }
  .resizer.vertical {
    height: 4px;
    cursor: ns-resize;
    margin: -2px 0;
  }
  .resizer:hover, .resizer.dragging {
    background: var(--accent);
    opacity: .55;
  }
</style>
