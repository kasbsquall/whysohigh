// UsageAnalyst: splits the dollar change between two bills into price, days,
// weather, usage and what is left unexplained. Every component comes from its
// own estimate; "unexplained" is the remainder and is always shown.
//   model:      usage = this bill's kWh minus what the weather model predicts.
//               Whatever the model misses on the previous bill stays unexplained,
//               so the closure check tests whether the model fits this household.
//   calibrated: the model's base use is shifted to reproduce the previous bill,
//               then usage is measured the same way. The change then adds up by
//               construction; check 3 decides whether the calibrated model is credible.
//               When the household told us the previous bill was a one-off, the
//               model is calibrated to the last normal bill instead, and the
//               previous bill's extra use becomes its own component.

import type { RunLogger } from "../log.ts";
import { computeCharges, type Segment, type Tariff } from "../tariff/tariff.ts";
import type { BillWeather } from "../zetaris/queries.ts";
import { segmentsByStrategy, type RateStrategy } from "./rateAnalyst.ts";
import { calibrate, daysAndWeatherKwh, predictKwh, type WeatherModel } from "./weatherAnalyst.ts";

export const AGENT = "UsageAnalyst";

export type UsageStrategy = "model" | "calibrated";

export type ComponentKey = "price" | "one_off" | "days" | "weather" | "usage" | "unexplained";

export interface Component {
  readonly key: ComponentKey;
  /** kWh behind the component; null for price and unexplained. */
  readonly kwh: number | null;
  readonly usd: number;
}

export interface BillSide {
  readonly bill: BillWeather;
  readonly billedUsd: number;
}

export interface Decomposition {
  readonly usageStrategy: UsageStrategy;
  /** Period start of the bill the model was calibrated to; null when not calibrated. */
  readonly calibratedTo: string | null;
  readonly model: WeatherModel;
  readonly fromUsd: number;
  readonly toUsd: number;
  readonly changeUsd: number;
  readonly components: readonly Component[];
}

const cents = (usd: number): number => Math.round(usd * 100) / 100;
const tenths = (kwh: number): number => Math.round(kwh * 10) / 10;

export function decompose(
  tariffs: readonly Tariff[],
  rateStrategy: RateStrategy,
  priceUsd: number,
  model: WeatherModel,
  previous: BillSide,
  current: BillSide,
  usageStrategy: UsageStrategy,
  /** The bill to calibrate to; defaults to the previous bill. */
  calibrateTo: BillWeather = previous.bill,
): Decomposition {
  const p = previous.bill;
  const c = current.bill;
  const calibrated = usageStrategy === "calibrated";
  const used = calibrated ? calibrate(model, calibrateTo) : model;
  // Extra use on the previous bill the calibrated model does not expect (0 when calibrated to it).
  const oneOff = calibrated && calibrateTo.periodStart !== p.periodStart ? p.kwh - predictKwh(used, p) : 0;
  const { daysKwh, weatherKwh: weather } = daysAndWeatherKwh(used, p, c);
  const usage = c.kwh - predictKwh(used, c);

  // Each kWh step is priced with this bill's tariff, in waterfall order.
  const segments: readonly Segment[] = segmentsByStrategy(tariffs, { start: c.periodStart, end: c.periodEnd }, rateStrategy);
  const cost = (kwh: number): number => computeCharges(segments, kwh).totalUsd;
  const base = p.kwh - oneOff;
  const steps = [p.kwh, base, base + daysKwh, base + daysKwh + weather, base + daysKwh + weather + usage];
  if (steps.some((k) => k < 0)) {
    throw new Error("The weather model takes the bill below zero kWh at some step, so the change cannot be split in this order.");
  }
  const stepUsd = (i: number): number => cents(cost(steps[i + 1]) - cost(steps[i]));

  const changeUsd = cents(current.billedUsd - previous.billedUsd);
  const explained: Component[] = [
    { key: "price", kwh: null, usd: cents(priceUsd) },
    ...(oneOff !== 0 ? [{ key: "one_off" as const, kwh: tenths(-oneOff), usd: stepUsd(0) }] : []),
    { key: "days", kwh: tenths(daysKwh), usd: stepUsd(1) },
    { key: "weather", kwh: tenths(weather), usd: stepUsd(2) },
    { key: "usage", kwh: tenths(usage), usd: stepUsd(3) },
  ];
  const unexplained = cents(changeUsd - explained.reduce((s, x) => s + x.usd, 0));
  return {
    usageStrategy,
    calibratedTo: calibrated ? calibrateTo.periodStart : null,
    model: used,
    fromUsd: previous.billedUsd,
    toUsd: current.billedUsd,
    changeUsd,
    components: [...explained, { key: "unexplained", kwh: null, usd: unexplained }],
  };
}

export const componentUsd = (d: Decomposition, key: ComponentKey): number =>
  d.components.find((x) => x.key === key)?.usd ?? 0;

export function logDecomposition(logger: RunLogger, d: Decomposition, attempt: number): void {
  logger.log({
    agent: AGENT,
    step: "decomposition",
    attempt,
    usageStrategy: d.usageStrategy,
    calibratedTo: d.calibratedTo,
    model: d.model,
    fromUsd: d.fromUsd,
    toUsd: d.toUsd,
    changeUsd: d.changeUsd,
    components: d.components,
  });
}
