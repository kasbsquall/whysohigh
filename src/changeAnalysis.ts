// Why the bill changed since the last one. WeatherAnalyst picks the weather
// model, UsageAnalyst splits the dollar change, and ReconciliationCritic checks
// freshness (5), the weather model (3) and closure (2). A rejection sends the
// work back with the reason; if it still does not close, the answer says how
// many dollars are not explained.
//
// What each check can and cannot prove:
// - Closure with the uncalibrated model tests whether the model fits this
//   household: whatever it misses on the previous bill stays unexplained.
// - Once the model is calibrated to the previous bill, the kWh add up by
//   construction and both bills already match the tariff, so closure only
//   confirms the bookkeeping. The split between weather and usage then rests on
//   check 3, which judges the calibrated model.

import type { Bill } from "./agents/billReader.ts";
import {
  checkClosure,
  checkFreshness,
  checkRecompute,
  checkWeatherModel,
  logVerdict,
  type Verdict,
} from "./agents/critic.ts";
import { estimateBill } from "./agents/rateAnalyst.ts";
import { decompose, logDecomposition, type BillSide, type Decomposition, type UsageStrategy } from "./agents/usageAnalyst.ts";
import {
  AGENT as WEATHER,
  calibrate,
  fitWeatherModel,
  fittableHistory,
  MIN_BILLS_TO_FIT,
  OHIO_PRIOR,
  type WeatherModel,
} from "./agents/weatherAnalyst.ts";
import type { RateResult } from "./pipeline.ts";
import type { Runtime } from "./runtime.ts";
import type { Tariff } from "./tariff/tariff.ts";
import type { BillWeather } from "./zetaris/queries.ts";

const ORCHESTRATOR = "Orchestrator";
const USAGE_STRATEGIES: readonly UsageStrategy[] = ["model", "calibrated"];

export interface ChangeResult {
  readonly decomposition: Decomposition | null;
  readonly verdicts: readonly Verdict[];
  readonly closed: boolean;
  /** Why there is no decomposition, when there is none. */
  readonly skipped: string | null;
}

const skip = (runtime: Runtime, reason: string, verdicts: readonly Verdict[] = []): ChangeResult => {
  runtime.logger.log({ agent: ORCHESTRATOR, step: "change_skipped", reason });
  return { decomposition: null, verdicts, closed: false, skipped: reason };
};

/** The previous and current bills from the household history, or why they cannot be paired. */
function pairBills(
  bill: Bill,
  history: readonly BillWeather[],
  rate: RateResult,
): { previous: BillWeather; current: BillWeather } | string {
  const { start, end } = rate.estimate.period;
  const matches = history.filter((h) => h.periodStart === start);
  if (matches.length === 0) return `The household history has no bill starting ${start}.`;
  if (matches.length > 1) return `The household history has ${matches.length} bills starting ${start}; it must have one.`;
  const current = matches[0];
  if (current.periodEnd !== end) return `The bill ends ${end} but the household history ends that period on ${current.periodEnd}.`;
  const previous = history.find((h) => h.periodEnd === start);
  if (!previous) return `The household history has no bill ending ${start}, the day this bill starts.`;
  if (!bill.previous) return "The bill does not print last period's total, so the change in dollars is unknown.";
  if (bill.previous.kwh !== previous.kwh || bill.kwh !== current.kwh) {
    return `The bill (${bill.previous.kwh} then ${bill.kwh} kWh) and the household history (${previous.kwh} then ${current.kwh} kWh) disagree.`;
  }
  return { previous, current };
}

export function analyzeChange(
  runtime: Runtime,
  tariffs: readonly Tariff[],
  bill: Bill,
  history: readonly BillWeather[],
  rate: RateResult,
): ChangeResult {
  const { logger } = runtime;
  if (!rate.closed) {
    return skip(runtime, "This bill does not match the published tariff, so its change cannot be split until that gap is resolved.");
  }
  const pair = pairBills(bill, history, rate);
  if (typeof pair === "string") return skip(runtime, pair);
  const { previous, current } = pair;
  const previousBilled = (bill.previous as NonNullable<Bill["previous"]>).totalUsd;

  const freshness = checkFreshness(tariffs, [previous, current]);
  logVerdict(logger, freshness, "inputs", 1);
  const verdicts: Verdict[] = [freshness];
  if (!freshness.accepted) return skip(runtime, freshness.reason, verdicts);

  // The previous bill must match the tariff too, or its gap would land in "unexplained".
  const previousEstimate = estimateBill(tariffs, { start: previous.periodStart, end: previous.periodEnd }, previous.kwh, rate.estimate.strategy);
  const previousCheck = checkRecompute(previousEstimate, previousBilled);
  verdicts.push(previousCheck);
  logVerdict(logger, previousCheck, "previous bill", 1);
  if (!previousCheck.accepted) return skip(runtime, `Previous bill: ${previousCheck.reason}`, verdicts);
  if (rate.priceEffectUsd === null) return skip(runtime, "No price effect could be computed for the previous bill.", verdicts);

  const model = chooseWeatherModel(runtime, fittableHistory(history, current.periodStart), verdicts);
  const sides: [BillSide, BillSide] = [
    { bill: previous, billedUsd: previousBilled },
    { bill: current, billedUsd: bill.totalUsd },
  ];

  const attempts: { decomposition: Decomposition; closure: Verdict }[] = [];
  for (let attempt = 1; attempt <= USAGE_STRATEGIES.length; attempt++) {
    const strategy = USAGE_STRATEGIES[attempt - 1];
    if (strategy === "calibrated") {
      const credible = checkWeatherModel(calibrate(model, previous));
      verdicts.push(credible);
      logVerdict(logger, credible, WEATHER, attempt);
      if (!credible.accepted) break;
    }
    let decomposition: Decomposition;
    try {
      decomposition = decompose(tariffs, rate.estimate.strategy, rate.priceEffectUsd, model, sides[0], sides[1], strategy);
    } catch (error: unknown) {
      return skip(runtime, (error as Error).message, verdicts);
    }
    logDecomposition(logger, decomposition, attempt);
    const closure = checkClosure(decomposition);
    verdicts.push(closure);
    logVerdict(logger, closure, "UsageAnalyst", attempt);
    attempts.push({ decomposition, closure });
    if (closure.accepted) break;
    if (attempt < USAGE_STRATEGIES.length) {
      logger.log({ agent: ORCHESTRATOR, step: "retry", target: "UsageAnalyst", next: USAGE_STRATEGIES[attempt], reason: closure.reason });
    }
  }

  const accepted = attempts.find((a) => a.closure.accepted);
  const best = accepted ?? attempts.reduce((a, b) => (Math.abs(b.closure.gapUsd) < Math.abs(a.closure.gapUsd) ? b : a));
  if (!accepted) {
    logger.log({ agent: ORCHESTRATOR, step: "finding", kind: "unexplained_change", usd: best.closure.gapUsd, reason: best.closure.reason });
  }
  return { decomposition: best.decomposition, verdicts, closed: Boolean(accepted), skipped: null };
}

/** A household fit when there is enough history and the critic accepts it; the Ohio prior otherwise. */
function chooseWeatherModel(runtime: Runtime, earlier: readonly BillWeather[], verdicts: Verdict[]): WeatherModel {
  const { logger } = runtime;
  const fitted = fitWeatherModel(earlier);
  if (!fitted) {
    const count = `${earlier.length} earlier ${earlier.length === 1 ? "bill" : "bills"} with complete weather`;
    const reason =
      earlier.length < MIN_BILLS_TO_FIT
        ? `${count}, fewer than the ${MIN_BILLS_TO_FIT} needed to fit this household, so the Ohio prior is used and confidence is low.`
        : `The ${count} cannot separate base use from heating and cooling, so the Ohio prior is used and confidence is low.`;
    logger.log({ agent: WEATHER, step: "model", source: OHIO_PRIOR.source, reason });
    return OHIO_PRIOR;
  }
  const verdict = checkWeatherModel(fitted);
  verdicts.push(verdict);
  logVerdict(logger, verdict, WEATHER, 1);
  if (verdict.accepted) {
    logger.log({ agent: WEATHER, step: "model", source: fitted.source, r2: fitted.r2, billsUsed: fitted.billsUsed });
    return fitted;
  }
  logger.log({ agent: ORCHESTRATOR, step: "retry", target: WEATHER, next: OHIO_PRIOR.source, reason: verdict.reason });
  logger.log({ agent: WEATHER, step: "model", source: OHIO_PRIOR.source, reason: "Household fit rejected by the critic." });
  return OHIO_PRIOR;
}
