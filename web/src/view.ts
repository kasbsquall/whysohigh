// HTML for each part of the page, from the view model. Text from the server is escaped.
// Agents carry their plain names here; their names in the code appear only in the evidence.

import { day, esc, kwh, month, short, usd } from "./format.ts";
import type { DemoRules } from "../../src/demo.ts";
import type { DemoWeather } from "../../src/demoWeather.ts";
import {
  AGENT_JOBS,
  AGENT_NAMES,
  agentName,
  stripView,
  type ActionView,
  type BillEnd,
  type CauseView,
  type CheckView,
  type Evidence,
  type PageView,
  type RunView,
  type StripView,
} from "./model.ts";

export type Tab = "first" | "second";

const icon = (name: string, cls = ""): string => `<i class="ph-light ph-${name}${cls ? ` ${cls}` : ""}" aria-hidden="true"></i>`;
const NEW_TAB = `<span class="sr-only"> (opens in a new tab)</span>`;

const AGENT_ICONS: Readonly<Record<string, string>> = {
  BillReader: "scan",
  RateAnalyst: "receipt",
  WeatherAnalyst: "cloud-sun",
  UsageAnalyst: "calculator",
  ReconciliationCritic: "list-checks",
  HouseholdMemory: "notebook",
  ActionPlanner: "hand-heart",
};

const CAUSE_ICONS: Readonly<Record<CauseView["key"], string>> = {
  price: "tag",
  one_off: "notebook",
  days: "calendar-dots",
  weather: "thermometer-simple",
  usage: "plug",
  unexplained: "question",
};

/** Whole dollars without cents, cents otherwise: "$8", "$2.36". */
const money = (n: number): string => (Number.isInteger(n) ? usd(n).replace(/\.00$/, "") : usd(n));

const range = (b: BillEnd): string =>
  b.start ? `${short(b.start)} to ${short(b.end)}, ${b.days} days, ${kwh(b.kwh)}` : `${b.days} days, ${kwh(b.kwh)}`;

// ---------- Tabs and the address bar ----------

/** The word a tab uses in the address bar: the bill's month, "september". */
export const tabKey = (run: RunView): string => month(run.to.end).toLowerCase();

/** The dates a bill covers, for the tab. */
export const tabWhen = (run: RunView): string => (run.to.start ? `${short(run.to.start)} to ${short(run.to.end)}` : "");

/** Reads "#october" or "#october-check-4" into a tab and a check number; anything else picks nothing. */
export function parseHash(hash: string, keys: Readonly<Record<Tab, string>>): { tab: Tab | null; check: number | null } {
  const m = /^#([a-z]+)(?:-check-(\d+))?$/.exec(hash);
  if (!m) return { tab: null, check: null };
  const tab = (Object.keys(keys) as Tab[]).find((t) => keys[t] === m[1]) ?? null;
  return { tab, check: tab && m[2] ? Number(m[2]) : null };
}

// ---------- Lead ----------

function who(code: string, source: string): string {
  return `<div class="who"><b>${icon(AGENT_ICONS[code] ?? "user")}${esc(agentName(code))}</b>${source ? `<span>${esc(source)}</span>` : ""}</div>`;
}

/** One calm line under the headline: the answer was checked twice, and why. */
function doubleChecked(run: RunView, key: string): string {
  const i = run.checks.findIndex((c) => !c.accepted);
  if (i < 0) return "";
  const c = run.checks[i];
  const left = /^(\$[\d,]+\.\d{2}) of the /.exec(c.text)?.[1];
  const redo = c.sentBackTo ? `, so ${esc(agentName(c.sentBackTo))} worked it out again` : ", so it was worked out again";
  const why = left ? `The first try left ${left} unexplained${redo}.` : `The first try did not add up${redo}.`;
  return `<p class="notice">${icon("seal-check")}<span>We double-checked this. ${why} <a href="#${key}-check-${i + 1}">See check ${i + 1}</a>.</span></p>`;
}

function lead(run: RunView, rules: DemoRules, key: string): string {
  const dir = run.changeUsd < 0 ? "down" : "up";
  const conf = run.confidence;
  const meter = conf
    ? `<aside class="confidence block" style="--b:1" aria-labelledby="conf-h">
        <h2 id="conf-h">${icon("gauge")}How sure we are</h2>
        <div class="meter" aria-hidden="true"><span class="on"></span><span${conf.fitted ? ' class="on"' : ""}></span></div>
        <p class="meter-labels"><span${conf.fitted ? "" : ' class="is"'}>Low</span><span${conf.fitted ? ' class="is"' : ""}>Higher, from your own bills</span></p>
        <p class="conf-why">${esc(conf.reason)}</p>
        ${conf.fitted ? "" : `<p class="conf-rule">It goes higher once we have ${rules.minBillsToFit} of your earlier bills to learn from.</p>`}
      </aside>`
    : "";
  const bill = (b: BillEnd, cls: string): string =>
    `<div class="bill-line ${cls}"><dt><b>${esc(b.label)}</b><span>${esc(range(b))}</span></dt><dd class="amt num">${usd(b.usd)}</dd></div>`;
  return `
    <div class="lead">
      <div class="lead-main block" style="--b:0">
        <h1 class="headline" tabindex="-1"><span class="hl-line">Your bill went ${dir}</span>
          <span class="big ${dir}">${icon(dir === "up" ? "arrow-up" : "arrow-down", "dir")}<span class="num">${usd(Math.abs(run.changeUsd))}</span></span></h1>
        <div class="bills-wrap">
          <dl class="bills">${bill(run.from, "then")}${bill(run.to, "now")}</dl>
          <p class="unit-note">kWh means kilowatt-hours, the unit your meter counts.</p>
        </div>
        <div class="why-row"><p class="why">Here is why.</p>${doubleChecked(run, key)}</div>
      </div>
      ${meter}
    </div>`;
}

// ---------- Weather chart ----------

const TEMP_STEPS: readonly (readonly [number, string])[] = [
  [60, "under 60"],
  [65, "60 to 65"],
  [70, "65 to 70"],
  [75, "70 to 75"],
  [80, "75 to 80"],
  [Infinity, "80 and up"],
];

const tempStep = (meanF: number): number => TEMP_STEPS.findIndex(([limit]) => meanF < limit) + 1;
const pct = (n: number): string => `${n.toFixed(2)}%`;

/** What the chart's readout says before anyone picks a day. */
export const stripHint = (s: StripView | null, touch: boolean): string => {
  const how = touch ? "Tap a day for its high and low." : "Point at a day for its high and low.";
  return s?.hottest ? `Hottest day: ${short(s.hottest.date)}, ${s.hottest.tmaxF}°F. ${how}` : how;
};

/** The compact weather chart under the headline, with its reading guide one click away. */
export function strip(run: RunView, weather: DemoWeather, more: boolean): string {
  const s = stripView(run, weather);
  if (!s) return "";
  const n = s.days.length;
  const y = (t: number): number => ((t - s.lowF) / (s.highF - s.lowF)) * 100;
  const split = s.days.findIndex((d) => d.bill === 1);
  const at = split < 0 ? n : split;
  const hasBase = 65 > s.lowF && 65 < s.highF;
  const axis = [
    `<span style="bottom:100%">${s.highF}°F</span>`,
    hasBase ? `<span class="y65" style="bottom:${pct(y(65))}">65°F</span>` : "",
    `<span style="bottom:0%">${s.lowF}°F</span>`,
  ].join("");
  const hot = s.hottest;
  const bars = s.days
    .map(
      (d, i) =>
        `<span class="day${d === hot ? " hot" : ""}" data-date="${d.date}" data-hi="${d.tmaxF}" data-lo="${d.tminF}" data-bill="${esc(s.brackets[d.bill].label)}"><span class="bar t${tempStep(d.meanF)}" style="--i:${i};bottom:${pct(y(d.tminF))};height:${pct(Math.max(y(d.tmaxF) - y(d.tminF), 2))}"></span></span>`,
    )
    .join("");
  const noted = s.brackets.findIndex((b) => b.noted);
  const notedBand =
    noted >= 0 ? `<div class="noted-band" style="left:${pct(noted === 0 ? 0 : (at / n) * 100)};width:${pct(((noted === 0 ? at : n - at) / n) * 100)}"></div>` : "";
  const first = s.days[0];
  const last = s.days[n - 1];
  const legend = TEMP_STEPS.map(([, label], i) => `<li><span class="sw t${i + 1}"></span>${label}</li>`).join("");
  const needs = s.brackets
    .map(
      (b) =>
        `<li><b>${esc(b.label)}</b>, ${esc(short(b.start))} to ${esc(short(b.end))}, ${b.days} days${b.drawn < b.days ? ` (${b.drawn} with readings)` : ""}.${b.need ? ` ${esc(b.need)}.` : ""}${b.noted ? ` Not a normal month, from your note.` : ""}</li>`,
    )
    .join("");
  return `
    <section class="strip block" style="--b:2" id="strip" aria-labelledby="strip-h">
      <div class="strip-head">
        <h2 id="strip-h">${icon("cloud-sun")}Columbus weather, day by day</h2>
        <p class="readout" id="readout">${esc(stripHint(s, false))}</p>
        <div class="strip-tools">
          <span class="mini-scale" aria-hidden="true"><span>cooler</span><span class="sw t1"></span><span class="sw t2"></span><span class="sw t3"></span><span class="sw t4"></span><span class="sw t5"></span><span class="sw t6"></span><span>hotter</span></span>
          <button type="button" class="clear-btn" id="clearShade" hidden>${icon("x")}Clear the shading</button>
          <button type="button" class="more-btn" id="stripMore" aria-expanded="${more}" aria-controls="strip-more">${icon("info")}How to read this chart</button>
        </div>
      </div>
      <div class="plot-wrap">
        <div class="yaxis" aria-hidden="true">${axis}</div>
        <div class="plot" role="slider" tabindex="0" aria-label="Daily temperatures in Columbus, ${esc(short(first.date))} to ${esc(short(last.date))}, ${first.date.slice(0, 4)}. Each bar runs from the day's low to its high." aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="1" aria-valuetext="${esc(stripHint(s, false))}">
          ${notedBand}
          <div class="band" style="left:0;width:${pct((at / n) * 100)}"></div>
          <div class="band" style="left:${pct((at / n) * 100)};right:0"></div>
          ${hasBase ? `<div class="base-line" style="bottom:${pct(y(65))}"></div>` : ""}
          <div class="days">${bars}</div>
        </div>
      </div>
      <div class="brackets" style="grid-template-columns:${at}fr ${n - at}fr">${s.brackets
        .map((b) => `<p class="bracket${b.noted ? " noted" : ""}"><b>${esc(b.label)}</b> <span>${esc(short(b.start))} to ${esc(short(b.end))}</span>${b.noted ? `<span class="nb-note">, not a normal month</span>` : ""}</p>`)
        .join("")}</div>
      <div class="strip-more" id="strip-more"${more ? "" : " hidden"}>
        <div class="legend"><p>Bar color is the day's average temperature, in °F:</p><ol>${legend}</ol></div>
        <p>${hasBase ? "The dashed line is 65°F, the base for degree days. " : ""}A degree day measures how much heating or cooling a day needs: a day averaging 75°F has 10 cooling degree days.</p>
        <ul class="needs">${needs}</ul>
        <p class="strip-foot">${icon(AGENT_ICONS.WeatherAnalyst)}<span><b>${esc(agentName("WeatherAnalyst"))}</b>, from the official daily weather records for Columbus airport. Where they come from is under “Where the numbers come from”.</span></p>
      </div>
    </section>`;
}

// ---------- Cascade ----------

interface Scale {
  readonly lo: number;
  readonly hi: number;
  readonly x: (usd: number) => number;
}

/** Running-total axis on whole $5 steps around the bills. */
function bridgeScale(run: RunView): Scale {
  const totals = [run.from.usd];
  for (const c of run.causes) totals.push(Math.round((totals[totals.length - 1] + c.usd) * 100) / 100);
  totals.push(run.to.usd);
  const lo = Math.floor((Math.min(...totals) - 1) / 5) * 5;
  const hi = Math.ceil((Math.max(...totals) + 1) / 5) * 5;
  return { lo, hi, x: (t) => ((t - lo) / (hi - lo)) * 100 };
}

function billRow(b: BillEnd, note: string, label: string, scale: Scale, i: number): string {
  return `
    <tr class="billrow row-in" style="--i:${i}">
      <td class="c-cause"><div class="cause">${icon("file-text")}<div><h3>${esc(b.label)}</h3><p>${esc(range(b))}</p>${who("BillReader", note)}</div></div></td>
      <td class="amount"><span class="usd num">${usd(b.usd)}</span><span class="eff">${esc(label)}</span></td>
      <td class="c-bridge"><div class="bridge" aria-hidden="true"><span class="mark" style="left:${pct(scale.x(b.usd))}"></span></div></td>
    </tr>`;
}

function causeRow(c: CauseView, before: number, after: number, scale: Scale, i: number): string {
  const tone = c.usd > 0 ? "up" : c.usd < 0 ? "down" : "zero";
  const verb = c.usd > 0 ? "Added" : c.usd < 0 ? "Took off" : c.key === "unexplained" ? "Nothing left" : "No change";
  const eff = c.usd > 0 ? "arrow-up" : c.usd < 0 ? "arrow-down" : "equals";
  const left = scale.x(Math.min(before, after));
  const width = Math.abs(scale.x(after) - scale.x(before));
  const seg =
    tone === "zero"
      ? `<span class="seg zero" style="left:${pct(scale.x(after))}"></span>`
      : `<span class="seg ${tone}" style="left:${pct(left)};width:${pct(width)};--i:${i}"></span>`;
  const weatherBtn =
    c.key === "weather"
      ? `<button type="button" class="weather-btn" aria-pressed="false" aria-controls="strip">${icon("chart-bar")}Shade both bills on the weather chart</button>`
      : "";
  return `
    <tr class="row-in${c.key === "weather" ? " is-weather-row" : ""}" style="--i:${Math.min(i, 7)}">
      <td class="c-cause"><div class="cause">${icon(CAUSE_ICONS[c.key])}<div><h3>${esc(c.title)}</h3><p>${esc(c.detail)}</p>${who(c.agent, c.source)}${weatherBtn}</div></div></td>
      <td class="amount ${tone}"><span class="usd num">${usd(c.usd, true)}</span>${c.kwh === null ? "" : `<span class="kwh num">${kwh(c.kwh, true)}</span>`}<span class="eff">${icon(eff)}${verb}</span></td>
      <td class="c-bridge"><div class="bridge" aria-hidden="true">${seg}</div></td>
    </tr>`;
}

export function cascade(run: RunView): string {
  if (run.skipped) {
    return `<p class="notice plain">${icon("warning")}<span>We could not split this change: ${esc(run.skipped)}</span></p>`;
  }
  const scale = bridgeScale(run);
  let total = run.from.usd;
  const rows = run.causes.map((c, k) => {
    const before = total;
    total = Math.round((total + c.usd) * 100) / 100;
    return causeRow(c, before, total, scale, k + 1);
  });
  const lo = money(scale.lo);
  const hi = money(scale.hi);
  return `
    <table class="cascade" id="cascade">
      <caption><span class="cap">${icon("arrows-horizontal")}<span>The running-total bars go from ${lo} on the left to ${hi} on the right, not from $0, so each change shows at a size you can read.</span></span></caption>
      <thead><tr>
        <th scope="col">Cause, and who worked it out</th>
        <th scope="col" class="r">Change</th>
        <th scope="col" class="bridge-col">Running total, from ${lo} to ${hi}</th>
      </tr></thead>
      <tbody>
        ${billRow(run.from, `Read from your ${run.from.label}`, "Starting point", scale, 0)}
        ${rows.join("")}
        ${billRow(run.to, `Matches the price list: ${usd(run.recomputedUsd)}`, "Where it ends", scale, 7)}
      </tbody>
    </table>`;
}

// ---------- Checks ----------

function check(c: CheckView, n: number, key: string): string {
  if (!c.accepted) {
    return `
      <li class="rejected" id="${key}-check-${n}" tabindex="-1">
        <p class="rej-head">${icon("warning-octagon")}Rejected${c.attempt === 1 ? ", first pass" : ""}</p>
        <div class="rej-body">
          <span class="ck-n num">${n}</span>
          <div class="ck"><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p>
          ${c.sentBackTo ? `<p class="sent">${icon("arrow-u-up-left")}Sent back to ${esc(agentName(c.sentBackTo))} to try again</p>` : ""}</div>
        </div>
      </li>`;
  }
  const status = `Accepted${c.attempt > 1 ? ", second pass" : ""}`;
  return `
    <li id="${key}-check-${n}" tabindex="-1">
      <span class="ck-n num">${n}</span>
      <div class="ck"><span class="ck-status">${icon("check-circle")}${status}</span><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p></div>
    </li>`;
}

export function rulesLine(run: RunView, rules: DemoRules): string {
  const pc = (n: number): string => `${Math.round(n * 100)}%`;
  return run.allowedUsd === null
    ? ""
    : `<p class="rule">${icon("ruler")}<span>The rules: the price list must give within ${pc(rules.recomputeTolerance)} of what the bill says, and no more than ${usd(run.allowedUsd)} of the change may stay unexplained (${pc(rules.closureShare)} of the change, at least ${money(rules.closureFloorUsd)}).</span></p>`;
}

export function checks(run: RunView, rules: DemoRules, key: string): string {
  const passes = [...new Set(run.checks.map((c) => c.attempt))].sort((a, b) => a - b);
  const rejected = run.checks.find((c) => !c.accepted && c.sentBackTo);
  let n = 0;
  const groups = passes.map((attempt, p) => {
    const items = run.checks.filter((c) => c.attempt === attempt);
    const start = n + 1;
    const html = items.map((c) => check(c, ++n, key)).join("");
    const title =
      passes.length === 1
        ? ""
        : p === 0
          ? `<h3 class="pass-title">First pass</h3>`
          : `<h3 class="pass-title">${p === 1 ? "Second pass" : `Pass ${p + 1}`}${rejected?.sentBackTo ? `, after ${esc(agentName(rejected.sentBackTo))} tried again` : ""}</h3>`;
    return `${title}<ol class="checks" start="${start}">${html}</ol>`;
  });
  return `
    <p class="agent">${icon(AGENT_ICONS.ReconciliationCritic)}<span><b>${esc(agentName("ReconciliationCritic"))}</b> recomputes everything and sends work back when it does not add up. ${run.checks.length} checks, in the order they ran.</span></p>
    ${groups.join("")}
    ${rulesLine(run, rules)}`;
}

// ---------- Actions ----------

function amountText(a: ActionView): { big: string; small: string } {
  const amt = a.amount;
  if (!amt) return { big: "Amount not known", small: "We need more facts about your household." };
  switch (amt.kind) {
    case "monthly":
      return { big: `about ${money(amt.usd)} a month`, small: `instead of this bill's ${usd(amt.insteadOfUsd)}` };
    case "range":
      return {
        big: `${money(amt.minUsd)} to ${money(amt.maxUsd)}`,
        small: amt.withPipp ? "once, for the heating season, once PIPP Plus is approved" : "once, for the heating season",
      };
    case "up_to":
      return { big: `up to ${money(amt.usd)}`, small: "toward the bill" };
    case "disputed":
      return { big: usd(amt.usd), small: "in question on this bill" };
    case "share_of_change":
      return { big: usd(amt.usd), small: "of the change came from your own use" };
  }
}

const ACTION_ICONS: Readonly<Record<string, string>> = {
  pipp_plus: "hand-coins",
  heap: "flame",
  summer_crisis: "sun",
  winter_crisis: "snowflake",
  puco_complaint: "scales",
  usage_note: "note-pencil",
};

const DECLINED_ICONS: Readonly<Record<string, string>> = {
  summer_crisis: "calendar-x",
  heap: "calendar-x",
  winter_crisis: "calendar-x",
  puco_complaint: "seal-check",
  usage_note: "note-pencil",
  budget_billing: "hourglass-medium",
};

/** Names that are letters, spelled out the first time they appear in the list. */
const SPELLED: Readonly<Record<string, string>> = {
  puco_complaint: "PUCO is the Public Utilities Commission of Ohio, which handles complaints about utilities.",
};

/** Escapes text and keeps phone numbers on one line. */
const keepPhones = (text: string): string => esc(text).replace(/\(\d{3}\) \d{3}-\d{4}/g, (m) => `<span class="nb">${m}</span>`);

const telHref = (phone: string): string => `tel:+1${phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")}`;

function noteForm(nextWithNote: string | null): string {
  return `
    <button type="button" class="btn solid" id="noteOpen" aria-expanded="false" aria-controls="noteForm">${icon("note-pencil")}Write a note for your next bill</button>
    <form class="note-form" id="noteForm" hidden novalidate>
      <label for="noteText">What was different at home this month?</label>
      <textarea id="noteText" rows="3" maxlength="400" placeholder="For example: my grandson stayed with me for three weeks."></textarea>
      <button type="submit" class="btn line">${icon("eye")}Show how the note would read</button>
      <p class="note-result" id="noteResult" hidden></p>
      <p class="note-limit">${icon("info")}<span>This demo does not save notes, so your next bill will not use what you write here.${nextWithNote ? ` To see a note at work, open the ${esc(nextWithNote)}.` : ""}</span></p>
    </form>`;
}

function actionCard(a: ActionView, primary: boolean, asOf: string, nextWithNote: string | null): string {
  const amt = amountText(a);
  const step = a.nextStep;
  const rules = a.source.startsWith("https://")
    ? ` <a href="${esc(a.source)}" target="_blank" rel="noopener noreferrer">Read the program rules${icon("arrow-square-out")}${NEW_TAB}</a>`
    : "";
  const by =
    a.id === "usage_note"
      ? `<b>${esc(agentName("ReconciliationCritic"))}</b>: anyone can add a note; it has no income or date rules. A saved note is kept in <b>${esc(agentName("HouseholdMemory"))}</b>.`
      : `<b>${esc(agentName("ReconciliationCritic"))}</b>: fits the program rules at this bill's date, ${esc(day(asOf))}.${rules}`;
  return `
    <article class="act${primary ? " primary" : ""}">
      <h3>${icon(ACTION_ICONS[a.id] ?? "check")}${esc(a.name)}</h3>
      ${a.longName && a.longName !== a.name ? `<p class="full">${esc(a.longName)}</p>` : ""}
      <p class="body">${esc(a.why)}</p>
      <p class="figure"><span class="v num${primary ? "" : " sm"}">${esc(amt.big)}</span><span class="c">${esc(amt.small)}</span></p>
      ${a.id === "usage_note" ? "" : `<p class="fit">${icon("check-circle")}<span>${esc(a.reason)}</span></p>`}
      <p class="next"><b>Next step.</b> ${keepPhones(step.text)}</p>
      ${a.id === "usage_note" ? noteForm(nextWithNote) : ""}
      ${
        step.url || step.phone
          ? `<div class="links">
              ${step.url ? `<a class="btn solid" href="${esc(step.url)}" target="_blank" rel="noopener noreferrer">${icon("arrow-square-out")}Apply or read more${NEW_TAB}</a>` : ""}
              ${step.phone ? `<a class="btn line" href="${telHref(step.phone)}">${icon("phone")}${esc(step.phone)}</a>` : ""}
            </div>`
          : ""
      }
      <p class="checked">${icon(a.id === "usage_note" ? AGENT_ICONS.ReconciliationCritic : "calendar-check")}<span>${by}</span></p>
    </article>`;
}

/** An action the household told us it already took: small, with what it told us. */
function takenCard(a: ActionView): string {
  return `
    <article class="act taken">
      <h3>${icon(ACTION_ICONS[a.id] ?? "check")}${esc(a.name)}</h3>
      <p class="status">${icon("notebook")}<span>You applied, so it is not suggested again.</span></p>
      <p class="quote">From your note of ${esc(short(a.takenAt ?? ""))}: “${esc(a.reason)}”</p>
      <p class="checked">${icon(AGENT_ICONS.HouseholdMemory)}<span><b>${esc(agentName("HouseholdMemory"))}</b>: what you told us on ${esc(day(a.takenAt ?? ""))}.</span></p>
    </article>`;
}

/** Today's date in Columbus, YYYY-MM-DD. */
export const todayInOhio = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

interface Declined {
  readonly id: string;
  readonly name: string;
  readonly reason: string;
  /** Which date the row was checked against, said in full. */
  readonly when: string;
}

/**
 * The run judges eligibility at the bill's date so replays stay the same. Each row says
 * the date it was checked against. A season that ended since the bill is shown as closed
 * today; a season that opened since the bill is shown as opened, to be checked by the next
 * bill, never as offered, because only the checker can say who qualifies.
 */
export function actions(run: RunView, today: string = todayInOhio(), nextWithNote: string | null = null): string {
  const asOf = run.actionsAsOf;
  const closedNow = (a: ActionView): boolean => a.status === "recommended" && a.window !== null && today > a.window.to;
  const openedSince = (a: ActionView): boolean =>
    a.status === "rejected" && a.window !== null && asOf < a.window.from && today >= a.window.from && today <= a.window.to;
  const stillNotOpen = (a: ActionView): boolean => a.status === "rejected" && a.window !== null && today < a.window.from;
  const offered = run.actions.filter((a) => a.status === "recommended" && !closedNow(a));
  const taken = run.actions.filter((a) => a.status === "already_taken");
  const named = (a: { id: string; name: string; longName?: string }): string =>
    a.longName && a.longName !== a.name && a.name.length <= 5 ? `${a.name} (${a.longName})` : a.name;
  const billDate = `Checked by ${agentName("ReconciliationCritic").toLowerCase()} at this bill's date, ${day(asOf)}`;
  const declined: Declined[] = [
    ...run.actions.filter(closedNow).map((a) => ({
      id: a.id,
      name: named(a),
      reason: `Closed on ${day(a.window?.to ?? "")}, so you cannot apply now; ask about next season.`,
      when: `Checked against today's date, ${day(today)}`,
    })),
    ...run.actions
      .filter((a) => a.status === "rejected")
      .map((a) =>
        openedSince(a)
          ? {
              id: a.id,
              name: named(a),
              reason: `Opened on ${day(a.window?.from ?? "")}, after this bill's date, and takes applications until ${day(a.window?.to ?? "")}. Your next bill checks whether you qualify.`,
              when: `Not open at this bill's date, ${day(asOf)}; checked against today's date, ${day(today)}`,
            }
          : {
              id: a.id,
              name: named(a),
              reason: a.reason,
              when: stillNotOpen(a) ? `${billDate}; still not open today, ${day(today)}` : billDate,
            },
      ),
    ...run.notOffered.map((x) => ({
      id: x.id,
      name: x.name,
      reason: `${SPELLED[x.id] ? `${SPELLED[x.id]} ` : ""}${x.reason}`,
      when: `Looked at by ${agentName("ActionPlanner").toLowerCase()} for this bill, ${day(asOf)}`,
    })),
  ];
  const usesToday = declined.some((d) => d.when.includes("today"));
  const lead = offered[0];
  const side = [...offered.slice(1).map((a) => actionCard(a, false, asOf, nextWithNote)), ...taken.map(takenCard)];
  return `
    <div class="sec-head">
      <h2 id="act-h">What you can do about this bill</h2>
      <span class="aside">${icon("calendar-check")}Checked at this bill's date, ${esc(day(asOf))}${usesToday ? `, and against today's date, ${esc(day(today))}` : ""}</span>
    </div>
    ${
      lead
        ? `<div class="actions-grid${side.length ? "" : " single"}">
            ${actionCard(lead, true, asOf, nextWithNote)}
            ${side.length ? `<div class="act-side">${side.join("")}</div>` : ""}
          </div>`
        : `${taken.length ? `<div class="act-side solo">${taken.map(takenCard).join("")}</div>` : ""}<p class="notice plain">${icon("info")}<span>None of the programs we check fit this bill right now.</span></p>`
    }
    ${
      declined.length
        ? `<div class="notoffered"><h3>Looked at and not offered (${declined.length})</h3><ul>${declined
            .map(
              (d) =>
                `<li>${icon(DECLINED_ICONS[d.id] ?? "x-circle")}<div><b>${esc(d.name)}</b><p>${esc(d.reason)}</p><small>${esc(d.when)}.</small></div></li>`,
            )
            .join("")}</ul></div>`
        : ""
    }`;
}

// ---------- October: what the household told us ----------

const lowerFirst = (t: string): string => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const listOf = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** The reading the switch gives, in one paragraph; also what the live region announces. */
export function reading(page: PageView, on: boolean): string {
  const withUsage = page.withMemory.causes.find((c) => c.key === "usage");
  const withoutUsage = page.withoutMemory.causes.find((c) => c.key === "usage");
  if (on) {
    const others = page.withMemory.causes
      .filter((c) => c.key !== "usage" && c.key !== "unexplained" && Math.abs(c.usd) >= 1)
      .sort((x, y) => Math.abs(y.usd) - Math.abs(x.usd))
      .map((c) => `${c.key === "one_off" ? c.title : lowerFirst(c.title)} (${usd(c.usd, true)})`);
    return `<b>With your notes.</b> Your own use changed by <span class="nb">${withUsage ? usd(withUsage.usd, true) : "nothing"}</span>.${others.length ? ` The change comes from ${esc(listOf(others))}.` : ""}`;
  }
  const unusual = esc(page.withMemory.from.label.replace(" bill", ""));
  const without = !withoutUsage
    ? "The same bill has no usage figure without your notes."
    : withoutUsage.usd < 0
      ? `The same bill reads as if you cut back by <span class="nb">${usd(Math.abs(withoutUsage.usd))}</span>.`
      : `The same bill reads as if you used <span class="nb">${usd(withoutUsage.usd)}</span> more.`;
  return `<b>Without your notes.</b> ${without} Your note says ${unusual} was not a normal month, and this reading leaves that out.`;
}

export function memoryPanel(page: PageView, on: boolean): string {
  const notes = page.withMemory.notes;
  if (notes.length === 0) return "";
  const back = page.withMemory.actions
    .filter((a) => a.status === "already_taken" && page.withoutMemory.actions.find((b) => b.id === a.id)?.status === "recommended")
    .map((a) => a.name);
  const covers = `Turning this off reads the bill as if you had told us nothing: ${notes.length === 1 ? "the note is" : `all ${notes.length} notes are`} left out${back.length ? `, so ${esc(listOf(back))} ${back.length === 1 ? "is" : "are"} suggested again` : ""}.`;
  return `
    <div class="note" role="group" aria-labelledby="note-h">
      <div class="note-quote">
        <h3 id="note-h">${icon(AGENT_ICONS.HouseholdMemory)}What you told us</h3>
        <ul class="notes">${notes.map((n) => `<li><span class="when">${esc(short(n.at))}</span><q>${esc(n.text)}</q></li>`).join("")}</ul>
        <p class="by">Kept in <b>${esc(agentName("HouseholdMemory"))}</b>. ${covers}</p>
      </div>
      <div class="note-switch">
        <button class="switch" id="memSwitch" type="button" role="switch" aria-checked="${on}">
          <span class="track" aria-hidden="true"></span><span class="switch-label">Use what you told us</span><span class="switch-state" aria-hidden="true">${on ? "On" : "Off"}</span>
        </button>
        <p class="reading ${on ? "right" : "wrong"}">${icon(on ? "check-circle" : "warning")}<span>${reading(page, on)}</span></p>
      </div>
    </div>`;
}

export function comparison(page: PageView, on: boolean): string {
  const keys = [...new Set([...page.withMemory.causes, ...page.withoutMemory.causes].map((c) => c.key))];
  const cell = (run: RunView, key: CauseView["key"]): string => {
    const c = run.causes.find((x) => x.key === key);
    if (!c) return `<td class="v ns">Not shown</td>`;
    return `<td class="v num">${usd(c.usd, true)}${c.kwh === null ? "" : `<small>${kwh(c.kwh, true)}</small>`}</td>`;
  };
  const differs = (key: CauseView["key"]): boolean =>
    page.withMemory.causes.find((x) => x.key === key)?.usd !== page.withoutMemory.causes.find((x) => x.key === key)?.usd;
  const title = (key: CauseView["key"]): string =>
    (page.withMemory.causes.find((x) => x.key === key) ?? page.withoutMemory.causes.find((x) => x.key === key))?.title ?? key;
  const a = page.withMemory.normalBill;
  const b = page.withoutMemory.normalBill;
  const daysWhy =
    differs("days") && a && b && a !== b
      ? ` The days row changes too: each day is counted at your normal daily use, and your note makes your ${esc(a)} the normal month instead of your ${esc(b)}.`
      : "";
  return `
    <div class="compare-wrap">
      <h3 id="cmp-h">Same bill, with and without your notes</h3>
      <table class="compare" aria-labelledby="cmp-h">
        <caption>Shaded rows change with your notes.${daysWhy} Both readings end at ${usd(page.withMemory.to.usd)}, this bill's total.</caption>
        <thead><tr><th scope="col">Cause</th><th scope="col"${on ? ' class="live"' : ""}>With your notes</th><th scope="col"${on ? "" : ' class="live"'}>Without them</th></tr></thead>
        <tbody>
          ${keys
            .map(
              (k) =>
                `<tr class="${differs(k) ? "diff" : ""}"><th scope="row">${differs(k) ? `${icon("arrows-left-right")}<span class="sr-only">Changes with your notes: </span>` : ""}${esc(k === "usage" ? "Your own use" : title(k))}</th>${cell(page.withMemory, k)}${cell(page.withoutMemory, k)}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

// ---------- Evidence ----------

const SOURCE_TEXT: Readonly<Record<DemoWeather["source"], string>> = {
  live: "Read live from Zetaris when this page's data was prepared.",
  sample: "Replayed from an answer Zetaris gave in a recorded run (sample mode).",
  snapshot: "Sample mode had no recorded answer for this query, so the rows come from a saved copy of the same Zetaris NOAA table.",
};

export function evidence(run: RunView, weather: DemoWeather): string {
  const e: Evidence = run.evidence;
  const block = (k: string, title: string, ico: string, body: string): string => `
    <details data-key="${k}">
      <summary>${icon(ico, "lead-i")}<b>${title}</b>${icon("caret-down", "chev")}</summary>
      <div class="ev-body">${body}</div>
    </details>`;
  const agents = Object.keys(AGENT_NAMES)
    .map((code) => `<tr><td>${esc(agentName(code))}</td><td><code translate="no">${esc(code)}</code></td><td>${esc(AGENT_JOBS[code] ?? "")}</td></tr>`)
    .join("");
  const s = stripView(run, weather);
  const drawn = s ? s.days.length : 0;
  const lastDay = weather.days.at(-1)?.date ?? weather.toExclusive;
  const words = run.checks.map((c, i) => `<li><b>${i + 1}. ${esc(c.title)}.</b> ${esc(c.detail)}</li>`).join("");
  return `
    <div class="sec-head">
      <h2 id="ev-h">Where the numbers come from</h2>
      <span class="aside">${icon("magnifying-glass")}One step further, for anyone who wants to check</span>
    </div>
    ${
      e.weatherSql
        ? block(
            "ev-join",
            "Your bills joined with Columbus weather",
            "database",
            `<p>One federated SQL query in Zetaris joins <code translate="no">household_pg.bills</code> with the daily weather of NOAA (the US weather service) for station <code translate="no">${esc(weather.station)}</code>, John Glenn Columbus International Airport.</p><pre class="sql"><code translate="no">${esc(e.weatherSql)}</code></pre>`,
          )
        : ""
    }
    ${block(
      "ev-weather",
      "The daily weather on the chart",
      "cloud-sun",
      `<p>${esc(agentName("WeatherAnalyst"))} read ${weather.days.length} days of weather, ${esc(day(weather.from))} to ${esc(day(lastDay))}. The chart on this tab shows the ${drawn} days of its two bills. ${SOURCE_TEXT[weather.source]}</p><pre class="sql"><code translate="no">${esc(weather.sql)}</code></pre>`,
    )}
    ${
      e.tariff
        ? block(
            "ev-tariff",
            "The price list used to recompute your bill",
            "receipt",
            `<p>${esc(e.tariff.name)}, in force since ${esc(day(e.tariff.start))}. OpenEI URDB rate <code translate="no">${esc(e.tariff.label)}</code>.</p>
             <p><a href="https://apps.openei.org/IURDB/rate/view/${encodeURIComponent(e.tariff.label)}" target="_blank" rel="noopener noreferrer">Open the published tariff${icon("arrow-square-out")}${NEW_TAB}</a></p>`,
          )
        : ""
    }
    ${block("ev-words", "What the checker wrote, word for word", "list-checks", `<ol class="words">${words}</ol>`)}
    ${block(
      "ev-run",
      "This run",
      "play-circle",
      `<p>Run <code translate="no">${esc(e.runId)}</code>. ${e.sampleMode ? "Replayed from responses recorded in a live run (sample mode)." : "Live run against Zetaris and Nightshift."}</p>
       ${e.billModel ? `<p>Bill read by <code translate="no">${esc(e.billModel)}</code> through Meterless Nightshift.</p>` : ""}`,
    )}
    ${block(
      "ev-agents",
      "Who did what: the agents and their names in the code",
      "users-three",
      `<div class="agents-scroll"><table class="agents"><thead><tr><th scope="col">On this page</th><th scope="col">In the code</th><th scope="col">What it does</th></tr></thead><tbody>${agents}</tbody></table></div>`,
    )}`;
}

// ---------- The whole panel ----------

/** What the page keeps across a re-render of the same bill. */
export interface PanelState {
  readonly stripMore: boolean;
}

/** Everything under the tabs for one tab and switch position. */
export function panel(page: PageView, tab: Tab, memoryOn: boolean, today: string = todayInOhio(), state: PanelState = { stripMore: false }): string {
  const second = tab === "second";
  const run = second ? (memoryOn ? page.withMemory : page.withoutMemory) : page.first;
  const key = tabKey(run);
  const verb = run.changeUsd < 0 ? "came off" : "adds up";
  const nextWithNote = !second && page.withMemory.notes.length > 0 ? page.withMemory.tabLabel : null;
  return `
    <div class="wrap">
      ${lead(run, page.rules, key)}
      ${strip(run, page.weather, state.stripMore)}
      <div class="work">
        <section class="cascade-sec block" style="--b:4" aria-labelledby="casc-h">
          <div class="sec-head"><h2 id="casc-h">How the ${usd(Math.abs(run.changeUsd))} ${verb}</h2><span class="aside">${icon("arrow-down")}Last bill to this bill, one cause at a time</span></div>
          ${cascade(run)}
          ${second ? memoryPanel(page, memoryOn) : ""}
          ${second ? comparison(page, memoryOn) : ""}
        </section>
        <section class="checks-sec block" style="--b:5" aria-labelledby="ck-h">
          <div class="sec-head"><h2 id="ck-h">Checked before you see it</h2></div>
          ${checks(run, page.rules, key)}
        </section>
      </div>
      <section class="sec actions-sec block" style="--b:6" aria-labelledby="act-h">${actions(run, today, nextWithNote)}</section>
      <section class="sec evidence block" style="--b:7" aria-labelledby="ev-h">${evidence(run, page.weather)}</section>
    </div>`;
}

export function skeleton(): string {
  const row = (i: number): string => `<div class="sk-row" style="--i:${i}"><span class="sk-line w60"></span><span class="sk-line w30"></span></div>`;
  return `
    <div class="wrap loading" role="status">
      <div class="lead"><div class="lead-main"><span class="sk-line w40 tall"></span><span class="sk-line w30 huge"></span></div><div class="sk-box"></div></div>
      <div class="sk-strip"></div>
      <p class="loading-msg">${icon("hourglass-medium")}We are reading the bill and checking each cause…</p>
      <div class="work"><div>${[0, 1, 2, 3, 4].map(row).join("")}</div><div>${[0, 1, 2].map(row).join("")}</div></div>
    </div>`;
}

/** A failure in words for the household; the original error goes to the console, never to the page. */
export function friendlyError(error: unknown): string {
  return error instanceof TypeError
    ? "We could not reach Why So High. Check your internet connection and try again."
    : "Something went wrong on our side. Please try again in a minute.";
}

export function failure(message: string): string {
  return `
    <div class="wrap">
      <div class="failure" role="alert">
        <h2>${icon("warning")}This bill could not be explained right now</h2>
        <p>${esc(message)}</p>
        <button class="btn solid" id="retry" type="button">${icon("arrow-clockwise")}Try again</button>
      </div>
    </div>`;
}
