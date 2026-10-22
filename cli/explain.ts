// Programmatic entry point.
//   npm run explain -- --bill samples/linda-2026-09.png --household samples/linda.json --out out/
// Household memory lives in .memory/<household id> unless --memory points elsewhere; --no-memory runs without it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseHouseholdFacts } from "../src/actions/programs.ts";
import { explain, ORCHESTRATOR } from "../src/pipeline.ts";
import { createRuntime } from "../src/runtime.ts";

const { values } = parseArgs({
  options: {
    bill: { type: "string" },
    household: { type: "string" },
    out: { type: "string", default: "out" },
    memory: { type: "string" },
    "no-memory": { type: "boolean", default: false },
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
  const householdId = household?.id ?? null;
  const memoryDir = values["no-memory"] || !householdId ? null : (values.memory ?? join(".memory", householdId));
  const explanation = await explain(runtime, values.bill, { householdId, memoryDir, facts: household ? parseHouseholdFacts(household) : null });

  const result = { runId: logger.runId, sampleMode: config.sampleMode, household, memoryDir, ...explanation };
  mkdirSync(values.out, { recursive: true });
  const outFile = join(values.out, `${logger.runId}.json`);
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  logger.log({ agent: ORCHESTRATOR, step: "done", outFile, logFile: logger.file });
} catch (error: unknown) {
  logger.log({ agent: ORCHESTRATOR, step: "failed", error: (error as Error).message });
  process.exitCode = 1;
}
