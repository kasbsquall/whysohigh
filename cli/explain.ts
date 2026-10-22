// Programmatic entry point.
//   npm run explain -- --bill samples/linda-2026-09.png --household samples/linda.json --out out/

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { explain, ORCHESTRATOR } from "../src/pipeline.ts";
import { createRuntime } from "../src/runtime.ts";

const { values } = parseArgs({
  options: {
    bill: { type: "string" },
    household: { type: "string" },
    out: { type: "string", default: "out" },
  },
});

if (!values.bill) {
  process.stderr.write("Usage: npm run explain -- --bill <image> [--household <json>] [--out <dir>]\n");
  process.exit(2);
}

const runtime = createRuntime();
const { logger, config } = runtime;

try {
  logger.log({ agent: ORCHESTRATOR, step: "start", sampleMode: config.sampleMode, bill: values.bill });
  const household = values.household ? (JSON.parse(readFileSync(values.household, "utf8")) as { id?: string }) : null;
  const explanation = await explain(runtime, values.bill, household?.id ?? null);

  const result = { runId: logger.runId, sampleMode: config.sampleMode, household, ...explanation };
  mkdirSync(values.out, { recursive: true });
  const outFile = join(values.out, `${logger.runId}.json`);
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  logger.log({ agent: ORCHESTRATOR, step: "done", outFile, logFile: logger.file });
} catch (error: unknown) {
  logger.log({ agent: ORCHESTRATOR, step: "failed", error: (error as Error).message });
  process.exitCode = 1;
}
