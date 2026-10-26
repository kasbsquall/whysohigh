// Builds the read-only online copy of the page into web/dist-static: Linda's
// recorded run is saved as demo.json next to the page, so it opens from any
// static host (and any subpath) with no server. Reading a new photo needs the
// models, so that copy says so instead of offering it.
//   npm run web:static

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";

process.env.SAMPLE_MODE = "true";
process.env.WSH_BASE = "./";
process.env.VITE_STATIC_DEMO = "true";

const OUT = resolve("web", "dist-static");
const { demoPayload, runLindaDemo } = await import("../src/demo.ts");

const payload = await demoPayload(await runLindaDemo(join(mkdtempSync(join(tmpdir(), "wsh-static-")), "memory")));
await build({ configFile: resolve("web", "vite.config.ts"), build: { outDir: OUT, emptyOutDir: true } });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "demo.json"), JSON.stringify(payload));
process.stdout.write(`Static copy in ${OUT}\n`);
