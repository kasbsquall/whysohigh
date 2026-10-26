// Builds the read-only online copy of the page into web/dist-static: Linda's
// recorded run is saved as demo.json next to the page, so it opens from any
// static host (and any subpath) with no server. The sample photo's recorded
// reading is saved as photo-sample.json; reading a new photo needs the models,
// so that copy says so instead of offering it.
//   npm run web:static

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";

process.env.SAMPLE_MODE = "true";
process.env.WSH_BASE = "./";
process.env.VITE_STATIC_DEMO = "true";

const OUT = resolve("web", "dist-static");
const { demoPayload, runLindaDemo } = await import("../src/demo.ts");
const { readBillPhoto, SAMPLE_PHOTO } = await import("../src/billPhoto.ts");
const { createRuntime } = await import("../src/runtime.ts");
const { SampleMissError } = await import("../src/cache.ts");

const payload = await demoPayload(await runLindaDemo(join(mkdtempSync(join(tmpdir(), "wsh-static-")), "memory")));
await build({ configFile: resolve("web", "vite.config.ts"), build: { outDir: OUT, emptyOutDir: true } });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "demo.json"), JSON.stringify(payload));
// The recorded reading of the sample photo, for the "Try a sample photo" button.
// Without a recording the page hides the button.
try {
  const photo = await readBillPhoto(createRuntime(), readFileSync(SAMPLE_PHOTO), "jpeg");
  if (photo.status === "success") writeFileSync(join(OUT, "photo-sample.json"), JSON.stringify(photo));
  else process.stdout.write(`The sample photo's run failed (${photo.error.message}); the copy goes without it.\n`);
} catch (error: unknown) {
  if (!(error instanceof SampleMissError)) throw error;
  process.stdout.write("The sample photo has no recorded run; the copy goes without it.\n");
}
process.stdout.write(`Static copy in ${OUT}\n`);
