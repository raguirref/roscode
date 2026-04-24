<script lang="ts">
  import { onMount } from "svelte";
  import logoUrl from "../assets/logo.png";

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
    <div class="logo-wrap">
      <img src={logoUrl} alt="roscode" class="logo" />
      <div class="ring"></div>
    </div>
    <p class="name">roscode <span>studio</span></p>
    <div class="bar-track">
      <div class="bar-fill" class:done={fadeOut}></div>
    </div>
    <p class="version">powered by Claude Opus 4.7</p>
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #080b0f;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    transition: opacity 500ms ease;
  }
  .splash.fade { opacity: 0; pointer-events: none; }

  .logo-wrap {
    position: relative;
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logo {
    width: 100px;
    height: 100px;
    object-fit: contain;
    animation: pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes pop {
    from { transform: scale(0.6); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  .ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid rgba(76, 201, 240, 0.25);
    animation: spin-ring 3s linear infinite;
  }
  .ring::before {
    content: "";
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: #4cc9f0;
    animation: spin-ring 1.4s linear infinite;
  }
  @keyframes spin-ring { to { transform: rotate(360deg); } }

  .name {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: #e8ecf0;
    animation: fadein 400ms 200ms ease both;
  }
  .name span { color: #4e5868; font-weight: 400; }

  .bar-track {
    width: 160px;
    height: 2px;
    background: #1e2430;
    border-radius: 2px;
    overflow: hidden;
    animation: fadein 400ms 300ms ease both;
  }
  .bar-fill {
    height: 100%;
    width: 30%;
    background: linear-gradient(90deg, #4cc9f0, #a78bfa);
    border-radius: 2px;
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
    font-size: 11px;
    color: #2a3340;
    letter-spacing: 0.3px;
    animation: fadein 400ms 500ms ease both;
  }

  @keyframes fadein {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
