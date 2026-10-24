// Writes input_examples/example_{1,2,3}.json: three synthetic requests a judge
// can run, or copy and change. Totals come from AEP Ohio's published tariff
// (data/snapshot/urdb-aep-rs.json); earlier bills follow a stated weather
// response on NOAA's Columbus weather (data/snapshot/noaa-cmh-daily.json).
//   npx tsx scripts/make-input-examples.ts

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseTariffRows } from "../src/tariff/tariff.ts";
import { tariffTotal, type Period } from "./sample-bill.ts";

const tariffs = parseTariffRows(JSON.parse(readFileSync("data/snapshot/urdb-aep-rs.json", "utf8")).rows);
const noaa = JSON.parse(readFileSync("data/snapshot/noaa-cmh-daily.json", "utf8")).rows as string[][];
const meanTemp = new Map(noaa.map(([d, tmax, tmin]) => [d, (Number(tmax) + Number(tmin)) / 2]));

const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const printed = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const days = (p: { start: string; end: string }): number => (Date.parse(p.end) - Date.parse(p.start)) / DAY_MS;

interface Response {
  readonly basePerDay: number;
  readonly perCdd: number;
  readonly perHdd: number;
}

/** kWh of a period under a weather response, base 65 F degree days, rounded. */
function modelKwh(r: Response, start: string, end: string): number {
  let kwh = 0;
  for (let d = start; d < end; d = addDays(d, 1)) {
    const t = meanTemp.get(d);
    if (t === undefined) throw new Error(`No NOAA day ${d} in the snapshot.`);
    kwh += r.basePerDay + r.perCdd * Math.max(t - 65, 0) + r.perHdd * Math.max(65 - t, 0);
  }
  return Math.round(kwh);
}

/** Month-to-month variation applied to earlier bills, so the history is not a perfect fit. */
const NOISE = [1.04, 0.97, 1.02, 0.95, 1.05, 0.98, 1.03, 0.96];

/** Earlier bills of ~30 days ending where the previous bill starts. */
function earlier(r: Response, previousStart: string, count: number): { period_start: string; period_end: string; kwh: number }[] {
  const out = [];
  let end = previousStart;
  for (let i = 0; i < count; i++) {
    const start = addDays(end, -(i % 2 === 0 ? 30 : 31));
    out.unshift({ period_start: printed(start), period_end: printed(end), kwh: Math.round(modelKwh(r, start, end) * NOISE[i % NOISE.length]) });
    end = start;
  }
  return out;
}

function fields(current: Period, previous: Period, overchargeUsd = 0): Record<string, unknown> {
  const total = Math.round((tariffTotal(tariffs, current) + overchargeUsd) * 100) / 100;
  return {
    period_start: printed(current.start),
    period_end: printed(current.end),
    days: days(current),
    kwh: current.kwh,
    total_usd: total,
    prev_kwh: previous.kwh,
    prev_days: days(previous),
    prev_total_usd: tariffTotal(tariffs, previous),
  };
}

const summer: Response = { basePerDay: 24, perCdd: 2.1, perHdd: 0.35 };
const electric: Response = { basePerDay: 19, perCdd: 1.6, perHdd: 1.2 };

const examples = [
  {
    _note: "Synthetic. A gas-heated home that used 20% more than its weather response in August-September; the bill matches the published tariff.",
    household: { id: "example-1", householdSize: 3, annualIncomeUsd: 41000, electricHeat: false, oldestMemberAge: 44, disconnectionNotice: false },
    bill: { fields: fields({ start: "2026-08-14", end: "2026-09-15", kwh: Math.round(modelKwh(summer, "2026-08-14", "2026-09-15") * 1.2) }, { start: "2026-07-15", end: "2026-08-14", kwh: modelKwh(summer, "2026-07-15", "2026-08-14") }) },
    history: earlier(summer, "2026-07-15", 8),
  },
  {
    _note: "Synthetic. An electric-heated home whose spring bill crosses AEP Ohio's 10 Apr 2026 tariff change.",
    household: { id: "example-2", householdSize: 2, annualIncomeUsd: 26500, electricHeat: true, oldestMemberAge: 67, disconnectionNotice: false },
    bill: { fields: fields({ start: "2026-04-01", end: "2026-05-01", kwh: 1060 }, { start: "2026-03-02", end: "2026-04-01", kwh: modelKwh(electric, "2026-03-02", "2026-04-01") }) },
    history: earlier(electric, "2026-03-02", 7),
  },
  {
    _note: "Synthetic. A winter bill billed 18.40 USD above the published tariff, with no earlier bills, and a disconnection notice.",
    household: { householdSize: 4, annualIncomeUsd: 38000, electricHeat: false, oldestMemberAge: 52, disconnectionNotice: true },
    bill: { fields: fields({ start: "2026-01-12", end: "2026-02-10", kwh: 1520 }, { start: "2025-12-10", end: "2026-01-12", kwh: 1450 }, 18.4) },
  },
];

mkdirSync("input_examples", { recursive: true });
examples.forEach((example, i) => {
  const file = `input_examples/example_${i + 1}.json`;
  writeFileSync(file, `${JSON.stringify(example, null, 2)}\n`, "utf8");
  process.stdout.write(`${file}: ${example.bill.fields.period_start} to ${example.bill.fields.period_end}, ${example.bill.fields.total_usd} USD\n`);
});
