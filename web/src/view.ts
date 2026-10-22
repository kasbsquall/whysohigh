// HTML for each part of the page, from the view model. Text from the server is escaped.

import { esc, kwh, short, usd } from "./format.ts";
import type { DemoRules, Household } from "../../src/demo.ts";
import type { BillEnd, CauseView, CheckView, Evidence, PageView, RunView } from "./model.ts";

const icon = (name: string): string => `<i class="ph-light ph-${name}" aria-hidden="true"></i>`;

const CAUSE_ICONS: Readonly<Record<CauseView["key"], string>> = {
  price: "tag",
  one_off: "notebook",
  days: "calendar-dots",
  weather: "thermometer-simple",
  usage: "plug",
  unexplained: "question",
};

const range = (b: BillEnd): string =>
  b.start ? `${short(b.start)} to ${short(b.end)}, ${b.days} days, ${kwh(b.kwh)}` : `${b.days} days, ${kwh(b.kwh)}`;

/** One line under the headline so the critic's rejection is seen without scrolling to it. */
function criticNote(run: RunView): string {
  const i = run.checks.findIndex((c) => !c.accepted);
  if (i < 0) return "";
  const c = run.checks[i];
  const back = c.sentBackTo ? ` and sent it back to ${esc(c.sentBackTo)}` : "";
  return `<a class="critic-note" href="#check-${i + 1}">${icon("x-circle")}<span>ReconciliationCritic rejected the first answer${back}. See check ${i + 1}.</span></a>`;
}

export function cover(run: RunView): string {
  const up = run.changeUsd > 0;
  const side = run.confidence
    ? `<div class="conf">
        <div class="ttl">${icon("gauge")}How sure we are <span class="lvl">${esc(run.confidence.level)}</span></div>
        <p>${esc(run.confidence.reason)}</p>
      </div>`
    : "";
  return `
    <div class="route">
      <div>
        <div class="legs">
          <div class="leg"><span class="lbl">FROM</span><span class="fig num">${usd(run.from.usd)}</span><span class="when">${esc(run.from.label)}, ${esc(range(run.from))}</span></div>
          ${icon("airplane-tilt").replace('class="', 'class="leg-arrow ')}
          <div class="leg"><span class="lbl">TO</span><span class="fig num">${usd(run.to.usd)}</span><span class="when">${esc(run.to.label)}, ${esc(range(run.to))}</span></div>
        </div>
        <h1 class="headline">Your bill went ${up ? "up" : "down"}&nbsp;<span class="chg num${up ? "" : " down"}">${icon(up ? "arrow-up" : "arrow-down")}${usd(Math.abs(run.changeUsd))}</span><span class="why">Here is why.</span></h1>
        ${criticNote(run)}
      </div>
      ${side}
    </div>`;
}

function coupon(c: CauseView, i: number): string {
  const tone = c.usd > 0 ? "up" : c.usd < 0 ? "dn" : "zero";
  const verb = c.usd > 0 ? "Added" : c.usd < 0 ? "Took off" : c.key === "unexplained" ? "Nothing left" : "No change";
  const bar =
    c.key === "unexplained" || c.key === "price"
      ? ""
      : `<div class="bar ${tone}" aria-hidden="true"><i style="--w:${Math.max(c.share, 0.01).toFixed(3)};--i:${i}"></i></div>`;
  return `
    <li class="${c.key === "one_off" ? "mem" : ""}" style="--i:${Math.min(i, 7)}">
      <div class="coupon">
        <div class="c-main ${tone}">
          <span class="c-ico">${icon(CAUSE_ICONS[c.key])}</span>
          <div class="c-txt"><h3>${esc(c.title)}</h3><p>${esc(c.detail)}</p></div>
          <div class="c-amt"><span class="usd num">${usd(c.usd, true)}</span>${c.kwh === null ? "" : `<span class="kwh num">${kwh(c.kwh, true)}</span>`}<span class="dir">${verb}</span></div>
          ${bar}
        </div>
        <div class="c-stub"><span class="k">${esc(c.role)}</span><span class="who" translate="no">${esc(c.agent)}</span><span class="src">${esc(c.source)}</span></div>
      </div>
    </li>`;
}

function billCoupon(b: BillEnd, role: string, i: number): string {
  return `
    <li class="bill" style="--i:${i}">
      <div class="coupon">
        <div class="c-main">
          <span class="c-ico">${icon("receipt")}</span>
          <div class="c-txt"><h3>${esc(b.label)}</h3><p>${esc(range(b))}</p></div>
          <div class="c-amt"><span class="usd num">${usd(b.usd)}</span></div>
        </div>
        <div class="c-stub"><span class="k">READ BY</span><span class="who" translate="no">BillReader</span><span class="src">${esc(role)}</span></div>
      </div>
    </li>`;
}

export function trip(run: RunView): string {
  if (run.skipped) {
    return `<p class="notice">${icon("warning")}The agents could not split this change: ${esc(run.skipped)}</p>`;
  }
  const n = run.causes.length;
  return `
    <ol class="trip">
      ${billCoupon(run.from, "From the last bill", 0)}
      ${run.causes.map((c, i) => coupon(c, i + 1)).join("")}
      ${billCoupon(run.to, `Recomputed from the tariff: ${usd(run.recomputedUsd)}`, Math.min(n + 1, 7))}
    </ol>`;
}

function check(c: CheckView, i: number): string {
  const stamp =
    c.stamp === "void"
      ? `<span class="stamp void" aria-hidden="true">VOID</span>`
      : c.stamp === "valid"
        ? `<span class="stamp valid" aria-hidden="true"><small>RE-ISSUED</small>VALIDATED</span>`
        : "";
  const status = c.accepted ? `Accepted${c.attempt > 1 ? ", second pass" : ""}` : `Rejected${c.attempt === 1 ? ", first pass" : ""}`;
  return `
    <li class="check ${c.accepted ? "ok" : "bad"}${c.stamp === "valid" ? " good" : ""}" id="check-${i + 1}" tabindex="-1" style="--i:${Math.min(i, 7)}">
      <span class="n num">${i + 1}</span>
      <span class="st">${icon(c.accepted ? "seal-check" : "x-circle")}${status}</span>
      <h3 class="ck">${esc(c.title)}</h3>
      <p>${esc(c.text)}</p>
      ${c.sentBackTo ? `<span class="sentback">${icon("arrow-bend-up-left")}Sent back to ${esc(c.sentBackTo)} to try again</span>` : ""}
      ${stamp}
    </li>`;
}

export function checks(run: RunView): string {
  return `<ol class="checks">${run.checks.map(check).join("")}</ol>`;
}

export function rulesLine(run: RunView, rules: DemoRules): string {
  const pct = (n: number): string => `${Math.round(n * 100)}%`;
  return run.allowedUsd === null
    ? ""
    : `<p class="rule">${icon("ruler")}The critic accepts a bill recomputed within ${pct(rules.recomputeTolerance)} of the billed total, and a change that leaves no more than ${usd(run.allowedUsd)} unexplained (${pct(rules.closureShare)} of the change, at least ${usd(rules.closureFloorUsd)}).</p>`;
}

export function evidence(e: Evidence): string {
  const block = (title: string, ico: string, body: string): string => `
    <details class="ev">
      <summary>${icon(ico)}${title}${icon("caret-down").replace('class="', 'class="chev ')}</summary>
      <div class="ev-body">${body}</div>
    </details>`;
  return [
    e.weatherSql
      ? block(
          "Your bills joined with Columbus weather",
          "database",
          `<p>One federated SQL query in Zetaris joins <code translate="no">household_pg.bills</code> with NOAA's daily weather for station USW00014821.</p><pre><code translate="no">${esc(e.weatherSql)}</code></pre>`,
        )
      : "",
    e.tariff
      ? block(
          "The tariff used to recompute your bill",
          "file-text",
          `<p>${esc(e.tariff.name)}, in force since ${esc(short(e.tariff.start))}. OpenEI URDB rate <code translate="no">${esc(e.tariff.label)}</code>.</p>
           <p><a href="https://apps.openei.org/USURDB/rate/view/${encodeURIComponent(e.tariff.label)}" target="_blank" rel="noopener noreferrer">Open the published tariff${icon("arrow-square-out")}</a></p>`,
        )
      : "",
    block(
      "This run",
      "path",
      `<p>Run <code translate="no">${esc(e.runId)}</code>. ${e.sampleMode ? "Replayed from responses recorded in a live run (sample mode)." : "Live run against Zetaris and Nightshift."}</p>
       ${e.billModel ? `<p>Bill read by <code translate="no">${esc(e.billModel)}</code> through Meterless Nightshift.</p>` : ""}`,
    ),
  ].join("");
}

// Ohio's income limit for HEAP and PIPP Plus, 175% of the federal poverty guidelines, by household size.
// ODJFS table for Jul 2026 to May 2027, read 22 Oct 2026 (docs/11-ohio-y-piezas.md).
const INCOME_LIMIT_USD: Readonly<Record<number, number>> = { 1: 27930, 2: 37870, 3: 47810, 4: 57750, 5: 67690, 6: 77630, 7: 87570 };
// PIPP Plus share of gross income paid to the electric company: 5% with gas heat, 10% with electric heat (same source).
const pippShare = (electricHeat: boolean): number => (electricHeat ? 0.1 : 0.05);

export function actions(h: Household): string {
  const limit = INCOME_LIMIT_USD[h.householdSize];
  const share = pippShare(h.electricHeat);
  const people = h.householdSize === 1 ? "one person" : `${h.householdSize} people`;
  const under = limit === undefined ? "" : h.annualIncomeUsd <= limit ? ` (under the ${usd(limit).replace(".00", "")} limit)` : "";
  const pipp =
    limit !== undefined && h.annualIncomeUsd > limit
      ? `<p>At ${usd(h.annualIncomeUsd).replace(".00", "")} a year for ${people}, the household is over the ${usd(limit).replace(".00", "")} limit.</p>`
      : `<p>Pay ${Math.round(share * 100)}% of your income instead of the full bill. At ${usd(h.annualIncomeUsd).replace(".00", "")} a year for ${people}${under}:</p>
        <span class="amt num">about ${usd(Math.round((h.annualIncomeUsd * share) / 12)).replace(".00", "")} a month</span>
        <p>Each on-time payment forgives 1/24 of your past-due balance.</p>`;
  return `
    <div class="area-h">
      <h2>Help you could ask for</h2>
      <span class="preview">${icon("eye")}Preview, amounts to be confirmed</span>
    </div>
    <div class="acts">
      <article class="act">
        <h3>${icon("hand-coins")}PIPP Plus</h3>
        <span class="full">Percentage of Income Payment Plan</span>
        ${pipp}
        <div class="act-stub"><span class="k">SOURCE</span><a class="src-link" href="https://jfs.ohio.gov/public-assistance/energy-and-community-assistance/percentage-of-income-payment-plan-pipp" target="_blank" rel="noopener noreferrer">Ohio JFS, PIPP Plus${icon("arrow-square-out")}</a></div>
      </article>
      <article class="act">
        <h3>${icon("flame")}HEAP</h3>
        <span class="full">Home Energy Assistance Program</span>
        <p>A one-time credit on your bill for the heating season, Oct 1, 2026 to Apr 30, 2027:</p>
        <span class="amt num">$31 to $546</span>
        <div class="act-stub"><span class="k">SOURCE</span><a class="src-link" href="https://development.ohio.gov/individual/energy-assistance" target="_blank" rel="noopener noreferrer">Ohio energy assistance${icon("arrow-square-out")}</a></div>
      </article>
    </div>`;
}

const lowerFirst = (t: string): string => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const listOf = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

export function memoryPanel(page: PageView, on: boolean): string {
  const note = page.withMemory.note;
  if (!note) return "";
  const withUsage = page.withMemory.causes.find((c) => c.key === "usage");
  const withoutUsage = page.withoutMemory.causes.find((c) => c.key === "usage");
  const others = page.withMemory.causes
    .filter((c) => c.key !== "usage" && c.key !== "unexplained" && Math.abs(c.usd) >= 1)
    .sort((x, y) => Math.abs(y.usd) - Math.abs(x.usd))
    .map((c) => `${c.key === "one_off" ? c.title : lowerFirst(c.title)} (${usd(c.usd, true)})`);
  const unusual = esc(page.withMemory.from.label.replace(" bill", ""));
  const without = !withoutUsage
    ? "The same bill has no usage figure without the note."
    : withoutUsage.usd < 0
      ? `The same bill reads as if you cut back by <span class="nb">${usd(Math.abs(withoutUsage.usd))}</span>.`
      : `The same bill reads as if you used <span class="nb">${usd(withoutUsage.usd)}</span> more.`;
  const reading = on
    ? `<div class="reading right">${icon("seal-check")}<span><span class="tag">With the note</span>Your own use changed by <span class="nb">${withUsage ? usd(withUsage.usd, true) : "nothing"}</span>.<span class="sub">${others.length ? `The change comes from ${esc(listOf(others))}.` : ""}</span></span></div>`
    : `<div class="reading wrong">${icon("warning")}<span><span class="tag">Without the note</span>${without}<span class="sub">Your note says ${unusual} was not a normal month, and this reading leaves that out.</span></span></div>`;
  return `
    <div class="memo">
      ${icon("notebook")}
      <span class="k">What ${esc(page.household.name)} told HouseholdMemory on ${esc(short(note.at))}</span>
      <blockquote>“${esc(note.text)}”</blockquote>
    </div>
    <div class="switchrow">
      <button class="switch" id="memSwitch" role="switch" aria-checked="${on}">
        <span class="track" aria-hidden="true"><span class="knob"></span></span>
        Use what ${esc(page.household.name)} told us
        <span class="state">${on ? "On" : "Off"}</span>
      </button>
    </div>
    ${reading}`;
}

export function comparison(page: PageView): string {
  const keys = [...new Set([...page.withMemory.causes, ...page.withoutMemory.causes].map((c) => c.key))];
  const cell = (run: RunView, key: CauseView["key"]): string => {
    const c = run.causes.find((x) => x.key === key);
    if (!c) return `<td class="ns">Not shown</td>`;
    return `<td class="num">${usd(c.usd, true)}${c.kwh === null ? "" : `<small>${kwh(c.kwh, true)}</small>`}</td>`;
  };
  const differs = (key: CauseView["key"]): boolean => {
    const a = page.withMemory.causes.find((x) => x.key === key)?.usd;
    const b = page.withoutMemory.causes.find((x) => x.key === key)?.usd;
    return a !== b;
  };
  const title = (key: CauseView["key"]): string =>
    (page.withMemory.causes.find((x) => x.key === key) ?? page.withoutMemory.causes.find((x) => x.key === key))?.title ?? key;
  return `
    <table class="cmp">
      <caption>Same bill, with and without the note</caption>
      <thead><tr><th scope="col">Cause</th><th scope="col">With the note</th><th scope="col">Without it</th></tr></thead>
      <tbody>
        ${keys
          .map(
            (k) =>
              `<tr class="${differs(k) ? "diff" : ""}"><th scope="row">${esc(k === "usage" ? "Your own use" : title(k))}</th>${cell(page.withMemory, k)}${cell(page.withoutMemory, k)}</tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <p class="cmp-note">Shaded rows change when the note is used. Both readings close to ${usd(page.withMemory.to.usd)}.</p>`;
}

export function skeleton(): string {
  const row = (i: number): string => `<li style="--i:${i}"><div class="coupon sk"><div class="sk-line w60"></div><div class="sk-line w30"></div></div></li>`;
  return `
    <div class="loading" role="status">
      <p class="loading-msg">${icon("airplane-tilt")}The agents are reading the bill and checking each cause.</p>
      <ol class="trip">${[0, 1, 2, 3, 4].map(row).join("")}</ol>
    </div>`;
}

export function failure(message: string): string {
  return `
    <div class="failure" role="alert">
      <h2>${icon("warning")}This bill could not be explained right now</h2>
      <p>${esc(message)}</p>
      <button class="btn" id="retry">${icon("arrow-clockwise")}Try again</button>
    </div>`;
}
