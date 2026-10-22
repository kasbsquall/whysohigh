// ReconciliationCritic: checks the analysts' numbers against the bill and can
// reject them. Each check returns a verdict with its reason; nothing passes
// silently.

import type { RunLogger } from "../log.ts";
import { segmentsFor, type Tariff } from "../tariff/tariff.ts";
import type { BillWeather } from "../zetaris/queries.ts";
import type { RateEstimate } from "./rateAnalyst.ts";
import { componentUsd, type Decomposition } from "./usageAnalyst.ts";
import { OHIO_PRIOR, type WeatherModel } from "./weatherAnalyst.ts";

export const AGENT = "ReconciliationCritic";

/** Check 1 tolerance: the recomputed bill must land within 2% of the billed total. */
export const RECOMPUTE_TOLERANCE = 0.02;

export interface Verdict {
  readonly check: string;
  readonly accepted: boolean;
  readonly reason: string;
  readonly gapUsd: number;
}

export function checkRecompute(estimate: RateEstimate, billedUsd: number): Verdict {
  const gapUsd = Math.round((billedUsd - estimate.charges.totalUsd) * 100) / 100;
  const share = billedUsd === 0 ? (gapUsd === 0 ? 0 : 1) : Math.abs(gapUsd) / Math.abs(billedUsd);
  const pct = (share * 100).toFixed(1);
  const accepted = share <= RECOMPUTE_TOLERANCE;
  const reason = accepted
    ? `Published tariff gives ${estimate.charges.totalUsd.toFixed(2)} USD, billed ${billedUsd.toFixed(2)} USD (${pct}% apart).`
    : `Published tariff gives ${estimate.charges.totalUsd.toFixed(2)} USD but the bill says ${billedUsd.toFixed(2)} USD: ` +
      `${Math.abs(gapUsd).toFixed(2)} USD (${pct}%) more than the ${RECOMPUTE_TOLERANCE * 100}% allowed.`;
  return { check: "bill_recompute", accepted, reason, gapUsd };
}

/** Check 2 tolerance: what stays unexplained must be under 5% of the change (never less than 1 USD). */
export const CLOSURE_SHARE = 0.05;
export const CLOSURE_FLOOR_USD = 1;

export function checkClosure(d: Decomposition): Verdict {
  const gapUsd = componentUsd(d, "unexplained");
  const allowed = Math.max(Math.abs(d.changeUsd) * CLOSURE_SHARE, CLOSURE_FLOOR_USD);
  const accepted = Math.abs(gapUsd) <= allowed;
  const reason = accepted
    ? `Price, days, weather and usage explain the ${d.changeUsd.toFixed(2)} USD change; ${Math.abs(gapUsd).toFixed(2)} USD is left, within the ${allowed.toFixed(2)} USD allowed.`
    : `${Math.abs(gapUsd).toFixed(2)} USD of the ${d.changeUsd.toFixed(2)} USD change is not explained, more than the ${allowed.toFixed(2)} USD allowed ` +
      `(${CLOSURE_SHARE * 100}% of the change, at least ${CLOSURE_FLOOR_USD} USD). ` +
      (d.usageStrategy === "model"
        ? `Usage was measured against the ${d.model.source} weather model, which may not fit this household.`
        : "Usage was measured against the model calibrated to the household's previous bill.");
  return { check: "closure", accepted, reason, gapUsd };
}

/** Check 3 limits: slopes at most this many times the statewide ones, and a fit must explain half the variance. */
export const MAX_SLOPE_VS_OHIO = 4;
export const MIN_FIT_R2 = 0.5;

/** Check 3: the weather model must behave like electricity use does before its weather share is believed. */
export function checkWeatherModel(model: WeatherModel): Verdict {
  const maxCdd = OHIO_PRIOR.perCdd * MAX_SLOPE_VS_OHIO;
  const maxHdd = OHIO_PRIOR.perHdd * MAX_SLOPE_VS_OHIO;
  const problems = [
    model.basePerDay <= 0 ? `base use of ${model.basePerDay.toFixed(1)} kWh per day` : null,
    model.perCdd < 0 || model.perCdd > maxCdd ? `${model.perCdd.toFixed(3)} kWh per cooling degree day (allowed 0 to ${maxCdd.toFixed(3)})` : null,
    model.perHdd < 0 || model.perHdd > maxHdd ? `${model.perHdd.toFixed(3)} kWh per heating degree day (allowed 0 to ${maxHdd.toFixed(3)})` : null,
    model.r2 !== null && model.r2 < MIN_FIT_R2 ? `a fit that explains ${(model.r2 * 100).toFixed(0)}% of past bills (needs ${MIN_FIT_R2 * 100}%)` : null,
  ].filter((p): p is string => p !== null);
  const what =
    model.source === "household_fit" ? `The fit on ${model.billsUsed} bills` : "The Ohio prior";
  const calibrated = model.calibrationPerDay !== 0 ? `, calibrated by ${model.calibrationPerDay.toFixed(2)} kWh per day,` : "";
  const accepted = problems.length === 0;
  const reason = accepted
    ? `${what}${calibrated} has ${model.basePerDay.toFixed(1)} kWh per day of base use and slopes within ${MAX_SLOPE_VS_OHIO} times the Ohio ones.`
    : `${what}${calibrated} gives ${problems.join(" and ")}. Its weather share is not credible.`;
  return { check: "weather_model", accepted, reason, gapUsd: 0 };
}

/** Check 5: the tariff and the weather data must cover every day of both bills. */
export function checkFreshness(tariffs: readonly Tariff[], bills: readonly BillWeather[]): Verdict {
  const problems: string[] = [];
  for (const b of bills) {
    try {
      segmentsFor(tariffs, { start: b.periodStart, end: b.periodEnd });
    } catch (error: unknown) {
      problems.push(`${(error as Error).message.replace(/\.$/, "")} (bill ${b.periodStart} to ${b.periodEnd})`);
    }
    if (b.weatherDays !== b.days) {
      problems.push(`NOAA has ${b.weatherDays} of ${b.days} days for the bill ${b.periodStart} to ${b.periodEnd}`);
    }
  }
  const accepted = problems.length === 0;
  const reason = accepted
    ? `Published tariff and NOAA weather cover every day of the ${bills.length} bills compared.`
    : `${problems.join("; ")}.`;
  return { check: "freshness", accepted, reason, gapUsd: 0 };
}

export function logVerdict(logger: RunLogger, verdict: Verdict, about: string, attempt: number): void {
  logger.log({ agent: AGENT, step: verdict.accepted ? "accepted" : "rejected", about, attempt, ...verdict });
}
