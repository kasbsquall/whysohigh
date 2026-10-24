// Programmatic entry point.
//   npm run explain -- --input input_examples/example_1.json        (a request: household, bill fields, earlier bills)
//   npm run explain -- --bill samples/linda-2026-09.png --household samples/linda.json --out out/
// Household memory lives in .memory/<household id> unless --memory points elsewhere; --no-memory runs without it.
// A --input request runs without memory unless --memory is given.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseHouseholdFacts } from "../src/actions/programs.ts";
import { InputError, parseRunInput } from "../src/input.ts";
import { explain, ORCHESTRATOR } from "../src/pipeline.ts";
import { runRequest } from "../src/runRequest.ts";
import { createRuntime } from "../src/runtime.ts";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    bill: { type: "string" },
    household: { type: "string" },
    out: { type: "string", default: "out" },
    memory: { type: "string" },
    "no-memory": { type: "boolean", default: false },
  },
});

if (Boolean(values.bill) === Boolean(values.input)) {
  process.stderr.write(
    "Usage: npm run explain -- --input <request.json> [--out <dir>]\n" +
      "       npm run explain -- --bill <image> [--household <json>] [--out <dir>]\n",
  );
  process.exit(2);
}

const runtime = createRuntime();
const { logger, config } = runtime;
const outFile = join(values.out, `${logger.runId}.json`);
try {
  mkdirSync(values.out, { recursive: true });
} catch (error: unknown) {
  logger.log({ agent: ORCHESTRATOR, step: "failed", error: `Cannot write to ${values.out}: ${(error as Error).message}` });
  process.exit(1);
}

if (values.input) {
  let result;
  try {
    const input = parseRunInput(JSON.parse(readFileSync(values.input, "utf8")));
    result = await runRequest(runtime, input, values.memory ?? null);
  } catch (error: unknown) {
    const message = error instanceof SyntaxError ? `${values.input} is not valid JSON.` : (error as Error).message;
    logger.log({ agent: ORCHESTRATOR, step: "failed", error: message });
    result = { run_id: logger.runId, status: "error", sample_mode: config.sampleMode, error: { type: error instanceof InputError ? "InvalidInput" : "Error", message }, log_file: logger.file };
  }
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  logger.log({ agent: ORCHESTRATOR, step: "result", status: result.status, outFile });
  if (result.status !== "success") process.exitCode = 1;
} else {
  try {
    logger.log({ agent: ORCHESTRATOR, step: "start", sampleMode: config.sampleMode, bill: values.bill });
    const household = values.household ? (JSON.parse(readFileSync(values.household, "utf8")) as { id?: string }) : null;
    const householdId = household?.id ?? null;
    const memoryDir = values["no-memory"] || !householdId ? null : (values.memory ?? join(".memory", householdId));
    const explanation = await explain(runtime, values.bill as string, { householdId, memoryDir, facts: household ? parseHouseholdFacts(household) : null });

    const result = { runId: logger.runId, sampleMode: config.sampleMode, household, memoryDir, ...explanation };
    writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    logger.log({ agent: ORCHESTRATOR, step: "done", outFile, logFile: logger.file });
  } catch (error: unknown) {
    logger.log({ agent: ORCHESTRATOR, step: "failed", error: (error as Error).message });
    process.exitCode = 1;
  }
}
