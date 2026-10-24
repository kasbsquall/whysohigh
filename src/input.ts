// A run request a judge or another program can write by hand: the household,
// the bill (its printed fields, or an image for BillReader) and, optionally,
// earlier bills. The same shape is read by `npm run explain -- --input` and by
// POST /api/run. See input_examples/.

import { readFileSync } from "node:fs";
import { parseHouseholdFacts, type HouseholdFacts } from "./actions/programs.ts";
import { parseBill, type Bill } from "./agents/billReader.ts";
import { dailyWeather, type DailyWeather, type HistoryBill } from "./zetaris/queries.ts";

export interface RunInput {
  /** Household id for memory; null runs without memory. */
  readonly householdId: string | null;
  readonly facts: HouseholdFacts;
  /** Bill fields given directly, or the path of a bill image for BillReader. */
  readonly bill: { readonly fields: Bill } | { readonly imagePath: string };
  /** Earlier bills, oldest first, in ISO dates. */
  readonly earlierBills: readonly HistoryBill[];
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const PRINTED = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const HOUSEHOLD_ID = /^[a-z0-9_-]{1,40}$/;
const MAX_EARLIER_BILLS = 36;
/** A monthly bill covers 25 to 36 days; anything past two months is not a bill period. */
export const MAX_PERIOD_DAYS = 62;
/** NOAA is registered in Zetaris from this date, and the tariffs URDB holds start in 2024. */
const FIRST_DATE = "2024-01-01";
const DAY_MS = 86_400_000;
const daysBetween = (start: string, end: string): number => (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;

const iso = (printed: unknown, where: string): string => {
  const m = typeof printed === "string" ? PRINTED.exec(printed) : null;
  if (!m) throw new InputError(`${where} must be a date written MM/DD/YYYY.`);
  const date = `${m[3]}-${m[1]}-${m[2]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(date)) throw new InputError(`${where} is not a real calendar date.`);
  if (date < FIRST_DATE) throw new InputError(`${where} is before ${FIRST_DATE}, where the weather and tariff data start.`);
  return date;
};

/** A period of 1 to MAX_PERIOD_DAYS days. */
function period(start: string, end: string, where: string): number {
  const days = daysBetween(start, end);
  if (days <= 0) throw new InputError(`${where} ends before it starts.`);
  if (days > MAX_PERIOD_DAYS) throw new InputError(`${where} covers ${days} days; a bill period is at most ${MAX_PERIOD_DAYS}.`);
  return days;
}

const isAmount = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Validates a parsed request. Bill fields use the same keys BillReader asks the
 * model for (period_start, period_end, days, kwh, total_usd, prev_kwh, prev_days,
 * prev_total_usd, line_items), so both paths go through one validator.
 */
export function parseRunInput(raw: unknown, imagePath?: string): RunInput {
  if (!isObject(raw)) throw new InputError("The request must be a JSON object.");
  const household = raw.household ?? {};
  if (!isObject(household)) throw new InputError("household must be an object.");
  const id = household.id;
  if (id !== undefined && (typeof id !== "string" || !HOUSEHOLD_ID.test(id))) {
    throw new InputError("household.id may only use a-z, 0-9, - and _ (up to 40 characters).");
  }

  if (!isObject(raw.bill)) throw new InputError("bill is required: { \"fields\": {...} } or { \"image\": \"path\" }.");
  let bill: RunInput["bill"];
  if (isObject(raw.bill.fields)) {
    let fields: Bill;
    try {
      fields = parseBill(JSON.stringify(raw.bill.fields));
    } catch (error: unknown) {
      throw new InputError(`bill.fields: ${(error as Error).message}`);
    }
    checkBill(fields, "bill.fields");
    bill = { fields };
  } else if (imagePath !== undefined) {
    bill = { imagePath };
  } else if (typeof raw.bill.image === "string" && raw.bill.image !== "") {
    bill = { imagePath: raw.bill.image };
  } else {
    throw new InputError("bill needs either fields or an image.");
  }

  const history = raw.history ?? [];
  if (!Array.isArray(history)) throw new InputError("history must be a list of earlier bills.");
  if (history.length > MAX_EARLIER_BILLS) throw new InputError(`history can hold at most ${MAX_EARLIER_BILLS} bills.`);
  const earlierBills = history.map((h, i): HistoryBill => {
    if (!isObject(h) || typeof h.kwh !== "number" || !Number.isFinite(h.kwh) || h.kwh < 0) {
      throw new InputError(`history[${i}] needs period_start, period_end (MM/DD/YYYY) and kwh (a number, 0 or more).`);
    }
    const periodStart = iso(h.period_start, `history[${i}].period_start`);
    const periodEnd = iso(h.period_end, `history[${i}].period_end`);
    period(periodStart, periodEnd, `history[${i}]`);
    return { periodStart, periodEnd, kwh: h.kwh };
  });
  for (let i = 1; i < earlierBills.length; i++) {
    if (earlierBills[i].periodStart < earlierBills[i - 1].periodEnd) {
      throw new InputError(`history[${i}] starts before history[${i - 1}] ends. List earlier bills oldest first, without overlaps.`);
    }
  }

  return {
    householdId: typeof id === "string" ? id : null,
    facts: parseHouseholdFacts(household),
    bill,
    earlierBills,
  };
}

const shift = (isoDate: string, days: number): string =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Bill fields as printed, from a request or from BillReader: dates in range, periods of bill length, amounts not negative. */
export function checkBill(bill: Bill, where: string): void {
  const start = iso(bill.periodStart, `${where} period_start`);
  period(start, iso(bill.periodEnd, `${where} period_end`), where);
  if (!bill.previous) return;
  const { kwh, days, totalUsd } = bill.previous;
  if (!isAmount(kwh) || !isAmount(totalUsd)) throw new InputError(`${where}: prev_kwh and prev_total_usd must be numbers, 0 or more.`);
  if (!Number.isInteger(days) || days < 1 || days > MAX_PERIOD_DAYS) {
    throw new InputError(`${where}: prev_days must be a whole number of days from 1 to ${MAX_PERIOD_DAYS}.`);
  }
  if (shift(start, -days) < FIRST_DATE) throw new InputError(`${where}: the previous period starts before ${FIRST_DATE}, where the weather and tariff data start.`);
}

/**
 * The bills the weather join needs: the earlier bills the caller gave, the
 * previous bill (taken from the "previous period" box printed on the bill when
 * the caller did not list it), and the current bill, oldest first.
 * Throws InputError when an earlier bill overlaps the previous or current one.
 */
export function historyForBill(bill: Bill, earlier: readonly HistoryBill[]): readonly HistoryBill[] {
  checkBill(bill, "bill");
  const current: HistoryBill = { periodStart: iso(bill.periodStart, "bill period_start"), periodEnd: iso(bill.periodEnd, "bill period_end"), kwh: bill.kwh };
  const bills = [...earlier];
  const last = bills[bills.length - 1];
  if (last && last.periodEnd > current.periodStart) {
    throw new InputError(`The last earlier bill ends on ${last.periodEnd}, after this bill starts on ${current.periodStart}.`);
  }
  if (bill.previous && last?.periodEnd !== current.periodStart) {
    const previousStart = shift(current.periodStart, -bill.previous.days);
    if (last && last.periodEnd > previousStart) {
      throw new InputError(
        `The bill's previous period (${bill.previous.days} days, from ${previousStart}) overlaps the last earlier bill, which ends on ${last.periodEnd}. ` +
          "List the previous bill in history with end date equal to this bill's start date, or leave it out.",
      );
    }
    bills.push({ periodStart: previousStart, periodEnd: current.periodStart, kwh: bill.previous.kwh });
  }
  return [...bills, current];
}

const SNAPSHOT = "data/snapshot/noaa-cmh-daily.json";
let snapshot: DailyWeather | null = null;

/** The NOAA copy exported by scripts/export-snapshot.ts, read once per process. */
export function noaaSnapshot(): DailyWeather {
  if (snapshot) return snapshot;
  let parsed: { rows?: unknown };
  try {
    parsed = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as { rows?: unknown };
  } catch (error: unknown) {
    throw new Error(`Could not read the NOAA snapshot ${SNAPSHOT}: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed.rows)) throw new Error(`${SNAPSHOT} has no rows.`);
  snapshot = dailyWeather(parsed.rows as string[][]);
  return snapshot;
}
