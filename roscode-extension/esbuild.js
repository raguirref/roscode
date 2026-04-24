const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const ctx = esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: !watch,
  logLevel: "info",
});

ctx.then(async (c) => {
  if (watch) {
    await c.watch();
    console.log("Watching...");
  } else {
    await c.rebuild();
    await c.dispose();
  }
});
