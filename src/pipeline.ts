// Orchestration of one explanation run. Agents hand their work to the critic,
// and a rejection sends the work back with the reason instead of going on.

import type { HouseholdFacts, ProgramId } from "./actions/programs.ts";
import { planActions, type ActionPlan } from "./agents/actionPlanner.ts";
import { readBill, type Bill } from "./agents/billReader.ts";
import { checkRecompute, logVerdict, type Verdict } from "./agents/critic.ts";
import {
  estimateBill,
  loadTariffs,
  logEstimate,
  priceEffect,
  type RateEstimate,
  type RateStrategy,
} from "./agents/rateAnalyst.ts";
import { join } from "node:path";
import { analyzeChange, type ChangeResult } from "./changeAnalysis.ts";
import { openHouseholdGraph, previousDiagnosis, recordActionPlan, recordRun, type PreviousDiagnosis } from "./memory/householdGraph.ts";
import {
  actionsTaken,
  notesAbout,
  oneOffPeriods,
  openHouseholdMemory,
  rememberDiagnosis,
  type RecalledNote,
} from "./memory/householdMemory.ts";
import type { Runtime } from "./runtime.ts";
import type { BillPeriod, Tariff } from "./tariff/tariff.ts";
import { billWeather, type BillWeather } from "./zetaris/queries.ts";

export const ORCHESTRATOR = "Orchestrator";

export interface RateResult {
  readonly estimate: RateEstimate;
  readonly verdicts: readonly Verdict[];
  readonly closed: boolean;
  /** Set when no strategy closes the bill: billed minus tariff, positive when billed above the tariff. */
  readonly possibleBillingErrorUsd: number | null;
  readonly priceEffectUsd: number | null;
}

export interface MemoryUsed {
  /** What the household told us about the previous bill. */
  readonly notes: readonly RecalledNote[];
  /** What the run for the previous bill concluded, read from the household graph. */
  readonly previousDiagnosis: PreviousDiagnosis | null;
}

export interface Explanation {
  readonly bill: Bill;
  readonly history: readonly BillWeather[];
  readonly rate: RateResult;
  readonly change: ChangeResult;
  /** ActionPlanner's proposals, each judged by critic check 4. */
  readonly actions: ActionPlan;
  readonly memory: MemoryUsed | null;
}

const STRATEGIES: readonly RateStrategy[] = ["period_end", "prorated"];

/** MM/DD/YYYY to YYYY-MM-DD. */
export const isoDate = (printed: string): string => {
  const [m, d, y] = printed.split("/");
  return `${y}-${m}-${d}`;
};

export function analyzeRate(
  runtime: Runtime,
  tariffs: readonly Tariff[],
  bill: Bill,
  history: readonly BillWeather[],
): RateResult {
  const { logger } = runtime;
  const period: BillPeriod = { start: isoDate(bill.periodStart), end: isoDate(bill.periodEnd) };

  const verdicts: Verdict[] = [];
  let estimate: RateEstimate | null = null;
  for (let attempt = 1; attempt <= STRATEGIES.length; attempt++) {
    estimate = estimateBill(tariffs, period, bill.kwh, STRATEGIES[attempt - 1]);
    logEstimate(logger, estimate, attempt);
    const verdict = checkRecompute(estimate, bill.totalUsd);
    verdicts.push(verdict);
    logVerdict(logger, verdict, "RateAnalyst", attempt);
    if (verdict.accepted) break;
    if (attempt < STRATEGIES.length) {
      logger.log({ agent: ORCHESTRATOR, step: "retry", target: "RateAnalyst", next: STRATEGIES[attempt], reason: verdict.reason });
    }
  }
  const last = verdicts[verdicts.length - 1];
  if (!estimate) throw new Error("No rate strategy ran");

  const effect = priceEffectOrNull(runtime, tariffs, history, period, estimate.strategy);

  // When nothing closes, the finding uses the attempt closest to the bill, so
  // the amount is the smallest gap the published tariffs can explain.
  const closest = last.accepted ? null : verdicts.reduce((a, b) => (Math.abs(b.gapUsd) < Math.abs(a.gapUsd) ? b : a));
  if (closest) {
    logger.log({
      agent: ORCHESTRATOR,
      step: "finding",
      kind: "possible_billing_error",
      usd: closest.gapUsd,
      direction: closest.gapUsd > 0 ? "billed_above_tariff" : "billed_below_tariff",
      reason: closest.reason,
    });
  }
  return {
    estimate,
    verdicts,
    closed: last.accepted,
    possibleBillingErrorUsd: closest ? closest.gapUsd : null,
    priceEffectUsd: effect,
  };
}

/** Null when there is no previous bill or no approved tariff covers it; the reason is logged. */
function priceEffectOrNull(
  runtime: Runtime,
  tariffs: readonly Tariff[],
  history: readonly BillWeather[],
  period: BillPeriod,
  strategy: RateStrategy,
): number | null {
  const index = history.findIndex((h) => h.periodStart === period.start);
  const previous = index > 0 ? history[index - 1] : null;
  let usd: number | null = null;
  let reason: string | null = previous ? null : "No previous bill in the household history.";
  if (previous) {
    try {
      usd = priceEffect(tariffs, { start: previous.periodStart, end: previous.periodEnd }, period, previous.kwh, strategy);
    } catch (error: unknown) {
      reason = (error as Error).message;
    }
  }
  runtime.logger.log({ agent: "RateAnalyst", step: "price_effect", usd, strategy, previousPeriod: previous?.periodStart ?? null, reason });
  return usd;
}

export interface ExplainOptions {
  readonly householdId: string | null;
  /** Folder for the household's H-MEM and World Model state; null runs without memory. */
  readonly memoryDir: string | null;
  /** What the household told us about itself (size, income, heating); null if nothing. */
  readonly facts?: HouseholdFacts | null;
}

export async function explain(runtime: Runtime, billPath: string, options: ExplainOptions): Promise<Explanation> {
  const { householdId, memoryDir } = options;
  const bill = await readBill(runtime.llm, runtime.logger, billPath);
  const history = householdId ? await billWeather(runtime.sql, "WeatherAnalyst", householdId) : [];
  const tariffs = await loadTariffs(runtime.sql);
  const rate = analyzeRate(runtime, tariffs, bill, history);
  const { start, end } = rate.estimate.period;
  const plan = (change: ChangeResult, taken: ReadonlyMap<ProgramId, { at: string; text: string }>): ActionPlan =>
    planActions(
      {
        facts: options.facts ?? null,
        billTotalUsd: bill.totalUsd,
        rate,
        change,
        billsOnRecord: history.filter((h) => h.periodEnd <= end).length,
        asOf: end,
        taken,
      },
      runtime.logger,
    );
  if (!householdId || !memoryDir) {
    const change = analyzeChange(runtime, tariffs, bill, history, rate);
    return { bill, history, rate, change, actions: plan(change, new Map()), memory: null };
  }

  const memory = openHouseholdMemory(join(memoryDir, "hmem"), end);
  const graph = openHouseholdGraph(memoryDir, householdId);
  const previousStart = history.find((h) => h.periodEnd === start)?.periodStart ?? null;
  // Only what the household had said by the end of this bill, so replaying an old bill is stable.
  const notes = previousStart ? notesAbout(memory, previousStart, end) : [];
  runtime.logger.log({ agent: "HouseholdMemory", step: "notes", previousBill: previousStart, notes });
  const used: MemoryUsed = {
    notes,
    previousDiagnosis: previousStart ? previousDiagnosis(graph, householdId, previousStart, runtime.logger) : null,
  };

  const change = analyzeChange(runtime, tariffs, bill, history, rate, oneOffPeriods(memory, end));
  const actions = plan(change, actionsTaken(memory, end));
  // Graph first: if it fails, H-MEM is not left holding a diagnosis the graph lacks.
  await recordRun(
    graph,
    householdId,
    { periodStart: start, periodEnd: end, kwh: bill.kwh, totalUsd: bill.totalUsd },
    rate.estimate,
    change.decomposition,
    runtime.logger.runId,
    runtime.logger,
  );
  await recordActionPlan(graph, householdId, actions, end, runtime.logger.runId, runtime.logger);
  rememberDiagnosis(memory, householdId, start, end, summarize(bill, start, end, change), runtime.logger.runId, runtime.logger);
  return { bill, history, rate, change, actions, memory: used };
}

/** One line a later run can recall: the bill and how its change was split. */
function summarize(bill: Bill, start: string, end: string, change: ChangeResult): string {
  const head = `Bill ${start} to ${end}: ${bill.kwh} kWh, ${bill.totalUsd.toFixed(2)} USD.`;
  const d = change.decomposition;
  if (!d) return `${head} Change not split: ${change.skipped ?? "unknown reason"}`;
  const parts = d.components.map((c) => `${c.key} ${c.usd >= 0 ? "+" : ""}${c.usd.toFixed(2)}`).join(", ");
  return `${head} Change ${d.changeUsd >= 0 ? "+" : ""}${d.changeUsd.toFixed(2)} USD from the previous bill: ${parts} (${d.model.source}, confidence ${d.model.confidence}).`;
}
