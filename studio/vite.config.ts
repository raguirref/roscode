import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig(async () => ({
  plugins: [svelte()],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Separate Monaco into its own chunk to avoid giant bundles
        manualChunks: {
          "monaco-editor": ["monaco-editor"],
        },
      },
    },
  },

  // Monaco needs to load workers via blob URLs — tell Vite to allow it
  optimizeDeps: {
    include: ["monaco-editor/esm/vs/editor/editor.worker"],
  },
}));
