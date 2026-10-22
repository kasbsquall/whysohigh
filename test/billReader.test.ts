import { describe, expect, it } from "vitest";
import { parseBill, readBill } from "../src/agents/billReader.ts";
import type { ChatRequest, LlmClient } from "../src/llm/nightshift.ts";
import type { LogEvent, RunLogger } from "../src/log.ts";

const GOOD = JSON.stringify({
  period_start: "08/14/2026",
  period_end: "09/16/2026",
  days: 33,
  kwh: 1184,
  total_usd: 187.42,
  prev_kwh: 902,
  prev_days: 29,
  prev_total_usd: 138.6,
  line_items: [{ label: "Customer charge", usd: 10 }],
});

describe("parseBill", () => {
  it("maps the reply to a typed bill", () => {
    expect(parseBill(GOOD)).toMatchObject({
      days: 33,
      kwh: 1184,
      totalUsd: 187.42,
      previous: { kwh: 902, days: 29, totalUsd: 138.6 },
      lineItems: [{ label: "Customer charge", usd: 10 }],
    });
  });

  it("accepts fenced JSON and formatted numbers", () => {
    const fenced = "```json\n" + GOOD.replace("1184", '"1,184"').replace("187.42", '"$187.42"') + "\n```";
    expect(parseBill(fenced)).toMatchObject({ kwh: 1184, totalUsd: 187.42 });
  });

  it("keeps previous null when the bill does not print it", () => {
    const noPrev = JSON.stringify({ ...JSON.parse(GOOD), prev_kwh: null });
    expect(parseBill(noPrev).previous).toBeNull();
  });

  it("rejects replies with missing required fields", () => {
    expect(() => parseBill(JSON.stringify({ period_start: "08/14/2026", period_end: "09/16/2026", days: 33 }))).toThrow(/kwh, total_usd/);
    expect(() => parseBill("not json")).toThrow(/not valid JSON/);
  });

  it("rejects shapes and values a bill cannot have", () => {
    const base = JSON.parse(GOOD);
    expect(() => parseBill("null")).toThrow(/single JSON object/);
    expect(() => parseBill("[1]")).toThrow(/single JSON object/);
    expect(() => parseBill(JSON.stringify({ ...base, kwh: "0x10" }))).toThrow(/kwh/);
    expect(() => parseBill(JSON.stringify({ ...base, days: 0 }))).toThrow(/days must be above 0/);
    expect(() => parseBill(JSON.stringify({ ...base, period_end: "Sept 16" }))).toThrow(/period_end/);
    expect(() => parseBill(JSON.stringify({ ...base, line_items: [null] }))).toThrow(/line_items\[0\]/);
  });
});

describe("readBill", () => {
  it("sends the reason back once and logs the rejection before succeeding", async () => {
    const replies = ["sorry, here it is: {", GOOD];
    const requests: ChatRequest[] = [];
    const llm: LlmClient = {
      async chat(_agent, request) {
        requests.push(request);
        return { text: replies[requests.length - 1], reasoning: "", modelRequested: request.model, modelServed: request.model };
      },
    };
    const events: LogEvent[] = [];
    const logger: RunLogger = { runId: "t", file: "", log: (e) => events.push(e) };

    const bill = await readBill(llm, logger, "samples/linda-2026-09.png");
    expect(bill.kwh).toBe(1184);
    expect(events.map((e) => e.step)).toEqual(["rejected_reply", "extracted"]);
    expect(requests[1].messages).toHaveLength(3);
    expect(requests[0].messages).toHaveLength(1);
  });
});
