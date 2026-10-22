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

/** What the household's notes did to this comparison. */
export interface MemoryEffect {
  /** Period starts of the compared bills the household marked as a one-off. */
  readonly oneOffBills: readonly string[];
  /** The bill the model was calibrated to because of a note; null when no note changed it. */
  readonly calibratedInsteadTo: string | null;
  readonly explanation: string;
}

export interface ChangeResult {
  readonly memoryEffect: MemoryEffect | null;
  readonly decomposition: Decomposition | null;
  readonly verdicts: readonly Verdict[];
  readonly closed: boolean;
  /** Why there is no decomposition, when there is none. */
  readonly skipped: string | null;
}

const skip = (runtime: Runtime, reason: string, verdicts: readonly Verdict[] = []): ChangeResult => {
  runtime.logger.log({ agent: ORCHESTRATOR, step: "change_skipped", reason });
  return { memoryEffect: null, decomposition: null, verdicts, closed: false, skipped: reason };
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

/**
 * The bill to calibrate the model to: the previous one, unless the household
 * told us it was a one-off, in which case the latest earlier bill that was not.
 */
function calibrationTarget(
  history: readonly BillWeather[],
  previous: BillWeather,
  current: BillWeather,
  oneOffPeriods: ReadonlySet<string>,
): { target: BillWeather; effect: MemoryEffect | null } {
  const oneOffBills = [previous, current].map((b) => b.periodStart).filter((p) => oneOffPeriods.has(p));
  if (oneOffBills.length === 0) return { target: previous, effect: null };
  const notes: string[] = [];
  let target = previous;
  if (oneOffPeriods.has(previous.periodStart)) {
    const normal = fittableHistory(history, previous.periodStart)
      .filter((b) => !oneOffPeriods.has(b.periodStart))
      .at(-1);
    if (normal) target = normal;
    notes.push(
      normal
        ? `The household said the bill starting ${previous.periodStart} was a one-off, so the model is calibrated to the bill starting ${normal.periodStart} and that bill's extra use is shown on its own.`
        : `The household said the bill starting ${previous.periodStart} was a one-off, but there is no earlier normal bill with complete weather, so the note could not be applied.`,
    );
  }
  if (oneOffPeriods.has(current.periodStart)) {
    notes.push(`The household said this bill is a one-off. It is explained as usual and will be set aside when the next bill is compared.`);
  }
  return {
    target,
    effect: { oneOffBills, calibratedInsteadTo: target === previous ? null : target.periodStart, explanation: notes.join(" ") },
  };
}

export function analyzeChange(
  runtime: Runtime,
  tariffs: readonly Tariff[],
  bill: Bill,
  history: readonly BillWeather[],
  rate: RateResult,
  oneOffPeriods: ReadonlySet<string> = new Set(),
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

  const model = chooseWeatherModel(
    runtime,
    fittableHistory(history, current.periodStart).filter((b) => !oneOffPeriods.has(b.periodStart)),
    verdicts,
  );
  const { target, effect } = calibrationTarget(history, previous, current, oneOffPeriods);
  if (effect) logger.log({ agent: ORCHESTRATOR, step: "memory_effect", ...effect });
  const sides: [BillSide, BillSide] = [
    { bill: previous, billedUsd: previousBilled },
    { bill: current, billedUsd: bill.totalUsd },
  ];

  const attempts: { decomposition: Decomposition; closure: Verdict }[] = [];
  for (let attempt = 1; attempt <= USAGE_STRATEGIES.length; attempt++) {
    const strategy = USAGE_STRATEGIES[attempt - 1];
    if (strategy === "calibrated") {
      const credible = checkWeatherModel(calibrate(model, target));
      verdicts.push(credible);
      logVerdict(logger, credible, WEATHER, attempt);
      if (!credible.accepted) break;
    }
    let decomposition: Decomposition;
    try {
      decomposition = decompose(tariffs, rate.estimate.strategy, rate.priceEffectUsd, model, sides[0], sides[1], strategy, target);
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
  return { memoryEffect: effect, decomposition: best.decomposition, verdicts, closed: Boolean(accepted), skipped: null };
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
