// Empacota main, preloads e renderers com esbuild e copia os arquivos estáticos para dist/.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const OUT = "dist";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: "warning", target: "es2022" };

await Promise.all([
  build({
    ...common,
    entryPoints: { main: "src/electron/main.ts" },
    outdir: OUT,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  build({
    ...common,
    entryPoints: {
      "preload-recorder": "src/electron/preload/recorder.ts",
      "preload-live": "src/electron/preload/live.ts",
      "preload-hub": "src/electron/preload/hub.ts",
    },
    outdir: OUT,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  build({
    ...common,
    entryPoints: {
      recorder: "src/renderer/recorder.ts",
      "pcm-worklet": "src/renderer/pcm-worklet.ts",
      live: "src/renderer/live.ts",
      hub: "src/renderer/hub.ts",
    },
    outdir: OUT,
    platform: "browser",
    format: "iife",
  }),
]);

for (const file of ["recorder.html", "live.html", "live.css", "hub.html", "hub.css"]) {
  cpSync(`src/renderer/${file}`, `${OUT}/${file}`);
}
console.log("build ok → dist/");
