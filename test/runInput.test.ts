import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Bill } from "../src/agents/billReader.ts";
import { fileCache, SampleMissError } from "../src/cache.ts";
import { loadConfig } from "../src/config.ts";
import { historyForBill, InputError, noaaSnapshot, parseRunInput } from "../src/input.ts";
import { createLlmClient } from "../src/llm/nightshift.ts";
import { createRunLogger, type LogEvent, type RunLogger } from "../src/log.ts";
import { runRequest } from "../src/runRequest.ts";
import type { Runtime } from "../src/runtime.ts";
import { createSqlClient } from "../src/zetaris/client.ts";
import { billWeatherInlineSql, billWeatherOffline, dailyWeather } from "../src/zetaris/queries.ts";

function memoryLogger(): RunLogger & { events: LogEvent[] } {
  const events: LogEvent[] = [];
  return { runId: "t", file: "", events, log: (e) => events.push(e) };
}

describe("bill history written into the query", () => {
  it("computes offline what Zetaris returned live for the same statement", () => {
    // Zetaris, 23 Oct 2026, billWeatherInlineSql over noaa_ncei.cmh_daily_from_2024 for these two bills.
    const bills = [
      { periodStart: "2026-07-17", periodEnd: "2026-08-17", kwh: 845 },
      { periodStart: "2026-08-17", periodEnd: "2026-09-16", kwh: 900 },
    ];
    const live = [
      ["2026-07-17", "2026-08-17", "31", "845.0", "31", "312.0", "0.0"],
      ["2026-08-17", "2026-09-16", "30", "900.0", "30", "288.5", "1.5"],
    ];
    const offline = billWeatherOffline(bills, noaaSnapshot());
    expect(offline.map((row) => row.slice(0, 2))).toEqual(live.map((row) => row.slice(0, 2)));
    expect(offline.map((row) => row.slice(2).map(Number))).toEqual(live.map((row) => row.slice(2).map(Number)));
  });

  it("counts only days with both temperatures, as the SQL count does", () => {
    const weather = dailyWeather([
      ["2026-01-01", "40", "30"],
      ["2026-01-02", "", "30"],
    ]);
    expect(billWeatherOffline([{ periodStart: "2026-01-01", periodEnd: "2026-01-04", kwh: 10 }], weather)).toEqual([
      ["2026-01-01", "2026-01-04", "3", "10", "1", "0", "30"],
    ]);
  });

  it("writes only validated dates and numbers into the statement", () => {
    expect(billWeatherInlineSql([{ periodStart: "2026-07-17", periodEnd: "2026-08-17", kwh: 845 }])).toContain(
      "(VALUES (DATE '2026-07-17', DATE '2026-08-17', 31, 845))",
    );
    for (const bad of [
      { periodStart: "2026-02-30", periodEnd: "2026-03-10", kwh: 1 },
      { periodStart: "2026-01-01'; DROP TABLE x; --", periodEnd: "2026-02-01", kwh: 1 },
      { periodStart: "2026-02-01", periodEnd: "2026-01-01", kwh: 1 },
      { periodStart: "2026-01-01", periodEnd: "2026-02-01", kwh: Number.NaN },
    ]) {
      expect(() => billWeatherInlineSql([bad])).toThrow(/Invalid bill/);
    }
    expect(() => billWeatherInlineSql([])).toThrow(/empty/);
  });
});

describe("run requests", () => {
  const fields = {
    period_start: "02/01/2026",
    period_end: "03/03/2026",
    days: 30,
    kwh: 900,
    total_usd: 160.5,
    prev_kwh: 1000,
    prev_days: 31,
    prev_total_usd: 170,
  };

  it("reads the household, the bill fields and earlier bills", () => {
    const input = parseRunInput({
      household: { id: "judge-1", householdSize: 2, annualIncomeUsd: 30000 },
      bill: { fields },
      history: [{ period_start: "12/01/2025", period_end: "01/01/2026", kwh: 950 }],
    });
    expect(input.householdId).toBe("judge-1");
    expect(input.facts).toEqual({ householdSize: 2, annualIncomeUsd: 30000 });
    expect("fields" in input.bill && input.bill.fields.kwh).toBe(900);
    expect(input.earlierBills).toEqual([{ periodStart: "2025-12-01", periodEnd: "2026-01-01", kwh: 950 }]);
  });

  it("rejects what it cannot use, with a reason", () => {
    expect(() => parseRunInput([])).toThrow(InputError);
    expect(() => parseRunInput({ bill: {} })).toThrow(/fields or an image/);
    expect(() => parseRunInput({ bill: { fields: { ...fields, days: 12 } } })).toThrow(/bill.fields: days is 12/);
    expect(() => parseRunInput({ bill: { fields }, household: { id: "../etc" } })).toThrow(/household.id/);
    expect(() => parseRunInput({ bill: { fields }, history: [{ period_start: "2026-01-01", period_end: "02/01/2026", kwh: 1 }] })).toThrow(
      /MM\/DD\/YYYY/,
    );
    expect(() => parseRunInput({ bill: { fields }, history: [{ period_start: "01/01/2026", period_end: "02/01/2026", kwh: -1 }] })).toThrow(
      /kwh/,
    );
  });

  it("rejects periods no bill covers, before any work is done", () => {
    const longHistory = { bill: { fields }, history: [{ period_start: "01/01/2024", period_end: "12/31/2025", kwh: 1 }] };
    expect(() => parseRunInput(longHistory)).toThrow(/covers 730 days; a bill period is at most 62/);
    const longBill = { ...fields, period_start: "01/01/2025", period_end: "03/03/2026", days: 426 };
    expect(() => parseRunInput({ bill: { fields: longBill } })).toThrow(/at most 62/);
    expect(() => parseRunInput({ bill: { fields }, history: [{ period_start: "02/30/2026", period_end: "03/20/2026", kwh: 1 }] })).toThrow(
      /not a real calendar date/,
    );
    expect(() => parseRunInput({ bill: { fields }, history: [{ period_start: "11/01/2023", period_end: "12/01/2023", kwh: 1 }] })).toThrow(
      /before 2024-01-01/,
    );
    expect(() => parseRunInput({ bill: { fields: { ...fields, prev_days: 1e9 } } })).toThrow(/prev_days/);
    expect(() => parseRunInput({ bill: { fields: { ...fields, prev_kwh: -5 } } })).toThrow(/prev_kwh/);
  });

  it("rejects earlier bills that overlap each other or this bill", () => {
    const overlapping = [
      { period_start: "11/01/2025", period_end: "12/05/2025", kwh: 1 },
      { period_start: "12/01/2025", period_end: "12/31/2025", kwh: 1 },
    ];
    expect(() => parseRunInput({ bill: { fields }, history: overlapping })).toThrow(/history\[1\] starts before history\[0\] ends/);
    const bill = (parseRunInput({ bill: { fields } }).bill as { fields: Bill }).fields;
    expect(() => historyForBill(bill, [{ periodStart: "2026-01-15", periodEnd: "2026-02-15", kwh: 1 }])).toThrow(InputError);
    // The previous period printed on the bill (31 days, from 2026-01-01) overlaps a listed bill ending 2026-01-10.
    expect(() => historyForBill(bill, [{ periodStart: "2025-12-10", periodEnd: "2026-01-10", kwh: 1 }])).toThrow(/overlaps the last earlier bill/);
  });

  it("takes the previous bill from the bill's own previous-period box when it is not listed", () => {
    const bill = parseRunInput({ bill: { fields } }).bill as { fields: Bill };
    expect(historyForBill(bill.fields, [])).toEqual([
      { periodStart: "2026-01-01", periodEnd: "2026-02-01", kwh: 1000 },
      { periodStart: "2026-02-01", periodEnd: "2026-03-03", kwh: 900 },
    ]);
    const listed = [{ periodStart: "2026-01-02", periodEnd: "2026-02-01", kwh: 990 }];
    expect(historyForBill(bill.fields, listed)).toEqual([listed[0], { periodStart: "2026-02-01", periodEnd: "2026-03-03", kwh: 900 }]);
  });
});

describe("sample mode with a statement that was never recorded", () => {
  const sampleConfig = loadConfig({});

  it("uses the offline rows and logs the source as snapshot", async () => {
    const logger = memoryLogger();
    const sql = createSqlClient({ config: sampleConfig, cache: fileCache(mkdtempSync(join(tmpdir(), "wsh-"))), logger });
    expect(await sql.run("WeatherAnalyst", "SELECT 2", 1000, () => [["2"]])).toEqual([["2"]]);
    expect(logger.events).toMatchObject([{ agent: "WeatherAnalyst", step: "sql", source: "snapshot", rowCount: 1 }]);
  });

  it("still fails when there is no offline equivalent", async () => {
    const sql = createSqlClient({ config: sampleConfig, cache: fileCache(mkdtempSync(join(tmpdir(), "wsh-"))), logger: memoryLogger() });
    await expect(sql.run("RateAnalyst", "SELECT 3")).rejects.toThrow(SampleMissError);
  });

  it("prefers the recording when there is one", async () => {
    const cache = fileCache(mkdtempSync(join(tmpdir(), "wsh-")));
    cache.write("sql", { sql: "SELECT 4", limit: 1000 }, [["recorded"]]);
    const sql = createSqlClient({ config: sampleConfig, cache, logger: memoryLogger() });
    expect(await sql.run("WeatherAnalyst", "SELECT 4", 1000, () => [["offline"]])).toEqual([["recorded"]]);
  });
});

describe("input_examples, end to end in sample mode", () => {
  const runtime = (): Runtime => {
    const config = loadConfig({});
    const logger = createRunLogger({ dir: mkdtempSync(join(tmpdir(), "wsh-logs-")), echo: () => {} });
    const cache = fileCache();
    return { config, logger, cache, llm: createLlmClient({ config, cache, logger }), sql: createSqlClient({ config, cache, logger }) };
  };
  const example = (n: number) => parseRunInput(JSON.parse(readFileSync(`input_examples/example_${n}.json`, "utf8")));

  it("example 1: the bill matches the tariff and the critic closes the change after one send-back", async () => {
    const result = await runRequest(runtime(), example(1), null);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.output.rate.closed).toBe(true);
    expect(result.output.change.decomposition?.model.source).toBe("household_fit");
    expect(result.output.change.closed).toBe(true);
  });

  it("example 2: a bill across the tariff change is priced and its unexplained part reported", async () => {
    const result = await runRequest(runtime(), example(2), null);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.output.rate.closed).toBe(true);
    expect(result.output.history).toHaveLength(9);
  });

  it("example 3: a bill above the tariff is flagged with the amount", async () => {
    const result = await runRequest(runtime(), example(3), null);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.output.rate.possibleBillingErrorUsd).toBe(18.4);
  });
});
