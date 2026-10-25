// Linda's two-month demo from an empty memory, shared by the CLI and the web server.
// 1. Month 1: her September bill.
// 2. Linda tells us September was a one-off (samples/linda-notes.json), stored in H-MEM.
// 3. Month 2: her October bill, with memory.
// 4. Month 2 again without memory, to show what memory changed.

import { readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { openHouseholdMemory, parseNote, rememberNote } from "./memory/householdMemory.ts";
import { parseHouseholdFacts, PROGRAMS, type HouseholdFacts, type Program, type ProgramId } from "./actions/programs.ts";
import { CLOSURE_FLOOR_USD, CLOSURE_SHARE, MAX_SLOPE_VS_OHIO, RECOMPUTE_TOLERANCE } from "./agents/critic.ts";
import { MIN_BILLS_TO_FIT } from "./agents/weatherAnalyst.ts";
import type { LogEvent } from "./log.ts";
import { readDemoWeather, type DemoWeather } from "./demoWeather.ts";
import { explain, ORCHESTRATOR, type Explanation } from "./pipeline.ts";
import { createRuntime, type Runtime } from "./runtime.ts";

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

const lindaFacts = (): HouseholdFacts => parseHouseholdFacts(JSON.parse(readFileSync("samples/linda.json", "utf8")));

async function run(step: DemoStep, memoryDir: string): Promise<DemoRun> {
  const runtime = createRuntime();
  const { logger } = runtime;
  logger.log({ agent: ORCHESTRATOR, step: "start", demoStep: step.name, sampleMode: runtime.config.sampleMode, bill: step.bill });
  const explanation = await explain(runtime, step.bill, { householdId: DEMO_HOUSEHOLD, memoryDir: step.memory ? memoryDir : null, facts: lindaFacts() });
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
  /** The programs this run's actions refer to, with name, next step and source. */
  readonly programs: Readonly<Partial<Record<ProgramId, Program>>>;
  /** The run's log, one event per agent step, model call, SQL statement and verdict. */
  readonly trace: readonly LogEvent[];
  /** Most the critic lets stay unexplained for this change (check 2). */
  readonly closureAllowedUsd: number | null;
  /** Where the page serves the bill image this run read, under web/public. */
  readonly billImage: string | null;
}

/** The bill image of a demo step, as the page serves it: "bills/linda-2026-09.png". */
export const billImageOf = (step: DemoStep["name"]): string | null => {
  const found = DEMO_STEPS.find((s) => s.name === step);
  return found ? `bills/${basename(found.bill)}` : null;
};

/** The thresholds that decide what the critic accepts, so the page can show them. */
export interface DemoRules {
  readonly recomputeTolerance: number;
  readonly closureShare: number;
  readonly closureFloorUsd: number;
  readonly minBillsToFit: number;
  readonly maxSlopeVsOhio: number;
}

/** What the web page receives: the household, the critic's thresholds, the three runs with their traces, and the daily weather of the bills shown. */
export interface DemoPayload {
  readonly household: Household;
  readonly rules: DemoRules;
  readonly runs: readonly DemoPayloadRun[];
  readonly weather: DemoWeather;
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

/** The days the page draws: from the earliest bill compared to the end of the latest bill. */
export function demoWeatherRange(runs: readonly DemoRun[]): { readonly from: string; readonly toExclusive: string } {
  if (runs.length === 0) throw new Error("The demo has no runs to draw weather for.");
  const starts = runs.map((r) => {
    const { start } = r.rate.estimate.period;
    return r.history.find((b) => b.periodEnd === start)?.periodStart ?? start;
  });
  const ends = runs.map((r) => r.rate.estimate.period.end);
  return { from: starts.reduce((a, b) => (b < a ? b : a)), toExclusive: ends.reduce((a, b) => (b > a ? b : a)) };
}

export async function demoPayload(runs: readonly DemoRun[], runtime: Runtime = createRuntime()): Promise<DemoPayload> {
  runtime.logger.log({ agent: ORCHESTRATOR, step: "start", demoStep: "weather-strip", sampleMode: runtime.config.sampleMode });
  const weather = await readDemoWeather(runtime.sql, demoWeatherRange(runs), runtime.config.sampleMode);
  runtime.logger.log({ agent: ORCHESTRATOR, step: "done", days: weather.days.length, source: weather.source, logFile: runtime.logger.file });
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
        programs: Object.fromEntries(run.actions.actions.map((a) => [a.id, PROGRAMS[a.id]])),
        closureAllowedUsd: change === undefined ? null : Math.max(Math.abs(change) * CLOSURE_SHARE, CLOSURE_FLOOR_USD),
        billImage: billImageOf(run.step),
      };
    }),
    weather,
  };
}
