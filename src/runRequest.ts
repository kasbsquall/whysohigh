// One request in, one structured result out. Shared by the CLI (--input) and
// POST /api/run, so both return the same JSON and write the same trace.

import { InputError, type RunInput } from "./input.ts";
import { explain, ORCHESTRATOR, type Explanation } from "./pipeline.ts";
import type { Runtime } from "./runtime.ts";

export interface RunSuccess {
  readonly run_id: string;
  readonly status: "success";
  readonly sample_mode: boolean;
  readonly output: Explanation;
  readonly log_file: string;
  readonly execution_time_seconds: number;
}

export interface RunFailure {
  readonly run_id: string;
  readonly status: "error";
  readonly sample_mode: boolean;
  readonly error: { readonly type: string; readonly message: string };
  readonly log_file: string;
  readonly execution_time_seconds: number;
}

const seconds = (since: number): number => Math.round((Date.now() - since) / 100) / 10;

/** memoryDir null runs without memory, which is the default for requests. */
export async function runRequest(runtime: Runtime, input: RunInput, memoryDir: string | null): Promise<RunSuccess | RunFailure> {
  const { logger, config } = runtime;
  const started = Date.now();
  const base = { run_id: logger.runId, sample_mode: config.sampleMode, log_file: logger.file };
  logger.log({
    agent: ORCHESTRATOR,
    step: "start",
    sampleMode: config.sampleMode,
    request: { householdId: input.householdId, bill: "fields" in input.bill ? "fields" : input.bill.imagePath, earlierBills: input.earlierBills.length },
  });
  try {
    const output = await explain(runtime, "fields" in input.bill ? input.bill.fields : input.bill.imagePath, {
      householdId: input.householdId,
      memoryDir: input.householdId ? memoryDir : null,
      facts: input.facts,
      earlierBills: input.earlierBills,
    });
    logger.log({ agent: ORCHESTRATOR, step: "done", logFile: logger.file });
    return { ...base, status: "success", output, execution_time_seconds: seconds(started) };
  } catch (error: unknown) {
    const err = error as Error;
    logger.log({ agent: ORCHESTRATOR, step: "failed", error: err.message });
    return {
      ...base,
      status: "error",
      error: { type: error instanceof InputError ? "InvalidInput" : err.name || "Error", message: err.message },
      execution_time_seconds: seconds(started),
    };
  }
}
