// Generates the 30 synthetic AEP Ohio households of the evaluation, each with 13
// monthly bills built from a true weather response, NOAA's real Columbus weather,
// monthly noise and one known cause injected in the last bill. Six households
// per cause: price (a bill across the 10 Apr 2026 tariff change), days (a longer
// period), weather (a season change), usage (a jump or drop in use) and
// billing_error (billed above or below the tariff). One household per group heats
// with electricity, with a heating slope above what check 3 allows.
//
//   npm run eval:generate
//
// Writes eval/households.json and infra/household-db/init/03_seed_eval.sql. Load
// the seed into the running database with the command printed at the end.

import { writeFileSync } from "node:fs";
import { loadTariffs } from "../src/agents/rateAnalyst.ts";
import { createRuntime } from "../src/runtime.ts";
import { periodDays, type Tariff } from "../src/tariff/tariff.ts";
import { sampleBill, tariffTotal, type Period } from "../scripts/sample-bill.ts";
import type { Cause, EvalBill, EvalHousehold, TrueModel } from "./households.ts";

const AGENT = "EvalGenerator";
const SEED = 20261022;
const NOISE_SD = 0.05;
const HISTORY_BILLS = 11;
const TARIFF_CHANGE = "2026-04-10";

/** Last day of each household's current bill, per cause, spread over the seasons NOAA covers. */
const FINAL_ENDS: Readonly<Record<Exclude<Cause, "price">, readonly string[]>> = {
  days: ["2025-03-10", "2025-08-20", "2025-10-05", "2026-02-12", "2026-07-28", "2026-09-30"],
  weather: ["2025-06-25", "2025-07-18", "2025-11-25", "2026-01-22", "2026-06-28", "2026-10-15"],
  usage: ["2025-04-14", "2025-09-09", "2025-12-12", "2026-03-03", "2026-08-19", "2026-10-10"],
  billing_error: ["2025-05-06", "2025-08-08", "2026-01-09", "2026-02-26", "2026-06-11", "2026-09-22"],
};
/** Price households: days between the previous bill's end and the tariff change (0 = the whole bill is on the new tariff). */
const PRICE_OFFSETS = [-15, -10, -6, -3, 0, 0];
const USAGE_FACTORS = [1.25, 1.35, 1.18, 0.8, 1.4, 0.72];
/** Billing error as a share of the correct total; 1% is under the critic's 2% tolerance on purpose. */
const OVERCHARGE_SHARES = [0.01, 0.03, 0.05, 0.08, 0.12, -0.06];
const CAUSES: readonly Cause[] = ["price", "days", "weather", "usage", "billing_error"];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const uniform = (lo: number, hi: number): number => lo + (hi - lo) * rand();
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const normal = (): number => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const round = (n: number, digits: number): number => Math.round(n * 10 ** digits) / 10 ** digits;

const addDays = (iso: string, days: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const printed = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

type DailyMean = ReadonlyMap<string, number>;

/** Degree days over [start, end), base 65 F, as the WeatherAnalyst query computes them. */
function degreeDays(weather: DailyMean, start: string, end: string): { cdd: number; hdd: number } {
  let cdd = 0;
  let hdd = 0;
  for (let day = start; day < end; day = addDays(day, 1)) {
    const mean = weather.get(day);
    if (mean === undefined) throw new Error(`NOAA has no weather for ${day}.`);
    cdd += Math.max(mean - 65, 0);
    hdd += Math.max(65 - mean, 0);
  }
  return { cdd: round(cdd, 1), hdd: round(hdd, 1) };
}

/** Bill periods, oldest first, ending on finalEnd. */
function periods(finalEnd: string, currentDays: number, previousDays: number): readonly { start: string; end: string }[] {
  const lengths = [...Array.from({ length: HISTORY_BILLS }, () => pick([29, 30, 31, 32])), previousDays, currentDays];
  const out: { start: string; end: string }[] = [];
  let end = finalEnd;
  for (const days of lengths.reverse()) {
    out.unshift({ start: addDays(end, -days), end });
    end = addDays(end, -days);
  }
  return out;
}

function trueModel(heating: "gas" | "electric"): TrueModel {
  return heating === "gas"
    ? { basePerDay: round(uniform(11, 26), 2), perCdd: round(uniform(0.9, 3.2), 3), perHdd: round(uniform(0.15, 0.9), 3) }
    : { basePerDay: round(uniform(14, 28), 2), perCdd: round(uniform(0.9, 3.2), 3), perHdd: round(uniform(2.3, 3.2), 3) };
}

const totalOrNull = (tariffs: readonly Tariff[], p: Period): number | null => {
  try {
    return tariffTotal(tariffs, p);
  } catch {
    return null;
  }
};

function household(index: number, weather: DailyMean, tariffs: readonly Tariff[]): EvalHousehold {
  const cause = CAUSES[Math.floor(index / 6)];
  const slot = index % 6;
  const heating = slot === 5 ? "electric" : "gas";
  const model = trueModel(heating);
  const [previousDays, currentDays] = cause === "days" ? [pick([28, 29]), pick([34, 35, 36])] : [pick([30, 31]), pick([30, 31])];
  const finalEnd = cause === "price" ? addDays(addDays(TARIFF_CHANGE, PRICE_OFFSETS[slot]), currentDays) : FINAL_ENDS[cause][slot];

  const usageFactor = cause === "usage" ? USAGE_FACTORS[slot] : 1;
  const bills: Period[] = periods(finalEnd, currentDays, previousDays).map((p, i, all) => {
    const days = periodDays(p);
    const { cdd, hdd } = degreeDays(weather, p.start, p.end);
    const kwh = (model.basePerDay * days + model.perCdd * cdd + model.perHdd * hdd) * (1 + NOISE_SD * normal());
    return { ...p, kwh: Math.round(i === all.length - 1 ? kwh * usageFactor : kwh) };
  });
  const current = bills[bills.length - 1];
  const previous = bills[bills.length - 2];
  const correct = tariffTotal(tariffs, current);
  const overchargeUsd = cause === "billing_error" ? round(correct * OVERCHARGE_SHARES[slot], 2) : 0;
  const injectedUsageKwh = cause === "usage" ? current.kwh - Math.round(current.kwh / usageFactor) : 0;
  const bill = sampleBill(tariffs, {
    current,
    previous,
    statementDate: printed(addDays(current.end, 3)),
    dueDate: printed(addDays(current.end, 23)),
    meterPrevious: Math.round(uniform(10_000, 90_000)),
    overchargeUsd,
  });

  const injected = {
    price: `previous bill ends ${previous.end}, ${Math.max(0, -PRICE_OFFSETS[slot])} days before the 10 Apr 2026 tariff change`,
    days: `${previousDays}-day bill followed by a ${currentDays}-day bill`,
    weather: "no injection: the change comes from the weather between the two periods",
    usage: `use multiplied by ${usageFactor} on the last bill`,
    billing_error: `billed ${overchargeUsd >= 0 ? "above" : "below"} the tariff by ${Math.abs(overchargeUsd).toFixed(2)} USD (${(OVERCHARGE_SHARES[slot] * 100).toFixed(0)}%)`,
  }[cause];

  return {
    id: `eval-${String(index + 1).padStart(2, "0")}`,
    cause,
    heating,
    model,
    noiseSd: NOISE_SD,
    injected,
    injectedUsageKwh,
    overchargeUsd,
    bills: bills.map((p): EvalBill => ({
      periodStart: p.start,
      periodEnd: p.end,
      days: periodDays(p),
      kwh: p.kwh,
      totalUsd: p === current ? bill.totalUsd : totalOrNull(tariffs, p),
    })),
    billedUsd: bill.totalUsd,
    previousBilledUsd: bill.previousTotalUsd,
    billText: bill.text,
  };
}

function seedSql(households: readonly EvalHousehold[]): string {
  const rows = households.flatMap((h) =>
    h.bills.map(
      (b) => `  ('${h.id}', '${b.periodStart}', '${b.periodEnd}', ${b.days}, ${b.kwh}, ${b.totalUsd ?? "NULL"}, 'eval generator, synthetic')`,
    ),
  );
  return [
    "-- Evaluation households, written by eval/generate.ts. Synthetic: every bill comes",
    "-- from a known weather response, NOAA's Columbus weather and an injected cause.",
    "DELETE FROM bills WHERE household_id LIKE 'eval-%';",
    "DELETE FROM households WHERE household_id LIKE 'eval-%';",
    "",
    "INSERT INTO households VALUES",
    households.map((h) => `  ('${h.id}', 'Eval ${h.id.slice(5)}', 'Columbus, OH', 14006, 'USW00014821', 2, NULL, ${h.heating === "electric"}, true)`).join(",\n") + ";",
    "",
    "INSERT INTO bills VALUES",
    `${rows.join(",\n")};`,
    "",
  ].join("\n");
}

const runtime = createRuntime({ echo: () => {} });
const tariffs = await loadTariffs(runtime.sql);
const daily = await runtime.sql.run(AGENT, "SELECT DATE, TMAX, TMIN FROM noaa_ncei.cmh_daily_from_2024 ORDER BY DATE", 1200);
const weather: DailyMean = new Map(daily.map(([date, tmax, tmin]) => [date, (Number(tmax) + Number(tmin)) / 2]));

const households = Array.from({ length: 30 }, (_, i) => household(i, weather, tariffs));
writeFileSync("eval/households.json", `${JSON.stringify(households, null, 2)}\n`, "utf8");
writeFileSync("infra/household-db/init/03_seed_eval.sql", seedSql(households), "utf8");
for (const h of households) {
  const [p, c] = h.bills.slice(-2);
  process.stdout.write(`${h.id} ${h.cause.padEnd(13)} ${h.heating.padEnd(8)} ${p.periodStart}..${c.periodEnd} ${p.kwh} -> ${c.kwh} kWh, ${h.previousBilledUsd} -> ${h.billedUsd} USD\n`);
}
process.stdout.write(
  "Wrote eval/households.json and infra/household-db/init/03_seed_eval.sql. Load it with:\n" +
    "  docker exec -i whysohigh-household-db-1 psql -U whysohigh -d household -v ON_ERROR_STOP=1 < infra/household-db/init/03_seed_eval.sql\n",
);
