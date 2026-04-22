import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Vite config tuned for Tauri: fixed port, no error overlay on fullscreen,
// and the dev server only listens on localhost so the embedded webview
// picks it up without broadcasting to the network.
export default defineConfig(async () => ({
  plugins: [svelte()],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      // Tauri watches src-tauri/ itself; don't double-watch.
      ignored: ["**/src-tauri/**"],
    },
  },

  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    sourcemap: true,
  },
}));
