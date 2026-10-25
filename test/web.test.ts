import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DemoPayload } from "../src/demo.ts";
import { esc, kwh, month, plainCheck, plainReason, short, usd } from "../web/src/format.ts";
import { AGENT_NAMES, checksFromTrace, pageView, stripView } from "../web/src/model.ts";
import { actions, comparison, failure, friendlyError, memoryPanel, panel, parseHash, tabKey } from "../web/src/view.ts";

// The sample-mode answer of GET /api/demo, saved from the server on 24 Oct 2026, with the
// daily weather the page draws (read from the saved NOAA copy, as sample mode does).
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
    expect(first.causes.find((c) => c.key === "days")?.source).toBe("Bill dates read by Bill reader");
    expect(first.confidence).toEqual({
      level: "LOW",
      fitted: false,
      reason: "You have fewer than 6 earlier bills with us, so we compared your use with typical Ohio homes, adjusted to your August bill.",
    });
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

  it("shows the planner's actions with check 4's reasons, and memory changes them in October", () => {
    expect(page.first.actions.map((a) => [a.id, a.status])).toEqual([
      ["pipp_plus", "recommended"],
      ["heap", "rejected"],
      ["summer_crisis", "recommended"],
      ["winter_crisis", "rejected"],
      ["usage_note", "recommended"],
    ]);
    const html = actions(page.first, "2026-09-20");
    expect(html).toContain("about $100 a month");
    expect(html).toContain("instead of this bill&#39;s $217.42");
    expect(html).toContain("$24,000 a year is under the $27,930 limit for 1 person.");
    expect(html).toContain('href="tel:+18002820880"');
    expect(html).toContain("Not open yet: HEAP takes applications from Oct 1, 2026 to Apr 30, 2027.");
    expect(page.withMemory.actions.find((a) => a.id === "pipp_plus")?.status).toBe("already_taken");
    expect(page.withoutMemory.actions.find((a) => a.id === "pipp_plus")?.status).toBe("recommended");
    expect(page.first.checks.some((c) => c.title === "eligibility")).toBe(false);
  });

  it("shows a season that ended after the bill's date as closed today, with no call to action", () => {
    const html = actions(page.first, "2026-10-22");
    expect(html).toContain("Closed on Sep 30, 2026, so you cannot apply now; ask about next season.");
    expect(html).toContain("Checked against today&#39;s date, Oct 22, 2026.");
    expect(html).not.toContain("ask for Summer Crisis help");
    expect(actions(page.first, "2026-09-20")).toContain("ask for Summer Crisis help");
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
      { accepted: true, title: "The data covers every day", text: "ok", detail: "ok", about: "inputs", attempt: 1, stamp: null, sentBackTo: null },
    ]);
  });
});

describe("the weather strip", () => {
  const page = pageView(payload);

  it("draws every day of the two bills from the weather the server sent, split where this bill starts", () => {
    const strip = stripView(page.first, page.weather);
    expect(strip).not.toBeNull();
    if (!strip) return;
    expect(strip.days).toHaveLength(29 + 33);
    expect(strip.days[0].date).toBe("2026-07-16");
    expect(strip.days.at(-1)?.date).toBe("2026-09-15");
    expect(strip.days.findIndex((d) => d.bill === 1)).toBe(29);
    expect(strip.brackets.map((b) => [b.label, b.days, b.drawn])).toEqual([
      ["August bill", 29, 29],
      ["September bill", 33, 33],
    ]);
    expect(strip.brackets.map((b) => b.need)).toEqual(["Cooling need 10.2 degree days a day", "Cooling need 9.8 degree days a day"]);
  });

  it("finds the hottest day in the data rather than taking it from the page", () => {
    const inRange = page.weather.days.filter((d) => d.date >= "2026-07-16" && d.date < "2026-09-16");
    expect(stripView(page.first, page.weather)?.hottest?.tmaxF).toBe(Math.max(...inRange.map((d) => d.tmaxF)));
    const shifted = { ...page.weather, days: page.weather.days.map((d) => (d.date === "2026-08-01" ? { ...d, tmaxF: 120 } : d)) };
    expect(stripView(page.first, shifted)?.hottest).toMatchObject({ date: "2026-08-01", tmaxF: 120 });
  });

  it("marks the bill the note set apart only when the note is used", () => {
    const withNote = stripView(page.withMemory, page.weather);
    expect(withNote?.brackets.map((b) => b.noted)).toEqual([true, false]);
    expect(stripView(page.withoutMemory, page.weather)?.brackets.map((b) => b.noted)).toEqual([false, false]);
    expect(withNote?.brackets[1].need).toBe("Cooling need 2.7, heating need 2.9 degree days a day");
  });

  it("says on the page how the weather was read", () => {
    const html = panel(page, "first", true, "2026-10-24");
    const at = html.indexOf('<section class="sec evidence');
    // In plain words on the page; the station, Zetaris and sample mode wait in the evidence.
    expect(html.slice(0, at)).toContain("from the official daily weather records for Columbus airport");
    expect(html.slice(0, at)).not.toMatch(/USW00014821|Zetaris|sample mode|NOAA/);
    expect(html.slice(at)).toContain("a saved copy of the same Zetaris NOAA table");
    expect(html.slice(at)).toContain("read 92 days of weather, Jul 16, 2026 to Oct 15, 2026. The chart on this tab shows the 62 days of its two bills.");
    expect(html).toContain("Hottest day: Sep 3, 97°F.");
  });
});

describe("agent names on the page", () => {
  const page = pageView(payload);
  const CODE = /\b(BillReader|RateAnalyst|WeatherAnalyst|UsageAnalyst|ReconciliationCritic|HouseholdMemory|ActionPlanner)\b/;
  const views = [
    ["first", true],
    ["second", true],
    ["second", false],
  ] as const;

  it.each(views)("uses plain names outside the evidence and code names only inside it (%s tab, note %s)", (tab, on) => {
    const html = panel(page, tab, on, "2026-10-24");
    const at = html.indexOf('<section class="sec evidence');
    expect(at).toBeGreaterThan(0);
    const screen = html.slice(0, at);
    const evidence = html.slice(at);
    expect(screen).not.toMatch(CODE);
    for (const name of ["Bill reader", "Price check", "Weather check", "Usage math", "The checker"]) expect(screen).toContain(name);
    for (const [code, name] of Object.entries(AGENT_NAMES)) {
      expect(evidence).toContain(`<code translate="no">${code}</code>`);
      expect(evidence).toContain(name);
    }
  });

  it("names Your notes and Help finder where they did the work", () => {
    expect(panel(page, "second", true, "2026-10-24")).toContain("Your notes");
    expect(panel(page, "first", true, "2026-10-24")).toContain("Looked at by help finder for this bill, Sep 16, 2026.");
    expect(panel(page, "second", true, "2026-10-24")).toContain("<b>Your notes</b>: what you told us on Sep 25, 2026.");
    expect(panel(page, "second", true, "2026-10-24")).not.toContain("Checked by <b>Your notes</b>");
  });

  it("says the checker sent the first answer back to Usage math, and labels the passes", () => {
    const html = panel(page, "first", true, "2026-10-24");
    expect(html).toContain("We double-checked this. The first try left $12.60 unexplained, so Usage math worked it out again.");
    expect(html).toContain('href="#september-check-4"');
    expect(html).toContain('id="september-check-4"');
    expect(html).toContain("Sent back to Usage math to try again");
    expect(html).toContain("Second pass, after Usage math tried again");
    expect(html).not.toMatch(/VOID|VALIDATED/);
  });

  it("states that the running-total bars do not start at zero", () => {
    const html = panel(page, "first", true, "2026-10-24");
    expect(html).toContain("The running-total bars go from $165 on the left to $220 on the right, not from $0");
    expect(html).toContain("Running total, from $165 to $220");
  });
});

describe("round 2: amounts, dates, errors and the address bar", () => {
  const page = pageView(payload);
  const between = (html: string, from: string, to: string): string => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));

  it("A1: shows HEAP's reduced range as the big figure once PIPP Plus was applied for, in the same format as its text", () => {
    const html = actions(page.withMemory, "2026-10-24");
    const card = between(html, "ph-flame", "</article>");
    expect(card).toContain('<span class="v num">$8 to $137</span>');
    expect(card).toContain("once, for the heating season, once PIPP Plus is approved");
    expect(card).toContain("$8 to $137 instead of $31 to $546");
    expect(card).not.toContain("$8.00");
    // Without the note PIPP Plus was not applied for, so the full range applies.
    expect(actions(page.withoutMemory, "2026-10-24")).toContain(">$31 to $546</span>");
  });

  it("A2: every program row says the date it was checked against, and none says open and closed at once", () => {
    const html = actions(page.first, "2026-10-24");
    const rows = html.split("<li>").slice(1);
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row).toMatch(/<small>[^<]*(at this bill&#39;s date, Sep 16, 2026|today&#39;s date, Oct 24, 2026|for this bill, Sep 16, 2026)[^<]*\.<\/small>/);
    const heap = rows.find((r) => r.includes("<b>HEAP"));
    expect(heap).toContain("HEAP (Home Energy Assistance Program)");
    expect(heap).toContain("Opened on Oct 1, 2026, after this bill&#39;s date, and takes applications until Apr 30, 2027.");
    expect(heap).not.toContain("Not open yet");
    const summer = rows.find((r) => r.includes("Summer Crisis"));
    expect(summer).not.toMatch(/was open|is open/);
    const winter = rows.find((r) => r.includes("Winter Crisis"));
    expect(winter).toContain("still not open today, Oct 24, 2026");
    expect(html).toContain("Checked at this bill's date, Sep 16, 2026, and against today's date, Oct 24, 2026");
    // Before HEAP opened, the checker's own reason stands, and the row says it is still not open.
    const early = actions(page.first, "2026-09-20");
    expect(early).toContain("Not open yet: HEAP takes applications from Oct 1, 2026 to Apr 30, 2027.");
    expect(early).toContain("still not open today, Sep 20, 2026");
  });

  it("A3: the error state shows friendly words only, never the browser's or the server's message", () => {
    const network = friendlyError(new TypeError("Failed to fetch"));
    expect(network).toBe("We could not reach Why So High. Check your internet connection and try again.");
    const server = friendlyError(new Error("npm run serve crashed: ECONNREFUSED"));
    expect(server).toBe("Something went wrong on our side. Please try again in a minute.");
    for (const html of [failure(network), failure(server)]) {
      expect(html).not.toMatch(/Failed to fetch|npm|ECONNREFUSED/);
      expect(html).toContain('id="retry"');
      expect(html).toContain('role="alert"');
    }
  });

  it("keeps the bill in the address bar: #september, #october and #october-check-4", () => {
    const keys = { first: tabKey(page.first), second: tabKey(page.withMemory) };
    expect(keys).toEqual({ first: "september", second: "october" });
    expect(parseHash("#october", keys)).toEqual({ tab: "second", check: null });
    expect(parseHash("#october-check-4", keys)).toEqual({ tab: "second", check: 4 });
    expect(parseHash("#september", keys)).toEqual({ tab: "first", check: null });
    expect(parseHash("#check-4", keys)).toEqual({ tab: null, check: null });
    expect(parseHash("#march", keys)).toEqual({ tab: null, check: null });
    expect(parseHash("", keys)).toEqual({ tab: null, check: null });
    expect(panel(page, "second", true, "2026-10-24")).toContain('href="#october-check-4"');
  });

  it("explains on the page what the switch covers and why the days row moves", () => {
    const off = memoryPanel(page, false);
    expect(off).toContain("Turning this off reads the bill as if you had told us nothing: all 2 notes are left out, so PIPP Plus is suggested again.");
    expect(off).toContain("I applied for PIPP Plus on September 25.");
    expect(comparison(page, true)).toContain("your note makes your August bill the normal month instead of your September bill");
    expect(comparison(page, true)).toContain("Both readings end at $116.77, this bill's total.");
  });

  it("puts the checker's plain words on the page and its own words in the evidence", () => {
    expect(plainCheck("Published tariff gives $217.42, billed $217.42 (0.0% apart).")).toBe(
      "AEP Ohio's price list gives $217.42 for this use, and the bill says $217.42 (0.0% apart).",
    );
    const html = panel(page, "first", true, "2026-10-24");
    const at = html.indexOf('<section class="sec evidence');
    expect(html.slice(0, at)).toContain("your home uses about 13.3 kWh a day for things that do not depend on the weather");
    expect(html.slice(0, at)).not.toContain("Ohio-average model");
    expect(html.slice(at)).toContain("The Ohio-average model, calibrated by −2.59 kWh per day");
  });

  it("offers a note field that says plainly nothing is saved", () => {
    const html = actions(page.first, "2026-10-24", "October bill");
    expect(html).toContain('id="noteOpen"');
    expect(html).toContain('<textarea id="noteText"');
    expect(html).toContain("This demo does not save notes, so your next bill will not use what you write here. To see a note at work, open the October bill.");
  });
});
