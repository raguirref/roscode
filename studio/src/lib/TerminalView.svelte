<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import {
    attachView, detachView, sendInput, openSession,
    resizeSession, reconnectSession, getScrollback, terminalSessions,
  } from "./stores/terminalStore";

  export let sessionId: string;

  let container: HTMLDivElement;
  let term: Terminal;
  let fit: FitAddon;
  let ro: ResizeObserver;

  $: session = $terminalSessions.find(s => s.id === sessionId);
  $: connected = session?.connected ?? false;

  onMount(() => {
    term = new Terminal({
      theme: {
        background: "#0a0d0c",
        foreground: "#e4e6e1",
        cursor: "#f2a83b",
        cursorAccent: "#0a0d0c",
        selectionBackground: "rgba(242, 168, 59, 0.25)",
        black: "#0a0d0c",
        brightBlack: "#636862",
        red: "#e06666", brightRed: "#e06666",
        green: "#8bc34a", brightGreen: "#bddb8a",
        yellow: "#f2c84b", brightYellow: "#e4cf8f",
        blue: "#6dd3c8", brightBlue: "#6dd3c8",
        magenta: "#e4a87f", brightMagenta: "#e4a87f",
        cyan: "#6dd3c8", brightCyan: "#6dd3c8",
        white: "#e4e6e1", brightWhite: "#ffffff",
      },
      fontFamily: '"Geist Mono", "JetBrains Mono", "SF Mono", Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      allowProposedApi: true,
    });

    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    // Replay scrollback buffer from the session store
    for (const chunk of getScrollback(sessionId)) {
      term.write(chunk);
    }

    // Forward user input to the session
    term.onData((data) => sendInput(sessionId, data));

    // Attach to session events
    attachView(sessionId, {
      onData: (d) => term.write(d),
      onDisconnect: () => term.writeln("\r\n\x1b[2;37m[disconnected — click to reconnect]\x1b[0m"),
      onConnect: () => {
        fit.fit();
        openSession(sessionId, term.cols, term.rows);
      },
    });

    ro = new ResizeObserver(() => {
      fit.fit();
      resizeSession(sessionId, term.cols, term.rows);
    });
    ro.observe(container);
  });

  onDestroy(() => {
    ro?.disconnect();
    detachView(sessionId);
    term?.dispose();
  });

  function handleClick() {
    if (!connected) {
      term?.clear();
      reconnectSession(sessionId);
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="term-wrap" on:click={handleClick}>
  <div class="xterm-container" bind:this={container}></div>
</div>

<style>
  .term-wrap {
    width: 100%;
    height: 100%;
    background: #0a0d0c;
    overflow: hidden;
    cursor: text;
  }

  .xterm-container {
    width: 100%;
    height: 100%;
    padding: 6px 8px;
    box-sizing: border-box;
  }

  .xterm-container :global(.xterm) { height: 100%; }
  .xterm-container :global(.xterm-viewport) { background: #0a0d0c !important; }
  .xterm-container :global(.xterm-screen) { width: 100% !important; }
</style>
