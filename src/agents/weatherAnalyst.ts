// WeatherAnalyst: how many kWh the weather explains. The household model is
//   kWh in a bill period = base x days + perCdd x CDD + perHdd x HDD
// with degree days from NOAA (base 65 F), computed in Zetaris per bill period.
// With at least MIN_BILLS_TO_FIT earlier bills the model is fitted on the
// household's own history; otherwise it uses a statewide Ohio prior and says
// confidence is low.

import type { BillWeather } from "../zetaris/queries.ts";

export const AGENT = "WeatherAnalyst";

export const MIN_BILLS_TO_FIT = 6;

/** Average days per month, used to turn the monthly prior into a daily base. */
const DAYS_PER_MONTH = 365.25 / 12;

export interface WeatherModel {
  readonly source: "ohio_prior" | "household_fit";
  /** kWh per day added to the base so the model reproduces the household's previous bill; 0 when not calibrated. */
  readonly calibrationPerDay: number;
  readonly basePerDay: number;
  readonly perCdd: number;
  readonly perHdd: number;
  /** Share of the variance in past bills the fit explains; null for the prior. */
  readonly r2: number | null;
  readonly billsUsed: number;
  readonly confidence: "low" | "fitted";
}

/**
 * Ohio residential kWh per customer = 482.2 + 0.511 HDD + 1.743 CDD per month
 * (R2 0.963), fitted on EIA OH RES monthly sales per customer against CMH
 * degree days, Jan 2025 to Jul 2026. Source: docs/11-ohio-y-piezas.md, section
 * "Generador propuesto". It is a statewide average, so it only seeds the model.
 */
export const OHIO_PRIOR: WeatherModel = {
  source: "ohio_prior",
  calibrationPerDay: 0,
  basePerDay: 482.2 / DAYS_PER_MONTH,
  perCdd: 1.743,
  perHdd: 0.511,
  r2: null,
  billsUsed: 0,
  confidence: "low",
};

export const predictKwh = (model: WeatherModel, bill: Pick<BillWeather, "days" | "cdd" | "hdd">): number =>
  model.basePerDay * bill.days + model.perCdd * bill.cdd + model.perHdd * bill.hdd;

/** Least squares on (days, CDD, HDD) with no intercept. Null when the history cannot separate the terms. */
export function fitWeatherModel(bills: readonly BillWeather[]): WeatherModel | null {
  if (bills.length < MIN_BILLS_TO_FIT) return null;
  const x = bills.map((b) => [b.days, b.cdd, b.hdd]);
  const y = bills.map((b) => b.kwh);
  const xtx = [0, 1, 2].map((i) => [0, 1, 2].map((j) => x.reduce((s, r) => s + r[i] * r[j], 0)));
  const xty = [0, 1, 2].map((i) => x.reduce((s, r, k) => s + r[i] * y[k], 0));
  const beta = solve3(xtx, xty);
  if (!beta) return null;
  const model: WeatherModel = {
    source: "household_fit",
    calibrationPerDay: 0,
    basePerDay: beta[0],
    perCdd: beta[1],
    perHdd: beta[2],
    r2: null,
    billsUsed: bills.length,
    confidence: "fitted",
  };
  const meanY = y.reduce((s, v) => s + v, 0) / y.length;
  const ssRes = bills.reduce((s, b, k) => s + (y[k] - predictKwh(model, b)) ** 2, 0);
  const ssTot = y.reduce((s, v) => s + (v - meanY) ** 2, 0);
  return { ...model, r2: ssTot === 0 ? null : 1 - ssRes / ssTot };
}

const det3 = (m: readonly (readonly number[])[]): number =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

/** Cramer's rule. Null when the system is (close to) singular, e.g. a history with no heating days at all. */
function solve3(a: readonly (readonly number[])[], b: readonly number[]): readonly number[] | null {
  const d = det3(a);
  const scale = Math.abs(a[0][0] * a[1][1] * a[2][2]);
  if (scale === 0 || Math.abs(d) < scale * 1e-6) return null;
  return [0, 1, 2].map((col) => det3(a.map((row, i) => row.map((v, j) => (j === col ? b[i] : v)))) / d);
}

/** Bills before the current one with NOAA data for every day: the only ones a fit may see. */
export const fittableHistory = (history: readonly BillWeather[], currentStart: string): readonly BillWeather[] =>
  history.filter((b) => b.periodEnd <= currentStart && b.days > 0 && b.weatherDays === b.days);

/**
 * Shifts base use so the model reproduces the household's previous bill exactly.
 * After this, the change between the two bills always adds up in kWh, so the
 * closure check can no longer test the split; check 3 judges the calibrated model.
 */
export function calibrate(model: WeatherModel, previous: Pick<BillWeather, "days" | "cdd" | "hdd" | "kwh">): WeatherModel {
  const shift = (previous.kwh - predictKwh(model, previous)) / previous.days;
  return { ...model, calibrationPerDay: model.calibrationPerDay + shift, basePerDay: model.basePerDay + shift };
}

/**
 * Splits the model's kWh change between two bills in two:
 *   days:    the extra (or missing) days, each one used like an average day of the previous bill;
 *   weather: this bill's days were hotter or colder per day than the previous bill's.
 * Their sum equals the model's prediction for this bill minus its prediction for the previous one.
 */
export function daysAndWeatherKwh(
  model: WeatherModel,
  previous: Pick<BillWeather, "days" | "cdd" | "hdd">,
  current: Pick<BillWeather, "days" | "cdd" | "hdd">,
): { readonly daysKwh: number; readonly weatherKwh: number } {
  const dailyBefore = predictKwh(model, previous) / previous.days;
  const cddPerDay = current.cdd / current.days - previous.cdd / previous.days;
  const hddPerDay = current.hdd / current.days - previous.hdd / previous.days;
  return {
    daysKwh: dailyBefore * (current.days - previous.days),
    weatherKwh: current.days * (model.perCdd * cddPerDay + model.perHdd * hddPerDay),
  };
}
