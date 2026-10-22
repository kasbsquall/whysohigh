// Linda's two-month demo from an empty memory, shared by the CLI and the web server.
// 1. Month 1: her September bill.
// 2. Linda tells us September was a one-off (samples/linda-notes.json), stored in H-MEM.
// 3. Month 2: her October bill, with memory.
// 4. Month 2 again without memory, to show what memory changed.

import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openHouseholdMemory, parseNote, rememberNote } from "./memory/householdMemory.ts";
import { CLOSURE_FLOOR_USD, CLOSURE_SHARE, MAX_SLOPE_VS_OHIO, RECOMPUTE_TOLERANCE } from "./agents/critic.ts";
import { MIN_BILLS_TO_FIT } from "./agents/weatherAnalyst.ts";
import type { LogEvent } from "./log.ts";
import { explain, ORCHESTRATOR, type Explanation } from "./pipeline.ts";
import { createRuntime } from "./runtime.ts";

export const DEMO_HOUSEHOLD = "linda";

export interface DemoStep {
  readonly name: "month1" | "month2" | "month2-without-memory";
  readonly bill: string;
  readonly memory: boolean;
}

export const DEMO_STEPS: readonly DemoStep[] = [
  { name: "month1", bill: "samples/linda-2026-09.png", memory: true },
  { name: "month2", bill: "samples/linda-2026-10.png", memory: true },
  { name: "month2-without-memory", bill: "samples/linda-2026-10.png", memory: false },
];

export interface DemoRun extends Explanation {
  readonly step: DemoStep["name"];
  readonly runId: string;
  readonly sampleMode: boolean;
  readonly logFile: string;
}

async function run(step: DemoStep, memoryDir: string): Promise<DemoRun> {
  const runtime = createRuntime();
  const { logger } = runtime;
  logger.log({ agent: ORCHESTRATOR, step: "start", demoStep: step.name, sampleMode: runtime.config.sampleMode, bill: step.bill });
  const explanation = await explain(runtime, step.bill, { householdId: DEMO_HOUSEHOLD, memoryDir: step.memory ? memoryDir : null });
  logger.log({ agent: ORCHESTRATOR, step: "done", logFile: logger.file });
  return { step: step.name, runId: logger.runId, sampleMode: runtime.config.sampleMode, logFile: logger.file, ...explanation };
}

/** Runs the whole demo with its memory in memoryDir, which is wiped first. */
export async function runLindaDemo(memoryDir: string): Promise<readonly DemoRun[]> {
  rmSync(memoryDir, { recursive: true, force: true });
  const month1 = await run(DEMO_STEPS[0], memoryDir);
  const notes = (JSON.parse(readFileSync("samples/linda-notes.json", "utf8")) as unknown[]).map(parseNote);
  const runtime = createRuntime();
  const memory = openHouseholdMemory(join(memoryDir, "hmem"), notes[0].at);
  for (const note of notes) rememberNote(memory, DEMO_HOUSEHOLD, note, runtime.logger);
  const month2 = await run(DEMO_STEPS[1], memoryDir);
  const withoutMemory = await run(DEMO_STEPS[2], memoryDir);
  return [month1, month2, withoutMemory];
}

export interface Household {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly utility: string;
  readonly householdSize: number;
  readonly annualIncomeUsd: number;
  readonly electricHeat: boolean;
}

export interface DemoPayloadRun extends Omit<DemoRun, "logFile"> {
  /** The run's log, one event per agent step, model call, SQL statement and verdict. */
  readonly trace: readonly LogEvent[];
  /** Most the critic lets stay unexplained for this change (check 2). */
  readonly closureAllowedUsd: number | null;
}

/** The thresholds that decide what the critic accepts, so the page can show them. */
export interface DemoRules {
  readonly recomputeTolerance: number;
  readonly closureShare: number;
  readonly closureFloorUsd: number;
  readonly minBillsToFit: number;
  readonly maxSlopeVsOhio: number;
}

/** What the web page receives: the household, the critic's thresholds and the three runs with their traces. */
export interface DemoPayload {
  readonly household: Household;
  readonly rules: DemoRules;
  readonly runs: readonly DemoPayloadRun[];
}

/** Only the events and fields the page shows; paths, retries and token counts stay on the server. */
const TRACE_FIELDS = ["agent", "step", "sql", "modelServed", "check", "accepted", "reason", "about", "attempt", "target"] as const;
const TRACE_STEPS: ReadonlySet<string> = new Set(["sql", "model_call", "accepted", "rejected", "retry"]);

const readTrace = (file: string): LogEvent[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as LogEvent)
    .filter((e) => TRACE_STEPS.has(e.step))
    .map((e) => Object.fromEntries(TRACE_FIELDS.filter((k) => e[k] !== undefined).map((k) => [k, e[k]])) as unknown as LogEvent);

export function demoPayload(runs: readonly DemoRun[]): DemoPayload {
  const raw = JSON.parse(readFileSync("samples/linda.json", "utf8")) as Household;
  return {
    household: {
      id: raw.id,
      name: raw.name,
      city: raw.city,
      utility: raw.utility,
      householdSize: raw.householdSize,
      annualIncomeUsd: raw.annualIncomeUsd,
      electricHeat: raw.electricHeat,
    },
    rules: {
      recomputeTolerance: RECOMPUTE_TOLERANCE,
      closureShare: CLOSURE_SHARE,
      closureFloorUsd: CLOSURE_FLOOR_USD,
      minBillsToFit: MIN_BILLS_TO_FIT,
      maxSlopeVsOhio: MAX_SLOPE_VS_OHIO,
    },
    runs: runs.map(({ logFile, ...run }) => {
      const change = run.change.decomposition?.changeUsd;
      return {
        ...run,
        trace: readTrace(logFile),
        closureAllowedUsd: change === undefined ? null : Math.max(Math.abs(change) * CLOSURE_SHARE, CLOSURE_FLOOR_USD),
      };
    }),
  };
}
