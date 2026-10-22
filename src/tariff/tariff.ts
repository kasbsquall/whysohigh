// Bill computation from OpenEI URDB rate structures. Supports the shape AEP
// Ohio's residential RS tariffs use: a monthly fixed charge and one energy
// period with consumption tiers, each tier priced as rate + adj per kWh.
// Anything else (time of use, demand charges) is rejected, not approximated.

import type { Row } from "../zetaris/client.ts";

export interface TariffTier {
  /** Upper bound of the tier in kWh per month; null for the last tier. */
  readonly maxKwh: number | null;
  readonly ratePerKwh: number;
  readonly adjPerKwh: number;
}

export interface Tariff {
  readonly label: string;
  readonly name: string;
  /** First day in effect, YYYY-MM-DD, Eastern time. */
  readonly start: string;
  /** Last day in effect, inclusive; null while current. */
  readonly end: string | null;
  readonly approved: boolean;
  readonly fixedMonthlyUsd: number;
  readonly tiers: readonly TariffTier[];
}

export interface BillPeriod {
  /** First day of service, YYYY-MM-DD. */
  readonly start: string;
  /** Day the period closes, YYYY-MM-DD, exclusive (the next bill starts here). */
  readonly end: string;
}

export interface ChargeLine {
  readonly label: string;
  readonly usd: number;
}

export interface Segment {
  readonly tariff: Tariff;
  readonly days: number;
}

export interface Charges {
  readonly lines: readonly ChargeLine[];
  readonly totalUsd: number;
  readonly segments: readonly Segment[];
}

const DAY_MS = 86_400_000;
const easternDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });

/** URDB dates are epoch seconds; tariffs take effect on the Eastern calendar day. */
export const urdbDate = (epochSeconds: string): string => easternDate.format(new Date(Number(epochSeconds) * 1000));

const dayIndex = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const fromIndex = (index: number): string => new Date(index * DAY_MS).toISOString().slice(0, 10);
const cents = (usd: number): number => Math.round(usd * 100) / 100;

export const periodDays = (period: BillPeriod): number => dayIndex(period.end) - dayIndex(period.start);

/** Columns: label, name, startdate, enddate, approved, fixedchargefirstmeter, fixedchargeunits, ers, weekday, weekend. */
export function parseTariffRows(rows: readonly Row[]): readonly Tariff[] {
  return rows.map(([label, name, startdate, enddate, approved, fixed, units, ers, weekday, weekend]) => {
    if (units !== "$/month") throw new Error(`Tariff ${label}: fixed charge in "${units}" is not supported.`);
    const periods = JSON.parse(ers) as { max?: number; rate?: number; adj?: number; unit?: string }[][];
    const schedules = [weekday, weekend].map((s) => JSON.parse(s) as number[]);
    if (periods.length !== 1 || schedules.some((s) => s.some((p) => p !== 0))) {
      throw new Error(`Tariff ${label}: time-of-use rates are not supported.`);
    }
    const tiers = periods[0].map((tier) => {
      if (tier.unit !== undefined && tier.unit !== "kWh") throw new Error(`Tariff ${label}: tier unit ${tier.unit}.`);
      return { maxKwh: tier.max ?? null, ratePerKwh: tier.rate ?? 0, adjPerKwh: tier.adj ?? 0 };
    });
    // A capped last tier would leave the kWh above it unpriced.
    if (tiers.length === 0 || tiers[tiers.length - 1].maxKwh !== null) {
      throw new Error(`Tariff ${label}: the last energy tier must have no upper limit.`);
    }
    return {
      label,
      name,
      start: urdbDate(startdate),
      end: enddate ? urdbDate(enddate) : null,
      approved: approved === "true",
      fixedMonthlyUsd: Number(fixed),
      tiers,
    };
  });
}

/** Approved tariffs in effect for each day of the period, as consecutive segments. Throws on a gap. */
export function segmentsFor(tariffs: readonly Tariff[], period: BillPeriod): readonly Segment[] {
  const approved = tariffs.filter((t) => t.approved);
  const segments: Segment[] = [];
  for (let day = dayIndex(period.start); day < dayIndex(period.end); day++) {
    const date = fromIndex(day);
    const inForce = approved
      .filter((t) => t.start <= date && (t.end === null || date <= t.end))
      .sort((a, b) => b.start.localeCompare(a.start) || a.label.localeCompare(b.label))[0];
    if (!inForce) throw new Error(`No approved tariff covers ${date}.`);
    const last = segments.at(-1);
    if (last?.tariff === inForce) segments[segments.length - 1] = { tariff: inForce, days: last.days + 1 };
    else segments.push({ tariff: inForce, days: 1 });
  }
  return segments;
}

function tieredCost(tiers: readonly TariffTier[], kwh: number, tierScale: number) {
  let remaining = kwh;
  let floor = 0;
  let rate = 0;
  let adj = 0;
  for (const tier of tiers) {
    const ceiling = tier.maxKwh === null ? Infinity : tier.maxKwh * tierScale;
    const used = Math.max(0, Math.min(remaining, ceiling - floor));
    rate += used * tier.ratePerKwh;
    adj += used * tier.adjPerKwh;
    remaining -= used;
    floor = ceiling;
    if (remaining <= 0) break;
  }
  return { rate, adj };
}

/**
 * Charges for kWh used over the given segments. When a period spans two
 * tariffs, kWh, the monthly fixed charge and the tier bounds are split by
 * the share of days under each one.
 */
export function computeCharges(segments: readonly Segment[], kwh: number): Charges {
  const totalDays = segments.reduce((sum, s) => sum + s.days, 0);
  let fixed = 0;
  let energy = 0;
  let riders = 0;
  for (const { tariff, days } of segments) {
    const share = days / totalDays;
    fixed += tariff.fixedMonthlyUsd * share;
    const cost = tieredCost(tariff.tiers, kwh * share, share);
    energy += cost.rate;
    riders += cost.adj;
  }
  const lines = [
    { label: "Customer charge", usd: cents(fixed) },
    { label: `Energy charge ${kwh} kWh`, usd: cents(energy) },
    { label: `Riders and adjustments ${kwh} kWh`, usd: cents(riders) },
  ];
  return { lines, totalUsd: cents(lines.reduce((sum, l) => sum + l.usd, 0)), segments };
}
