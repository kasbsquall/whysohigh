// RateAnalyst: prices kWh with AEP Ohio's published tariffs, read from OpenEI
// URDB through Zetaris. It has two strategies; the critic decides whether the
// first one is good enough.
//   period_end: the tariff in force on the last day, for the whole period.
//   prorated:   every tariff in force during the period, split by days.

import type { RunLogger } from "../log.ts";
import {
  computeCharges,
  parseTariffRows,
  segmentsFor,
  type BillPeriod,
  type Charges,
  type Segment,
  type Tariff,
} from "../tariff/tariff.ts";
import type { SqlClient } from "../zetaris/client.ts";
import { tariffsSql } from "../zetaris/queries.ts";

export const AGENT = "RateAnalyst";

export type RateStrategy = "period_end" | "prorated";

export interface RateEstimate {
  readonly strategy: RateStrategy;
  readonly period: BillPeriod;
  readonly kwh: number;
  readonly charges: Charges;
  readonly tariffLabels: readonly string[];
}

export async function loadTariffs(sql: SqlClient): Promise<readonly Tariff[]> {
  return parseTariffRows(await sql.run(AGENT, tariffsSql()));
}

const previousDay = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export function segmentsByStrategy(tariffs: readonly Tariff[], period: BillPeriod, strategy: RateStrategy): readonly Segment[] {
  const all = segmentsFor(tariffs, period);
  if (strategy === "prorated") return all;
  const lastDay = segmentsFor(tariffs, { start: previousDay(period.end), end: period.end })[0].tariff;
  return [{ tariff: lastDay, days: all.reduce((sum, s) => sum + s.days, 0) }];
}

export function estimateBill(
  tariffs: readonly Tariff[],
  period: BillPeriod,
  kwh: number,
  strategy: RateStrategy,
): RateEstimate {
  const segments = segmentsByStrategy(tariffs, period, strategy);
  return {
    strategy,
    period,
    kwh,
    charges: computeCharges(segments, kwh),
    tariffLabels: segments.map((s) => s.tariff.label),
  };
}

/**
 * Dollars the bill changed because prices changed: last period's kWh priced
 * with this period's tariffs minus the same kWh priced with last period's.
 * Both sides use the strategy that closed the current bill.
 */
export function priceEffect(
  tariffs: readonly Tariff[],
  previous: BillPeriod,
  current: BillPeriod,
  previousKwh: number,
  strategy: RateStrategy,
): number {
  const now = computeCharges(segmentsByStrategy(tariffs, current, strategy), previousKwh).totalUsd;
  const then = computeCharges(segmentsByStrategy(tariffs, previous, strategy), previousKwh).totalUsd;
  return Math.round((now - then) * 100) / 100;
}

export function logEstimate(logger: RunLogger, estimate: RateEstimate, attempt: number): void {
  logger.log({
    agent: AGENT,
    step: "estimate",
    attempt,
    strategy: estimate.strategy,
    period: estimate.period,
    kwh: estimate.kwh,
    tariffs: estimate.tariffLabels,
    lines: estimate.charges.lines,
    totalUsd: estimate.charges.totalUsd,
  });
}
