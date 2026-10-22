import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeCharges, parseTariffRows, periodDays, segmentsFor, urdbDate } from "../src/tariff/tariff.ts";
import type { Row } from "../src/zetaris/client.ts";

// Live URDB rows for AEP Ohio RS Bundled, read through Zetaris on 22 Oct 2026 (scripts/dump-tariffs.ts).
const rows = JSON.parse(readFileSync("test/fixtures/urdb-aep-rs.json", "utf8")) as Row[];
const tariffs = parseTariffRows(rows);

describe("parseTariffRows", () => {
  it("reads every version with Eastern effective dates", () => {
    expect(tariffs.map((t) => [t.start, t.end, t.approved, t.fixedMonthlyUsd])).toEqual([
      ["2023-12-01", "2024-12-31", false, 16.34],
      ["2025-01-01", "2026-04-09", true, 18.38],
      ["2026-04-10", null, true, 18.788],
    ]);
    expect(tariffs[2].tiers[0]).toEqual({ maxKwh: 2000, ratePerKwh: 0.0347738, adjPerKwh: 0.13299 });
  });

  it("refuses time-of-use schedules instead of approximating them", () => {
    const tou = rows[2].map((cell, i) => (i === 8 ? JSON.stringify([0, 0, 1, ...Array(21).fill(0)]) : cell));
    expect(() => parseTariffRows([tou])).toThrow(/time-of-use/);
  });

  it("refuses a capped last tier, which would leave kWh unpriced", () => {
    const capped = rows[2].map((cell, i) => (i === 7 ? JSON.stringify([[{ max: 500, rate: 0.03, unit: "kWh" }]]) : cell));
    expect(() => parseTariffRows([capped])).toThrow(/last energy tier must have no upper limit/);
  });

  it("converts URDB epoch seconds to the Eastern calendar day", () => {
    expect(urdbDate("1775804400")).toBe("2026-04-10");
  });
});

describe("computeCharges", () => {
  it("prices a period under one tariff", () => {
    const period = { start: "2026-08-14", end: "2026-09-16" };
    expect(periodDays(period)).toBe(33);
    const charges = computeCharges(segmentsFor(tariffs, period), 1184);
    expect(charges.lines.map((l) => l.usd)).toEqual([18.79, 41.17, 157.46]);
    expect(charges.totalUsd).toBe(217.42);
  });

  it("prorates days, fixed charge and kWh across a tariff change", () => {
    const segments = segmentsFor(tariffs, { start: "2026-03-25", end: "2026-04-24" });
    expect(segments.map((s) => [s.tariff.start, s.days])).toEqual([
      ["2025-01-01", 16],
      ["2026-04-10", 14],
    ]);
    expect(computeCharges(segments, 900).totalUsd).toBe(166.17);
  });

  it("moves usage above 2,000 kWh into the second tier", () => {
    const charges = computeCharges(segmentsFor(tariffs, { start: "2026-07-01", end: "2026-07-31" }), 2500);
    expect(charges.lines[2].usd).toBeCloseTo(2000 * 0.13299 + 500 * 0.13253, 2);
  });

  it("refuses a period no approved tariff covers", () => {
    expect(() => segmentsFor(tariffs, { start: "2024-12-30", end: "2025-01-02" })).toThrow(/No approved tariff covers 2024-12-30/);
  });
});
