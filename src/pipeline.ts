// Orchestration of one explanation run. Agents hand their work to the critic,
// and a rejection sends the work back with the reason instead of going on.

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

export interface Explanation {
  readonly bill: Bill;
  readonly history: readonly BillWeather[];
  readonly rate: RateResult;
}

const STRATEGIES: readonly RateStrategy[] = ["period_end", "prorated"];

/** MM/DD/YYYY to YYYY-MM-DD. */
export const isoDate = (printed: string): string => {
  const [m, d, y] = printed.split("/");
  return `${y}-${m}-${d}`;
};

export async function analyzeRate(
  runtime: Runtime,
  bill: Bill,
  history: readonly BillWeather[],
): Promise<RateResult> {
  const { logger } = runtime;
  const tariffs = await loadTariffs(runtime.sql);
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

export async function explain(runtime: Runtime, billPath: string, householdId: string | null): Promise<Explanation> {
  const bill = await readBill(runtime.llm, runtime.logger, billPath);
  const history = householdId ? await billWeather(runtime.sql, "WeatherAnalyst", householdId) : [];
  const rate = await analyzeRate(runtime, bill, history);
  return { bill, history, rate };
}
