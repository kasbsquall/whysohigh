import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Bill } from "../src/agents/billReader.ts";
import { checkRecompute } from "../src/agents/critic.ts";
import { estimateBill, priceEffect } from "../src/agents/rateAnalyst.ts";
import type { LogEvent, RunLogger } from "../src/log.ts";
import { analyzeRate, isoDate } from "../src/pipeline.ts";
import type { Runtime } from "../src/runtime.ts";
import { parseTariffRows } from "../src/tariff/tariff.ts";
import type { Row } from "../src/zetaris/client.ts";
import type { BillWeather } from "../src/zetaris/queries.ts";

const rows = JSON.parse(readFileSync("test/fixtures/urdb-aep-rs.json", "utf8")) as Row[];
const tariffs = parseTariffRows(rows);

function fakeRuntime(): Runtime & { events: LogEvent[] } {
  const events: LogEvent[] = [];
  const logger: RunLogger = { runId: "t", file: "", log: (e) => events.push(e) };
  return { events, logger, sql: { run: async () => rows } } as unknown as Runtime & { events: LogEvent[] };
}

const bill = (periodStart: string, periodEnd: string, kwh: number, totalUsd: number): Bill => ({
  periodStart,
  periodEnd,
  days: 0,
  kwh,
  totalUsd,
  previous: null,
  lineItems: [],
});

const weather = (periodStart: string, periodEnd: string, kwh: number): BillWeather => ({
  periodStart,
  periodEnd,
  days: 0,
  kwh,
  weatherDays: 0,
  cdd: 0,
  hdd: 0,
});

describe("estimateBill", () => {
  it("gives the same answer with both strategies when one tariff covers the period", () => {
    const period = { start: "2026-08-14", end: "2026-09-16" };
    expect(estimateBill(tariffs, period, 1184, "period_end").charges.totalUsd).toBe(217.42);
    expect(estimateBill(tariffs, period, 1184, "prorated").charges.totalUsd).toBe(217.42);
  });

  it("prices a period across the April change with one tariff or both", () => {
    const period = { start: "2026-03-25", end: "2026-04-24" };
    const end = estimateBill(tariffs, period, 900, "period_end");
    const split = estimateBill(tariffs, period, 900, "prorated");
    expect(end.tariffLabels).toEqual(["69dd1b5381bf8b311c0576a8"]);
    expect(split.tariffLabels).toHaveLength(2);
    expect(end.charges.totalUsd).not.toBe(split.charges.totalUsd);
  });
});

describe("priceEffect", () => {
  it("is zero when both periods fall under the same tariff", () => {
    expect(priceEffect(tariffs, { start: "2026-07-16", end: "2026-08-14" }, { start: "2026-08-14", end: "2026-09-16" }, 902, "period_end")).toBe(0);
  });

  it("is positive when the new tariff is dearer", () => {
    expect(priceEffect(tariffs, { start: "2026-02-10", end: "2026-03-12" }, { start: "2026-04-15", end: "2026-05-15" }, 900, "prorated")).toBeGreaterThan(0);
  });
});

describe("checkRecompute", () => {
  const estimate = estimateBill(tariffs, { start: "2026-08-14", end: "2026-09-16" }, 1184, "period_end");

  it("accepts a bill within 2% and explains why", () => {
    const verdict = checkRecompute(estimate, 220);
    expect(verdict).toMatchObject({ check: "bill_recompute", accepted: true, gapUsd: 2.58 });
    expect(verdict.reason).toMatch(/217\.42 USD, billed 220\.00 USD/);
  });

  it("rejects a bill more than 2% away and names the gap", () => {
    const verdict = checkRecompute(estimate, 240);
    expect(verdict).toMatchObject({ accepted: false, gapUsd: 22.58 });
    expect(verdict.reason).toMatch(/22\.58 USD \(9\.4%\)/);
  });

  it("does not accept a negative billed total", () => {
    expect(checkRecompute(estimate, -50).accepted).toBe(false);
  });
});

describe("analyzeRate", () => {
  it("closes on the first attempt when the bill matches the tariff", async () => {
    const runtime = fakeRuntime();
    const history = [weather("2026-07-16", "2026-08-14", 902), weather("2026-08-14", "2026-09-16", 1184)];
    const result = analyzeRate(runtime, tariffs, bill("08/14/2026", "09/16/2026", 1184, 217.42), history);
    expect(result).toMatchObject({ closed: true, possibleBillingErrorUsd: null, priceEffectUsd: 0 });
    expect(result.verdicts).toHaveLength(1);
  });

  it("sends the work back with the critic's reason, then prorates", async () => {
    const runtime = fakeRuntime();
    const prorated = estimateBill(tariffs, { start: "2026-03-25", end: "2026-04-24" }, 900, "prorated").charges.totalUsd;
    const result = analyzeRate(runtime, tariffs, bill("03/25/2026", "04/24/2026", 900, prorated), []);
    expect(result.verdicts.map((v) => v.accepted)).toEqual([false, true]);
    expect(result.estimate.strategy).toBe("prorated");
    const retry = runtime.events.find((e) => e.step === "retry");
    expect(retry).toMatchObject({ agent: "Orchestrator", target: "RateAnalyst", next: "prorated" });
  });

  it("reports a possible billing error when no strategy closes the bill", async () => {
    const runtime = fakeRuntime();
    const result = analyzeRate(runtime, tariffs, bill("08/14/2026", "09/16/2026", 1184, 260), []);
    expect(result).toMatchObject({ closed: false, possibleBillingErrorUsd: 42.58, priceEffectUsd: null });
    expect(runtime.events.find((e) => e.step === "finding")).toMatchObject({ kind: "possible_billing_error", direction: "billed_above_tariff" });
  });

  it("reports the attempt closest to the bill when neither closes", async () => {
    const runtime = fakeRuntime();
    const period = { start: "2026-03-25", end: "2026-04-24" };
    const end = estimateBill(tariffs, period, 900, "period_end").charges.totalUsd;
    const split = estimateBill(tariffs, period, 900, "prorated").charges.totalUsd;
    const billed = Math.round(Math.max(end, split) * 1.05 * 100) / 100;
    const result = analyzeRate(runtime, tariffs, bill("03/25/2026", "04/24/2026", 900, billed), []);
    expect(result.possibleBillingErrorUsd).toBe(Math.round((billed - Math.max(end, split)) * 100) / 100);
  });

  it("keeps the verdict when no tariff covers the previous bill", async () => {
    const runtime = fakeRuntime();
    const history = [weather("2024-11-01", "2024-12-01", 700), weather("2026-08-14", "2026-09-16", 1184)];
    const result = analyzeRate(runtime, tariffs, bill("08/14/2026", "09/16/2026", 1184, 217.42), history);
    expect(result).toMatchObject({ closed: true, priceEffectUsd: null });
    expect(runtime.events.find((e) => e.step === "price_effect")?.reason).toMatch(/No approved tariff covers 2024-11-01/);
  });
});

describe("isoDate", () => {
  it("turns the printed date into ISO", () => {
    expect(isoDate("09/16/2026")).toBe("2026-09-16");
  });
});
