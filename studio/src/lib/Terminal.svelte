<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";

  export let port: number;

  let container: HTMLDivElement;
  let term: Terminal;
  let fit: FitAddon;
  let ws: WebSocket | null = null;
  let ro: ResizeObserver;
  let connected = false;

  onMount(() => {
    term = new Terminal({
      theme: {
        background: "#0d0d14",
        foreground: "#e2e2e2",
        cursor: "#4cc9f0",
        cursorAccent: "#0d0d14",
        selectionBackground: "rgba(76, 201, 240, 0.25)",
        black: "#0d0d14",
        brightBlack: "#555",
        red: "#f87171",
        brightRed: "#f87171",
        green: "#7ee787",
        brightGreen: "#7ee787",
        yellow: "#f0a050",
        brightYellow: "#f0a050",
        blue: "#4cc9f0",
        brightBlue: "#93c5fd",
        magenta: "#a78bfa",
        brightMagenta: "#c4b5fd",
        cyan: "#34d399",
        brightCyan: "#6ee7b7",
        white: "#e2e2e2",
        brightWhite: "#ffffff",
      },
      fontFamily: '"SF Mono", Menlo, "Cascadia Code", monospace',
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 2000,
      allowProposedApi: true,
    });

    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "terminal_input",
            data: Array.from(new TextEncoder().encode(data)),
          })
        );
      }
    });

    ro = new ResizeObserver(() => {
      fit.fit();
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "terminal_resize", cols: term.cols, rows: term.rows })
        );
      }
    });
    ro.observe(container);

    connect();
  });

  onDestroy(() => {
    ro?.disconnect();
    ws?.close();
    term?.dispose();
  });

  function connect() {
    ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.onopen = () => {
      fit.fit();
      ws!.send(
        JSON.stringify({ type: "terminal_open", cols: term.cols, rows: term.rows })
      );
      connected = true;
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "terminal_output") {
        term.write(new Uint8Array(msg.data));
      }
    };

    ws.onclose = () => {
      connected = false;
      term.writeln("\r\n\x1b[2;37m[disconnected — click to reconnect]\x1b[0m");
    };

    ws.onerror = () => {
      connected = false;
    };
  }

  function handleClick() {
    if (!connected) {
      term.clear();
      connect();
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
    background: #0d0d14;
    overflow: hidden;
    cursor: text;
  }

  .xterm-container {
    width: 100%;
    height: 100%;
    padding: 6px 8px;
    box-sizing: border-box;
  }

  /* xterm internal overrides to match studio theme */
  .xterm-container :global(.xterm) {
    height: 100%;
  }

  .xterm-container :global(.xterm-viewport) {
    background: #0d0d14 !important;
  }

  .xterm-container :global(.xterm-screen) {
    width: 100% !important;
  }
</style>
