<script lang="ts">
  import lockupUrl from "./brand/lockup-roscode.svg";

  export let done = false;
  let visible = true;
  let fadeOut = false;

  $: if (done && !fadeOut) {
    fadeOut = true;
    setTimeout(() => (visible = false), 500);
  }
</script>

{#if visible}
  <div class="splash" class:fade={fadeOut}>
    <div class="grid-bg"></div>

    <div class="top-strip">
      <span class="tag">SYS READY</span>
      <span class="tag">ROS 2 · JAZZY</span>
      <span class="tag">v0.1.0</span>
    </div>

    <div class="center">
      <div class="logo-wrap-full">
        <img src={lockupUrl} alt="roscode studio" class="hero-lockup" />
      </div>
      <p class="caption">// booting</p>

      <div class="bar-track">
        <div class="bar-fill" class:done={fadeOut}></div>
      </div>

      <p class="version">// POWERED BY CLAUDE OPUS 4.7</p>
    </div>

    <div class="bottom-strip">
      <span class="meta">DOMAIN 0</span>
      <span class="meta">NET · SCAN PENDING</span>
      <span class="meta">AGENT · READY</span>
    </div>
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #0a0c0b;
    color: #e4e6e1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    padding: 22px 32px;
    transition: opacity 500ms ease;
    font-family: "Geist", "Inter", system-ui, sans-serif;
  }
  .splash.fade { opacity: 0; pointer-events: none; }

  .grid-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(#333b38 1px, transparent 1px);
    background-size: 24px 24px;
    opacity: 0.5;
  }

  .top-strip,
  .bottom-strip {
    display: flex;
    gap: 8px;
    position: relative;
    z-index: 1;
  }
  .bottom-strip { justify-content: flex-end; }

  .tag {
    font-family: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #9ea39a;
    padding: 4px 9px;
    border: 1px solid #22282660;
    border-radius: 4px;
  }
  .tag:first-child {
    color: #f2a83b;
    border-color: rgba(242, 168, 59, 0.28);
    background: rgba(242, 168, 59, 0.10);
  }

  .meta {
    font-family: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 1px;
    color: #636862;
    text-transform: uppercase;
  }
  .meta + .meta::before {
    content: " · ";
    margin: 0 6px;
    color: #3a3e3a;
  }

  .center {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .logo-wrap-full {
    width: 600px;
    height: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes pop {
    from { transform: scale(0.6); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
  .hero-lockup {
    width: 100%; height: auto;
    filter: drop-shadow(0 8px 32px rgba(242,168,59,.15));
  }

  .caption {
    font-family: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    color: #f2a83b;
    letter-spacing: 2px;
    text-transform: uppercase;
    animation: fadein 400ms 260ms ease both;
  }

  .bar-track {
    width: 200px;
    height: 2px;
    background: #181d1b;
    border: 1px solid #22282660;
    border-radius: 0;
    overflow: hidden;
    animation: fadein 400ms 320ms ease both;
  }
  .bar-fill {
    height: 100%;
    width: 30%;
    background: #f2a83b;
    box-shadow: 0 0 12px rgba(242, 168, 59, 0.4);
    animation: scan 1.2s ease-in-out infinite;
    transition: width 400ms ease;
  }
  .bar-fill.done { width: 100%; animation: none; }
  @keyframes scan {
    0%   { margin-left: 0%;   width: 30%; }
    50%  { margin-left: 70%;  width: 30%; }
    100% { margin-left: 0%;   width: 30%; }
  }

  .version {
    font-family: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    color: #636862;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    animation: fadein 400ms 500ms ease both;
  }

  @keyframes fadein {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
