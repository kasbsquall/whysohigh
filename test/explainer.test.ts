import { describe, expect, it } from "vitest";
import { biggestReason, checkNumbers, factsFor, templateText, type ExplainInput } from "../src/agents/explainer.ts";
import { readReceipt } from "../src/llm/nightshift.ts";
import { decisionInsertSql, decisionReadSql, type Decision } from "../src/zetaris/decisions.ts";
import type { Decomposition } from "../src/agents/usageAnalyst.ts";

// Linda's September split, as out/demo/month1.json has it.
const decomposition = {
  usageStrategy: "calibrated",
  calibratedTo: "2026-07-16",
  model: { source: "household_fit" },
  fromUsd: 170.12,
  toUsd: 217.42,
  changeUsd: 47.3,
  components: [
    { key: "price", kwh: null, usd: 0 },
    { key: "days", kwh: 124.4, usd: 20.86 },
    { key: "weather", kwh: -26.2, usd: -4.39 },
    { key: "usage", kwh: 183.8, usd: 30.83 },
    { key: "unexplained", kwh: null, usd: 0 },
  ],
} as unknown as Decomposition;

const input: ExplainInput = {
  previousKwh: 902,
  currentKwh: 1184,
  previousDays: 29,
  currentDays: 33,
  decomposition,
  action: { name: "PIPP Plus", usd: 100, insteadOfUsd: 217.42 },
};
const facts = factsFor(input);

describe("Explainer check 6", () => {
  it("accepts sentences whose numbers all come from the split", () => {
    const text = "Your bill went up $47.30. Most of it is 4 more days (33 instead of 29, $20.86) and more use at home ($30.83). PIPP Plus could make it $100.00 a month instead of $217.42.";
    const v = checkNumbers(text, facts, 30.83);
    expect(v.accepted).toBe(true);
  });

  it("rejects a number the agents did not compute, and names it", () => {
    const v = checkNumbers("Your own use added $30.83, about 28% more, and the heat $12.00.", facts, 30.83);
    expect(v.accepted).toBe(false);
    expect(v.reason).toContain("28");
    expect(v.reason).toContain("12");
  });

  it("rejects sentences that leave out the biggest reason", () => {
    const v = checkNumbers("More days ($20.86) raised the bill.", facts, biggestReason(decomposition));
    expect(v.accepted).toBe(false);
    expect(v.reason).toContain("$30.83");
  });

  it("builds a fallback sentence that passes its own check", () => {
    const text = templateText(input);
    expect(text).toContain("$30.83");
    expect(checkNumbers(text, facts, biggestReason(decomposition)).accepted).toBe(true);
  });
});

describe("Meterless compute receipt", () => {
  it("keeps the route, consensus and cross-checks", () => {
    const r = readReceipt({
      receipt_id: "rcpt_1",
      requested_model: "a",
      routed_model: "b",
      winning_route: { label: "Nemotron 3.5 Super VL", kind: "cloud" },
      usage: { latency_ms: 661 },
      cost: { actual_usd: 0 },
      privacy: { path: "cloud-ok" },
      receipt: { consensus: { label: "frontier answer", raced: 1 }, cross_check: { checks: [{ type: "pii_guard", status: "passed" }] } },
    });
    expect(r).toEqual({
      receiptId: "rcpt_1",
      requestedModel: "a",
      routedModel: "b",
      route: "Nemotron 3.5 Super VL, cloud",
      consensus: "frontier answer",
      raced: 1,
      crossChecks: ["pii_guard passed"],
      privacy: "cloud-ok",
      costUsd: 0,
      latencyMs: 661,
    });
  });

  it("is undefined when the reply has no receipt", () => {
    expect(readReceipt(undefined)).toBeUndefined();
    expect(readReceipt({ schema: "x" })).toBeUndefined();
  });
});

describe("decision write-back SQL", () => {
  const d: Decision = {
    runKey: "linda:2026-08-14:memory",
    householdId: "linda",
    periodStart: "2026-08-14",
    periodEnd: "2026-09-16",
    changeUsd: 47.3,
    priceUsd: 0,
    daysUsd: 20.86,
    weatherUsd: -4.39,
    usageUsd: 30.83,
    unexplainedUsd: 0,
    checksPassed: 7,
    checksRun: 8,
    action: "PIPP Plus",
    actionUsd: 100,
    explanation: "It's up $47.30 \\ mostly days.",
  };

  it("writes typed values and neutralises quotes and backslashes", () => {
    const sql = decisionInsertSql(d);
    expect(sql).toMatch(/^INSERT INTO household_pg\.decisions VALUES \('linda:2026-08-14:memory', 'linda', DATE '2026-08-14'/);
    expect(sql).toContain("47.30, 0.00, 20.86, -4.39, 30.83, 0.00, 7, 8, 'PIPP Plus', 100.00");
    expect(sql).toContain("It’s up $47.30  mostly days.");
    expect(sql).not.toContain("\\");
  });

  it("refuses run keys and dates that could carry SQL", () => {
    expect(() => decisionInsertSql({ ...d, runKey: "x'; DROP TABLE bills; --" })).toThrow();
    expect(() => decisionInsertSql({ ...d, periodStart: "2026-08-14' OR 1=1" })).toThrow();
    expect(() => decisionReadSql("a' OR '1'='1")).toThrow();
  });
});

describe("Explainer check 6, cut replies", () => {
  it("rejects a reply that stops mid-sentence", () => {
    const v = checkNumbers("Your own use added $30.83 mainly", facts, 30.83);
    expect(v.accepted).toBe(false);
    expect(v.reason).toContain("mid-sentence");
  });
});
