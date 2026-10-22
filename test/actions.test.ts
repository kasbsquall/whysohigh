import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHouseholdFacts, PROGRAMS, type HouseholdFacts } from "../src/actions/programs.ts";
import { planActions, pippMonthlyUsd, propose, type PlannerInput } from "../src/agents/actionPlanner.ts";
import { checkEligibility } from "../src/agents/critic.ts";
import type { Bill } from "../src/agents/billReader.ts";
import { analyzeChange } from "../src/changeAnalysis.ts";
import type { LogEvent, RunLogger } from "../src/log.ts";
import { actionsTaken, openHouseholdMemory, parseNote, rememberNote } from "../src/memory/householdMemory.ts";
import { analyzeRate, type RateResult } from "../src/pipeline.ts";
import type { Runtime } from "../src/runtime.ts";
import { parseTariffRows } from "../src/tariff/tariff.ts";
import type { Row } from "../src/zetaris/client.ts";
import type { BillWeather } from "../src/zetaris/queries.ts";

const tariffs = parseTariffRows(JSON.parse(readFileSync("test/fixtures/urdb-aep-rs.json", "utf8")) as Row[]);
const linda: HouseholdFacts = { householdSize: 1, annualIncomeUsd: 24000, electricHeat: false, oldestMemberAge: 71, disconnectionNotice: false };

function memoryLogger(): RunLogger & { events: LogEvent[] } {
  const events: LogEvent[] = [];
  return { runId: "run-1", file: "", events, log: (e) => events.push(e) };
}
const fakeRuntime = (): Runtime => ({ logger: memoryLogger() }) as unknown as Runtime;

const august: BillWeather = { periodStart: "2026-07-16", periodEnd: "2026-08-14", days: 29, kwh: 902, weatherDays: 29, cdd: 297, hdd: 0 };
const september: BillWeather = { periodStart: "2026-08-14", periodEnd: "2026-09-16", days: 33, kwh: 1184, weatherDays: 33, cdd: 322.5, hdd: 1.5 };
const septemberBill: Bill = {
  periodStart: "08/14/2026",
  periodEnd: "09/16/2026",
  days: 33,
  kwh: 1184,
  totalUsd: 217.42,
  previous: { kwh: 902, days: 29, totalUsd: 170.12 },
  lineItems: [],
};

function septemberInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  const runtime = fakeRuntime();
  const rate = analyzeRate(runtime, tariffs, septemberBill, [august, september]);
  const change = analyzeChange(runtime, tariffs, septemberBill, [august, september], rate);
  return { facts: linda, billTotalUsd: 217.42, rate, change, billsOnRecord: 2, asOf: "2026-09-16", taken: new Map(), ...overrides };
}

describe("check 4: eligibility", () => {
  it("accepts an income-tested program under the limit and says why", () => {
    const v = checkEligibility(PROGRAMS.pipp_plus, linda, "2026-09-16", true);
    expect(v).toMatchObject({ check: "eligibility", accepted: true });
    expect(v.reason).toBe("24,000 USD a year is under the 27,930 USD limit for 1 person.");
  });

  it("rejects over the income limit for the household size", () => {
    expect(checkEligibility(PROGRAMS.heap, { ...linda, annualIncomeUsd: 30000 }, "2026-10-16", true)).toMatchObject({
      accepted: false,
      reason: "30,000 USD a year is over the 27,930 USD limit for 1 person.",
    });
    expect(checkEligibility(PROGRAMS.heap, { ...linda, householdSize: 2, annualIncomeUsd: 30000 }, "2026-10-16", true).accepted).toBe(true);
  });

  it("rejects outside the program's dates, before and after", () => {
    expect(checkEligibility(PROGRAMS.heap, linda, "2026-09-16", true).reason).toBe(
      "Not open yet: HEAP takes applications from Oct 1, 2026 to Apr 30, 2027.",
    );
    expect(checkEligibility(PROGRAMS.summer_crisis, linda, "2026-10-01", true).reason).toBe(
      "Closed: Summer Crisis Program ran from Jul 1, 2026 to Sep 30, 2026.",
    );
    expect(checkEligibility(PROGRAMS.summer_crisis, linda, "2026-09-30", true).accepted).toBe(true);
  });

  it("fails closed when a fact the rule needs is missing", () => {
    expect(checkEligibility(PROGRAMS.pipp_plus, null, "2026-09-16", true).reason).toMatch(/household size and yearly income/);
    expect(checkEligibility(PROGRAMS.pipp_plus, { householdSize: 1 }, "2026-09-16", true).accepted).toBe(false);
    expect(checkEligibility(PROGRAMS.pipp_plus, { householdSize: 9, annualIncomeUsd: 1000 }, "2026-09-16", true).reason).toMatch(/not supported yet/);
    expect(checkEligibility(PROGRAMS.summer_crisis, { ...linda, oldestMemberAge: undefined }, "2026-09-16", true).accepted).toBe(false);
  });

  it("asks for the crisis programs' extra condition", () => {
    expect(checkEligibility(PROGRAMS.summer_crisis, { ...linda, oldestMemberAge: 45 }, "2026-09-16", true).accepted).toBe(false);
    expect(checkEligibility(PROGRAMS.summer_crisis, { ...linda, oldestMemberAge: 45, disconnectionNotice: true }, "2026-09-16", true).accepted).toBe(true);
    expect(checkEligibility(PROGRAMS.winter_crisis, linda, "2026-12-01", true).reason).toMatch(/disconnection notice/);
    expect(checkEligibility(PROGRAMS.winter_crisis, { ...linda, disconnectionNotice: true }, "2026-12-01", true).accepted).toBe(true);
  });
});

describe("household facts", () => {
  it("drops malformed facts so the rules that need them reject", () => {
    const facts = parseHouseholdFacts({ householdSize: 1.5, annualIncomeUsd: null, electricHeat: "no", oldestMemberAge: 71, disconnectionNotice: false });
    expect(facts).toEqual({ oldestMemberAge: 71, disconnectionNotice: false });
    expect(checkEligibility(PROGRAMS.pipp_plus, facts, "2026-09-16", true).accepted).toBe(false);
    expect(parseHouseholdFacts({ householdSize: 1, annualIncomeUsd: -5 })).toEqual({ householdSize: 1 });
    expect(pippMonthlyUsd(parseHouseholdFacts({ annualIncomeUsd: 24000, electricHeat: null }))).toBeNull();
  });
});

describe("ActionPlanner", () => {
  it("works out the PIPP Plus payment from income and heating, with a 10 USD floor", () => {
    expect(pippMonthlyUsd(linda)).toBe(100);
    expect(pippMonthlyUsd({ ...linda, electricHeat: true })).toBe(200);
    expect(pippMonthlyUsd({ ...linda, annualIncomeUsd: 1200 })).toBe(10);
    expect(pippMonthlyUsd({ householdSize: 1 })).toBeNull();
  });

  it("for Linda's September bill recommends PIPP Plus, Summer Crisis and a usage note, and rejects HEAP before its season", () => {
    const logger = memoryLogger();
    const plan = planActions(septemberInput(), logger);
    const status = Object.fromEntries(plan.actions.map((a) => [a.id, a.status]));
    expect(status).toEqual({ pipp_plus: "recommended", heap: "rejected", summer_crisis: "recommended", winter_crisis: "rejected", usage_note: "recommended" });
    expect(plan.actions.find((a) => a.id === "pipp_plus")?.amount).toEqual({ kind: "monthly", usd: 100, insteadOfUsd: 217.42 });
    expect(plan.actions.find((a) => a.id === "usage_note")?.amount).toEqual({ kind: "share_of_change", usd: 30.83 });
    expect(plan.notProposed.map((n) => n.id)).toEqual(["puco_complaint", "budget_billing"]);
    expect(logger.events.filter((e) => e.agent === "ReconciliationCritic" && e.check === "eligibility")).toHaveLength(5);
  });

  it("proposes a PUCO complaint only when the bill does not match the tariff", () => {
    const base = septemberInput();
    const withGap: RateResult = { ...base.rate, possibleBillingErrorUsd: 12.5 };
    const { proposed } = propose({ ...base, rate: withGap });
    expect(proposed.find((a) => a.id === "puco_complaint")).toMatchObject({ amount: { kind: "disputed", usd: 12.5 } });
    expect(propose(base).proposed.some((a) => a.id === "puco_complaint")).toBe(false);
    const below = propose({ ...base, rate: { ...base.rate, possibleBillingErrorUsd: -8 } });
    expect(below.proposed.some((a) => a.id === "puco_complaint")).toBe(false);
    expect(below.notProposed.find((n) => n.id === "puco_complaint")?.reason).toMatch(/below what the published tariff gives/);
  });

  it("warns that HEAP pays 75% less once the household has applied for PIPP Plus", () => {
    const taken = new Map([["pipp_plus" as const, { at: "2026-09-25", text: "I applied for PIPP Plus." }]]);
    const heap = propose(septemberInput({ taken })).proposed.find((a) => a.id === "heap");
    expect(heap?.why).toContain("about 8.00 USD to 137.00 USD");
  });

  it("does not suggest a usage note when the change was not fully explained", () => {
    const base = septemberInput();
    const { notProposed, proposed } = propose({ ...base, change: { ...base.change, closed: false } });
    expect(proposed.some((a) => a.id === "usage_note")).toBe(false);
    expect(notProposed.find((n) => n.id === "usage_note")?.reason).toMatch(/could not be fully explained/);
  });

  it("counts a seasonal action only within its season", () => {
    const heapLastSeason = new Map([["heap" as const, { at: "2026-05-02", text: "I got HEAP." }]]);
    const plan = planActions(septemberInput({ taken: heapLastSeason, asOf: "2026-10-16" }), memoryLogger());
    expect(plan.actions.find((a) => a.id === "heap")?.status).toBe("recommended");
  });

  it("skips an action the household already took, without sending it to the critic", () => {
    const logger = memoryLogger();
    const taken = new Map([["pipp_plus" as const, { at: "2026-09-25", text: "I applied for PIPP Plus on September 25." }]]);
    const plan = planActions(septemberInput({ taken }), logger);
    expect(plan.actions.find((a) => a.id === "pipp_plus")).toMatchObject({ status: "already_taken", verdict: null });
    expect(logger.events.some((e) => e.step === "already_taken" && e.action === "pipp_plus")).toBe(true);
  });
});

describe("action notes in household memory", () => {
  it("parses an action note and finds it by program, only up to the bill's date", () => {
    const note = parseNote({ periodStart: "2026-08-14", kind: "action", action: "pipp_plus", text: "I applied for PIPP Plus.", at: "2026-09-25" });
    const memory = openHouseholdMemory(mkdtempSync(join(tmpdir(), "wsh-act-")), "2026-09-25");
    rememberNote(memory, "linda", note, memoryLogger());
    expect(actionsTaken(memory, "2026-10-16").get("pipp_plus")).toEqual({ at: "2026-09-25", text: "I applied for PIPP Plus." });
    expect(actionsTaken(memory, "2026-09-16").size).toBe(0);
  });

  it("rejects an action note without a known program, and an action on another kind", () => {
    const base = { periodStart: "2026-08-14", text: "x", at: "2026-09-25" };
    expect(() => parseNote({ ...base, kind: "action" })).toThrow(/needs action/);
    expect(() => parseNote({ ...base, kind: "action", action: "lottery" })).toThrow(/needs action/);
    expect(() => parseNote({ ...base, kind: "one_off", action: "heap" })).toThrow(/Only an action note/);
  });
});
