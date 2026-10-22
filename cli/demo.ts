// The two-month demo from an empty memory, so it gives the same result on any clone.
//   npm run demo
// The steps live in src/demo.ts. Results go to out/demo/; each run also writes its own log in logs/.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runLindaDemo } from "../src/demo.ts";

const OUT = join("out", "demo");

mkdirSync(OUT, { recursive: true });
try {
  for (const { step, runId, sampleMode, logFile: _, ...explanation } of await runLindaDemo(join(OUT, "memory"))) {
    writeFileSync(join(OUT, `${step}.json`), `${JSON.stringify({ runId, sampleMode, ...explanation }, null, 2)}\n`, "utf8");
  }
} catch (error: unknown) {
  process.stderr.write(`Demo failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
