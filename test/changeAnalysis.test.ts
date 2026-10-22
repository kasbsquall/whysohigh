import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Bill } from "../src/agents/billReader.ts";
import { checkClosure, checkFreshness, checkWeatherModel } from "../src/agents/critic.ts";
import { componentUsd, decompose } from "../src/agents/usageAnalyst.ts";
import {
  calibrate,
  daysAndWeatherKwh,
  fittableHistory,
  fitWeatherModel,
  OHIO_PRIOR,
  predictKwh,
  type WeatherModel,
} from "../src/agents/weatherAnalyst.ts";
import { analyzeChange } from "../src/changeAnalysis.ts";
import type { LogEvent, RunLogger } from "../src/log.ts";
import { analyzeRate } from "../src/pipeline.ts";
import type { Runtime } from "../src/runtime.ts";
import { parseTariffRows } from "../src/tariff/tariff.ts";
import type { Row } from "../src/zetaris/client.ts";
import type { BillWeather } from "../src/zetaris/queries.ts";

const tariffs = parseTariffRows(JSON.parse(readFileSync("test/fixtures/urdb-aep-rs.json", "utf8")) as Row[]);

function fakeRuntime(): Runtime & { events: LogEvent[] } {
  const events: LogEvent[] = [];
  const logger: RunLogger = { runId: "t", file: "", log: (e) => events.push(e) };
  return { events, logger } as unknown as Runtime & { events: LogEvent[] };
}

// Linda's two bills as the federated Zetaris query returns them (NOAA degree days, base 65 F).
const august: BillWeather = { periodStart: "2026-07-16", periodEnd: "2026-08-14", days: 29, kwh: 902, weatherDays: 29, cdd: 297, hdd: 0 };
const september: BillWeather = { periodStart: "2026-08-14", periodEnd: "2026-09-16", days: 33, kwh: 1184, weatherDays: 33, cdd: 322.5, hdd: 1.5 };

const lindaBill: Bill = {
  periodStart: "08/14/2026",
  periodEnd: "09/16/2026",
  days: 33,
  kwh: 1184,
  totalUsd: 217.42,
  previous: { kwh: 902, days: 29, totalUsd: 170.12 },
  lineItems: [],
};

const side = (bill: BillWeather, billedUsd: number) => ({ bill, billedUsd });

describe("WeatherAnalyst", () => {
  it("turns the monthly Ohio prior into a daily base", () => {
    expect(OHIO_PRIOR.basePerDay * (365.25 / 12)).toBeCloseTo(482.2, 6);
    expect(OHIO_PRIOR.confidence).toBe("low");
  });

  it("splits the model change into days and weather that add up to it", () => {
    const { daysKwh, weatherKwh } = daysAndWeatherKwh(OHIO_PRIOR, august, september);
    expect(daysKwh + weatherKwh).toBeCloseTo(predictKwh(OHIO_PRIOR, september) - predictKwh(OHIO_PRIOR, august), 9);
    // September was 4 days longer but slightly milder per day than August.
    expect(daysKwh).toBeGreaterThan(0);
    expect(weatherKwh).toBeLessThan(0);
  });

  it("recovers a household's own coefficients from enough bills", () => {
    const truth: WeatherModel = { ...OHIO_PRIOR, basePerDay: 12, perCdd: 2.1, perHdd: 0.8 };
    const bills = [
      [30, 400, 0],
      [31, 250, 10],
      [29, 40, 300],
      [32, 0, 900],
      [30, 0, 1100],
      [31, 120, 150],
    ].map(([days, cdd, hdd], i) => ({ periodStart: `2026-0${i + 1}-01`, periodEnd: "", days, cdd, hdd, weatherDays: days, kwh: predictKwh(truth, { days, cdd, hdd }) }));
    const fit = fitWeatherModel(bills);
    expect(fit).not.toBeNull();
    expect(fit?.basePerDay).toBeCloseTo(12, 6);
    expect(fit?.perCdd).toBeCloseTo(2.1, 6);
    expect(fit?.perHdd).toBeCloseTo(0.8, 6);
    expect(fit?.r2).toBeCloseTo(1, 6);
  });

  it("leaves bills with missing weather days out of the fit", () => {
    const bills = Array.from({ length: 7 }, (_, i) => ({ ...september, periodStart: `2025-0${i + 1}-01`, periodEnd: `2025-0${i + 2}-01` }));
    const partial = bills.map((b, i) => (i < 3 ? { ...b, weatherDays: 0, cdd: 0, hdd: 0 } : b));
    expect(fittableHistory(partial, "2026-01-01")).toHaveLength(4);
  });

  it("does not fit with too few bills or a history with no heating at all", () => {
    expect(fitWeatherModel([august, september])).toBeNull();
    const summers = Array.from({ length: 6 }, (_, i) => ({ ...august, days: 29 + i, cdd: 290 + 7 * i, kwh: 900 + 15 * i }));
    expect(fitWeatherModel(summers)).toBeNull();
  });
});

describe("UsageAnalyst", () => {
  it("leaves the prior's miss on last month unexplained when usage is measured against the model", () => {
    const d = decompose(tariffs, "period_end", 0, OHIO_PRIOR, side(august, 170.12), side(september, 217.42), "model");
    expect(d.changeUsd).toBe(47.3);
    expect(componentUsd(d, "unexplained")).toBe(12.6);
  });

  it("closes the change once the model is calibrated to the household's previous bill", () => {
    const d = decompose(tariffs, "period_end", 0, OHIO_PRIOR, side(august, 170.12), side(september, 217.42), "calibrated");
    expect(d.components.map((c) => [c.key, c.usd])).toEqual([
      ["price", 0],
      ["days", 20.86],
      ["weather", -4.39],
      ["usage", 30.83],
      ["unexplained", 0],
    ]);
  });
});

describe("UsageAnalyst limits", () => {
  it("refuses a split that would take the bill below zero kWh", () => {
    const steep: WeatherModel = { ...OHIO_PRIOR, perCdd: 6.9 };
    const cool = { ...september, cdd: 0, hdd: 0 };
    expect(() => decompose(tariffs, "period_end", 0, steep, side({ ...august, kwh: 150 }, 40), side(cool, 60), "model")).toThrow(/below zero kWh/);
  });
});

describe("ReconciliationCritic", () => {
  it("check 2 rejects a change that is not explained within 5%", () => {
    const d = decompose(tariffs, "period_end", 0, OHIO_PRIOR, side(august, 170.12), side(september, 217.42), "model");
    const verdict = checkClosure(d);
    expect(verdict).toMatchObject({ check: "closure", accepted: false, gapUsd: 12.6 });
    expect(verdict.reason).toMatch(/12\.60 USD of the 47\.30 USD change is not explained, more than the 2\.36 USD allowed/);
  });

  it("check 3 rejects negative or outsized slopes, a poor fit and a calibration below zero base use", () => {
    const fit = { ...OHIO_PRIOR, source: "household_fit" as const, billsUsed: 8, r2: 0.9 };
    expect(checkWeatherModel({ ...fit, perCdd: -0.4 }).accepted).toBe(false);
    expect(checkWeatherModel({ ...fit, perCdd: 50 }).reason).toMatch(/50\.000 kWh per cooling degree day \(allowed 0 to 6\.972\)/);
    expect(checkWeatherModel({ ...fit, r2: 0.3 }).reason).toMatch(/explains 30% of past bills/);
    expect(checkWeatherModel(calibrate(OHIO_PRIOR, { ...august, kwh: 300 })).reason).toMatch(/calibrated by .* base use of -/);
    expect(checkWeatherModel(OHIO_PRIOR).accepted).toBe(true);
    expect(checkWeatherModel(calibrate(OHIO_PRIOR, august)).accepted).toBe(true);
  });

  it("check 5 rejects missing weather days and dates no tariff covers", () => {
    const gap = checkFreshness(tariffs, [{ ...september, weatherDays: 30 }, { ...august, periodStart: "2024-11-01", periodEnd: "2024-12-01" }]);
    expect(gap.accepted).toBe(false);
    expect(gap.reason).toMatch(/NOAA has 30 of 33 days/);
    expect(gap.reason).toMatch(/No approved tariff covers 2024-11-01/);
    expect(checkFreshness(tariffs, [august, september]).accepted).toBe(true);
  });
});

describe("analyzeChange", () => {
  const rateFor = (runtime: Runtime, bill: Bill, history: readonly BillWeather[]) => analyzeRate(runtime, tariffs, bill, history);

  it("rejects the prior-based split, retries calibrated and closes", () => {
    const runtime = fakeRuntime();
    const history = [august, september];
    const result = analyzeChange(runtime, tariffs, lindaBill, history, rateFor(runtime, lindaBill, history));
    expect(result.closed).toBe(true);
    expect(result.verdicts.map((v) => [v.check, v.accepted])).toEqual([
      ["freshness", true],
      ["bill_recompute", true],
      ["closure", false],
      ["weather_model", true],
      ["closure", true],
    ]);
    expect(result.decomposition?.usageStrategy).toBe("calibrated");
    expect(runtime.events.find((e) => e.step === "retry" && e.target === "UsageAnalyst")).toMatchObject({ next: "calibrated" });
  });

  it("stops before splitting when NOAA is missing days", () => {
    const runtime = fakeRuntime();
    const history = [august, { ...september, weatherDays: 31 }];
    const result = analyzeChange(runtime, tariffs, lindaBill, history, rateFor(runtime, lindaBill, history));
    expect(result).toMatchObject({ decomposition: null, closed: false });
    expect(result.skipped).toMatch(/NOAA has 31 of 33 days/);
  });

  it("skips with a reason when the bill and the history disagree", () => {
    const runtime = fakeRuntime();
    const history = [{ ...august, kwh: 950 }, september];
    const result = analyzeChange(runtime, tariffs, lindaBill, history, rateFor(runtime, lindaBill, history));
    expect(result.skipped).toMatch(/disagree/);
  });

  it("refuses to compare across a missing bill or a duplicated period", () => {
    const runtime = fakeRuntime();
    const gap = [{ ...august, periodEnd: "2026-08-10" }, september];
    expect(analyzeChange(runtime, tariffs, lindaBill, gap, rateFor(runtime, lindaBill, gap)).skipped).toMatch(/no bill ending 2026-08-14/);
    const twice = [august, september, { ...september, kwh: 1190 }];
    expect(analyzeChange(runtime, tariffs, lindaBill, twice, rateFor(runtime, lindaBill, twice)).skipped).toMatch(/2 bills starting 2026-08-14/);
  });

  it("does not split a change when either bill misses the tariff", () => {
    const runtime = fakeRuntime();
    const history = [august, september];
    const offCurrent = { ...lindaBill, totalUsd: 260 };
    expect(analyzeChange(runtime, tariffs, offCurrent, history, rateFor(runtime, offCurrent, history)).skipped).toMatch(/does not match the published tariff/);
    const offPrevious = { ...lindaBill, previous: { kwh: 902, days: 29, totalUsd: 150 } };
    expect(analyzeChange(runtime, tariffs, offPrevious, history, rateFor(runtime, offPrevious, history)).skipped).toMatch(/^Previous bill: /);
  });

  it("skips when there is no earlier bill", () => {
    const runtime = fakeRuntime();
    const result = analyzeChange(runtime, tariffs, lindaBill, [september], rateFor(runtime, lindaBill, [september]));
    expect(result.skipped).toMatch(/no bill ending 2026-08-14/);
  });

  it("falls back to the Ohio prior when the critic rejects the household fit", () => {
    const runtime = fakeRuntime();
    // Six earlier bills generated with a negative cooling slope, which no real household has.
    const wrong: WeatherModel = { ...OHIO_PRIOR, basePerDay: 30, perCdd: -1, perHdd: 0.5 };
    const earlier = [
      [30, 300, 0],
      [31, 150, 50],
      [29, 20, 400],
      [32, 0, 800],
      [30, 60, 200],
      [31, 220, 10],
    ].map(([days, cdd, hdd], i) => ({
      periodStart: `2025-0${i + 1}-01`,
      periodEnd: `2025-0${i + 2}-01`,
      days,
      cdd,
      hdd,
      weatherDays: days,
      kwh: predictKwh(wrong, { days, cdd, hdd }),
    }));
    const history = [...earlier, august, september];
    const result = analyzeChange(runtime, tariffs, lindaBill, history, rateFor(runtime, lindaBill, history));
    const weatherVerdict = result.verdicts.find((v) => v.check === "weather_model");
    expect(weatherVerdict?.accepted).toBe(false);
    expect(result.decomposition?.model.source).toBe("ohio_prior");
  });
});
