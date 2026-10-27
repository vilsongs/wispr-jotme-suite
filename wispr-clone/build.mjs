// Gera dist/: processo principal + preloads (CJS/Node) e renderers (IIFE/navegador).
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const outdir = "dist";
const rendererDir = join("src", "renderer");
const preloadDir = join("src", "electron", "preload");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const common = { bundle: true, sourcemap: true, target: "es2022", logLevel: "info" };

await build({
  ...common,
  platform: "node",
  format: "cjs",
  external: ["electron", "koffi"],
  entryPoints: [
    { in: join("src", "electron", "main.ts"), out: "main" },
    ...readdirSync(preloadDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({ in: join(preloadDir, f), out: `preload-${f.slice(0, -3)}` })),
  ],
  outdir,
});

await build({
  ...common,
  platform: "browser",
  format: "iife",
  entryPoints: readdirSync(rendererDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ in: join(rendererDir, f), out: f.slice(0, -3) })),
  outdir,
});

for (const f of readdirSync(rendererDir)) {
  if (f.endsWith(".html") || f.endsWith(".css")) copyFileSync(join(rendererDir, f), join(outdir, f));
}
