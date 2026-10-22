import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Bill } from "../src/agents/billReader.ts";
import { componentUsd } from "../src/agents/usageAnalyst.ts";
import { analyzeChange } from "../src/changeAnalysis.ts";
import type { LogEvent, RunLogger } from "../src/log.ts";
import { openHouseholdGraph, previousDiagnosis, recordRun } from "../src/memory/householdGraph.ts";
import { notesAbout, oneOffPeriods, openHouseholdMemory, parseNote, rememberDiagnosis, rememberNote } from "../src/memory/householdMemory.ts";
import { analyzeRate } from "../src/pipeline.ts";
import type { Runtime } from "../src/runtime.ts";
import { parseTariffRows } from "../src/tariff/tariff.ts";
import type { Row } from "../src/zetaris/client.ts";
import type { BillWeather } from "../src/zetaris/queries.ts";

const tariffs = parseTariffRows(JSON.parse(readFileSync("test/fixtures/urdb-aep-rs.json", "utf8")) as Row[]);

function memoryLogger(): RunLogger & { events: LogEvent[] } {
  const events: LogEvent[] = [];
  return { runId: "run-1", file: "", events, log: (e) => events.push(e) };
}
const fakeRuntime = (): Runtime & { events: LogEvent[] } => {
  const logger = memoryLogger();
  return { logger, events: logger.events } as unknown as Runtime & { events: LogEvent[] };
};
const tempDir = (): string => mkdtempSync(join(tmpdir(), "wsh-mem-"));

const august: BillWeather = { periodStart: "2026-07-16", periodEnd: "2026-08-14", days: 29, kwh: 902, weatherDays: 29, cdd: 297, hdd: 0 };
const september: BillWeather = { periodStart: "2026-08-14", periodEnd: "2026-09-16", days: 33, kwh: 1184, weatherDays: 33, cdd: 322.5, hdd: 1.5 };
const october: BillWeather = { periodStart: "2026-09-16", periodEnd: "2026-10-16", days: 30, kwh: 584, weatherDays: 30, cdd: 81.5, hdd: 87.5 };
const octoberBill: Bill = {
  periodStart: "09/16/2026",
  periodEnd: "10/16/2026",
  days: 30,
  kwh: 584,
  totalUsd: 116.77,
  previous: { kwh: 1184, days: 33, totalUsd: 217.42 },
  lineItems: [],
};
const visit = parseNote({
  periodStart: "2026-08-14",
  kind: "one_off",
  text: "My grandson stayed with me from August 20 to September 10, so September was not a normal month.",
  at: "2026-09-22",
});

describe("household memory on H-MEM", () => {
  it("keeps a note about a bill period across reopenings, with its source", () => {
    const dir = tempDir();
    const first = openHouseholdMemory(dir, "2026-09-16");
    const record = rememberNote(first, "linda", visit, memoryLogger());
    expect(record.source).toBe("household:linda");

    const again = openHouseholdMemory(dir, "2026-10-16");
    expect(notesAbout(again, "2026-08-14", "2026-10-16")).toEqual([{ ...visit, memoryId: record.id }]);
    expect(notesAbout(again, "2026-07-16", "2026-10-16")).toEqual([]);
    expect([...oneOffPeriods(again, "2026-10-16")]).toEqual(["2026-08-14"]);
  });

  it("ignores notes made after the bill being explained, so old bills replay the same", () => {
    const memory = openHouseholdMemory(tempDir(), "2026-09-16");
    rememberNote(memory, "linda", visit, memoryLogger());
    expect(notesAbout(memory, "2026-08-14", "2026-09-16")).toEqual([]);
    expect(oneOffPeriods(memory, "2026-09-16").size).toBe(0);
  });

  it("keeps one copy when the same note or diagnosis is stored twice", () => {
    const memory = openHouseholdMemory(tempDir(), "2026-09-16");
    const logger = memoryLogger();
    rememberNote(memory, "linda", visit, logger);
    rememberNote(memory, "linda", visit, logger);
    rememberDiagnosis(memory, "linda", "2026-08-14", "2026-09-16", "Bill 2026-08-14: change +47.30 USD.", "run-1", logger);
    rememberDiagnosis(memory, "linda", "2026-08-14", "2026-09-16", "Bill 2026-08-14: change +47.30 USD.", "run-2", logger);
    expect(memory.hmem.store.all()).toHaveLength(2);
    expect(logger.events.filter((e) => e.step === "remember_unchanged")).toHaveLength(2);
  });

  it("rejects notes without a date, kind or text", () => {
    expect(() => parseNote({ ...visit, at: "Sept 22" })).toThrow(/at as a real date/);
    expect(() => parseNote({ ...visit, at: "2026-02-30" })).toThrow(/at as a real date/);
    expect(() => parseNote({ ...visit, periodStart: "2026-13-01" })).toThrow(/periodStart as a real date/);
    expect(() => parseNote({ ...visit, kind: "maybe" })).toThrow(/kind must be one of/);
    expect(() => parseNote({ ...visit, text: " " })).toThrow(/needs its text/);
  });
});

describe("household graph on World Model", () => {
  it("records a bill with its diagnosis and reads it back in a later run", async () => {
    const dir = tempDir();
    const runtime = fakeRuntime();
    const septemberBill: Bill = { ...octoberBill, periodStart: "08/14/2026", periodEnd: "09/16/2026", days: 33, kwh: 1184, totalUsd: 217.42, previous: { kwh: 902, days: 29, totalUsd: 170.12 } };
    const rate = analyzeRate(runtime, tariffs, septemberBill, [august, september]);
    const change = analyzeChange(runtime, tariffs, septemberBill, [august, september], rate);
    const graph = openHouseholdGraph(dir, "linda");
    await recordRun(graph, "linda", { periodStart: "2026-08-14", periodEnd: "2026-09-16", kwh: 1184, totalUsd: 217.42 }, rate.estimate, change.decomposition, "run-1", runtime.logger);

    const later = openHouseholdGraph(dir, "linda");
    const read = previousDiagnosis(later, "linda", "2026-08-14", runtime.logger);
    expect(read).toMatchObject({ totalUsd: 217.42, usageStrategy: "calibrated", confidence: "low" });
    expect(read?.components?.usage).toBe(30.83);
    expect(previousDiagnosis(later, "linda", "2026-07-16", runtime.logger)).toBeNull();
  });

  it("reads back the latest run even when it returns to an earlier value, and null when a run could not split", async () => {
    const dir = tempDir();
    const runtime = fakeRuntime();
    const septemberBill: Bill = { ...octoberBill, periodStart: "08/14/2026", periodEnd: "09/16/2026", days: 33, kwh: 1184, totalUsd: 217.42, previous: { kwh: 902, days: 29, totalUsd: 170.12 } };
    const rate = analyzeRate(runtime, tariffs, septemberBill, [august, september]);
    const split = analyzeChange(runtime, tariffs, septemberBill, [august, september], rate).decomposition;
    const facts = { periodStart: "2026-08-14", periodEnd: "2026-09-16", kwh: 1184, totalUsd: 217.42 };
    const graph = openHouseholdGraph(dir, "linda");
    await recordRun(graph, "linda", facts, rate.estimate, split, "run-1", runtime.logger);
    await recordRun(graph, "linda", facts, rate.estimate, null, "run-2", runtime.logger);
    expect(previousDiagnosis(openHouseholdGraph(dir, "linda"), "linda", "2026-08-14", runtime.logger)?.components).toBeNull();
    await recordRun(graph, "linda", facts, rate.estimate, split, "run-3", runtime.logger);
    expect(previousDiagnosis(openHouseholdGraph(dir, "linda"), "linda", "2026-08-14", runtime.logger)?.components?.usage).toBe(30.83);
  });
});

describe("month 2", () => {
  const history = [august, september, october];

  it("with the one-off note, calibrates to August and shows September's extra use did not repeat", () => {
    const runtime = fakeRuntime();
    const rate = analyzeRate(runtime, tariffs, octoberBill, history);
    const result = analyzeChange(runtime, tariffs, octoberBill, history, rate, new Set(["2026-08-14"]));
    const d = result.decomposition;
    expect(result.closed).toBe(true);
    expect(d?.calibratedTo).toBe("2026-07-16");
    expect(d?.components.find((c) => c.key === "one_off")?.kwh).toBeCloseTo(-183.8, 1);
    // October was generated from the same calibrated model, so usage is near zero by construction.
    expect(Math.abs(d?.components.find((c) => c.key === "usage")?.kwh ?? 99)).toBeLessThan(1);
    expect(result.memoryEffect).toMatchObject({ oneOffBills: ["2026-08-14"], calibratedInsteadTo: "2026-07-16" });
  });

  it("says so when a one-off note cannot be applied", () => {
    const runtime = fakeRuntime();
    const septemberBill: Bill = { ...octoberBill, periodStart: "08/14/2026", periodEnd: "09/16/2026", days: 33, kwh: 1184, totalUsd: 217.42, previous: { kwh: 902, days: 29, totalUsd: 170.12 } };
    const rate = analyzeRate(runtime, tariffs, septemberBill, [august, september]);
    const result = analyzeChange(runtime, tariffs, septemberBill, [august, september], rate, new Set(["2026-07-16", "2026-08-14"]));
    expect(result.memoryEffect?.calibratedInsteadTo).toBeNull();
    expect(result.memoryEffect?.explanation).toMatch(/could not be applied/);
    expect(result.memoryEffect?.explanation).toMatch(/this bill is a one-off/);
  });

  it("without memory, reads the same bill as Linda using less", () => {
    const runtime = fakeRuntime();
    const rate = analyzeRate(runtime, tariffs, octoberBill, history);
    const result = analyzeChange(runtime, tariffs, octoberBill, history, rate);
    const d = result.decomposition;
    expect(d?.calibratedTo).toBe("2026-08-14");
    expect(d?.components.some((c) => c.key === "one_off")).toBe(false);
    expect(result.memoryEffect).toBeNull();
    expect(d?.components.find((c) => c.key === "usage")?.kwh).toBeLessThan(-150);
    expect(componentUsd(d!, "unexplained")).toBe(0);
  });
});
