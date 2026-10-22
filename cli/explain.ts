// Programmatic entry point.
//   npm run explain -- --bill samples/linda-2026-09.png --household samples/linda.json --out out/

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readBill } from "../src/agents/billReader.ts";
import { createRuntime } from "../src/runtime.ts";
import { billWeather } from "../src/zetaris/queries.ts";

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
  logger.log({ agent: "Orchestrator", step: "start", sampleMode: config.sampleMode, bill: values.bill });
  const household = values.household ? (JSON.parse(readFileSync(values.household, "utf8")) as { id?: string }) : null;
  const bill = await readBill(runtime.llm, logger, values.bill);
  // Bill periods joined with station weather through Zetaris; the analysts build on this.
  const history = household?.id ? await billWeather(runtime.sql, "WeatherAnalyst", household.id) : [];

  const result = { runId: logger.runId, sampleMode: config.sampleMode, household, bill, history };
  mkdirSync(values.out, { recursive: true });
  const outFile = join(values.out, `${logger.runId}.json`);
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  logger.log({ agent: "Orchestrator", step: "done", outFile, logFile: logger.file });
} catch (error: unknown) {
  logger.log({ agent: "Orchestrator", step: "failed", error: (error as Error).message });
  process.exitCode = 1;
}
