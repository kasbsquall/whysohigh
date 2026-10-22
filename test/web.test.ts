import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DemoPayload } from "../src/demo.ts";
import { esc, kwh, month, plainReason, short, usd } from "../web/src/format.ts";
import { checksFromTrace, pageView } from "../web/src/model.ts";
import { actions, memoryPanel } from "../web/src/view.ts";

// The sample-mode answer of GET /api/demo, saved on 22 Oct 2026.
const payload = JSON.parse(readFileSync("test/fixtures/demo-payload.json", "utf8")) as DemoPayload;

describe("page formatting", () => {
  it("writes dollars and kWh with a real minus and a plus only when asked", () => {
    expect(usd(47.3)).toBe("$47.30");
    expect(usd(20.86, true)).toBe("+$20.86");
    expect(usd(-4.39, true)).toBe("−$4.39");
    expect(usd(0, true)).toBe("$0.00");
    expect(usd(1184.5)).toBe("$1,184.50");
    expect(kwh(-26.2, true)).toBe("−26.2 kWh");
  });

  it("names months and short dates from ISO dates", () => {
    expect(month("2026-09-16")).toBe("September");
    expect(short("2026-04-10")).toBe("Apr 10");
  });

  it("turns the critic's USD amounts into dollars and a negative change into a drop", () => {
    expect(plainReason("12.60 USD of the 47.30 USD change is not explained, more than the 2.36 USD allowed")).toBe(
      "$12.60 of the $47.30 change is not explained, more than the $2.36 allowed",
    );
    expect(plainReason("16.49 USD of the -100.65 USD change")).toBe("$16.49 of the $100.65 drop");
    expect(plainReason("calibrated by -2.59 kWh per day")).toBe("calibrated by −2.59 kWh per day");
  });

  it("leaves the hyphens of dates alone", () => {
    expect(plainReason("NOAA has no weather for bill 2026-08-14 to 2026-09-16.")).toBe("NOAA has no weather for bill 2026-08-14 to 2026-09-16.");
  });

  it("escapes text before it goes into HTML", () => {
    expect(esc(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  });
});

describe("page view from the demo runs", () => {
  const page = pageView(payload);

  it("shows September as a $47.30 rise whose causes add up to the bill", () => {
    const { first } = page;
    expect(first.tabLabel).toBe("September bill");
    expect(first.from).toMatchObject({ label: "August bill", usd: 170.12, days: 29, kwh: 902 });
    expect(first.to).toMatchObject({ label: "September bill", usd: 217.42, days: 33, kwh: 1184 });
    const sum = first.causes.reduce((s, c) => s + c.usd, 0);
    expect(Math.round((first.from.usd + sum) * 100) / 100).toBe(first.to.usd);
    expect(first.causes.map((c) => c.agent)).toEqual(["RateAnalyst", "UsageAnalyst", "WeatherAnalyst", "UsageAnalyst", "ReconciliationCritic"]);
    expect(first.confidence).toEqual({ level: "LOW", reason: "Linda has fewer than 6 earlier bills, so the weather share uses Ohio averages, calibrated to the August bill." });
  });

  it("keeps the critic's rejection, who it went back to, and the re-issued pass", () => {
    const rejected = page.first.checks.filter((c) => !c.accepted);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ stamp: "void", sentBackTo: "UsageAnalyst", attempt: 1 });
    expect(page.first.checks.at(-1)).toMatchObject({ accepted: true, stamp: "valid", title: "The change adds up" });
    expect(page.first.allowedUsd).toBeCloseTo(2.365, 3);
  });

  it("with memory shows September's one-off and the note; without it, the same bill reads as using less", () => {
    const oneOff = page.withMemory.causes.find((c) => c.key === "one_off");
    expect(oneOff).toMatchObject({ usd: -30.83, title: "September's extra use did not repeat", agent: "HouseholdMemory" });
    expect(page.withMemory.note?.at).toBe("2026-09-22");
    expect(page.withoutMemory.causes.some((c) => c.key === "one_off")).toBe(false);
    expect(page.withoutMemory.causes.find((c) => c.key === "usage")?.usd).toBe(-28.08);
    expect(page.withoutMemory.note).toBeNull();
  });

  it("sends the page only the trace fields it shows, with no file paths", () => {
    const raw = JSON.stringify(payload);
    expect(raw).not.toMatch(/logFile|\.jsonl|samples\//);
    expect(page.first.evidence.weatherSql).toMatch(/household_pg\.bills b LEFT JOIN noaa_ncei\.cmh_daily/);
  });

  it("labels the closing coupon with RateAnalyst's recomputation, not the billed total", () => {
    expect(page.first.recomputedUsd).toBe(payload.runs[0].rate.estimate.charges.totalUsd);
  });

  it("works out the PIPP Plus preview from the household instead of fixed text", () => {
    const linda = actions(payload.household);
    expect(linda).toContain("Pay 5% of your income");
    expect(linda).toContain("about $100 a month");
    expect(linda).toContain("under the $27,930 limit");
    const over = actions({ ...payload.household, annualIncomeUsd: 40000 });
    expect(over).toContain("over the $27,930 limit");
    expect(over).not.toContain("a month");
    expect(actions({ ...payload.household, electricHeat: true })).toContain("about $200 a month");
  });

  it("says which way the reading without the note goes", () => {
    expect(memoryPanel(page, false)).toContain("as if you cut back by");
    expect(memoryPanel(page, true)).toContain("September&#39;s extra use did not repeat (−$30.83)");
  });

  it("reads checks from a trace in order and leaves accepted ones unstamped", () => {
    const checks = checksFromTrace([
      { agent: "ReconciliationCritic", step: "accepted", check: "freshness", accepted: true, reason: "ok", about: "inputs", attempt: 1 },
      { agent: "UsageAnalyst", step: "decomposition" },
    ]);
    expect(checks).toEqual([
      { accepted: true, title: "The data covers every day", text: "ok", about: "inputs", attempt: 1, stamp: null, sentBackTo: null },
    ]);
  });
});
