// HTML for each part of the page, from the view model. Text from the server is escaped.
// Agents carry their plain names here; their names in the code appear only in the evidence.

import { esc, kwh, short, usd } from "./format.ts";
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
  type StripBracket,
  type StripView,
} from "./model.ts";

export type Tab = "first" | "second";

const icon = (name: string, cls = ""): string => `<i class="ph-light ph-${name}${cls ? ` ${cls}` : ""}" aria-hidden="true"></i>`;

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

const range = (b: BillEnd): string =>
  b.start ? `${short(b.start)} to ${short(b.end)}, ${b.days} days, ${kwh(b.kwh)}` : `${b.days} days, ${kwh(b.kwh)}`;

/** The dates a bill covers, for the tab. */
export const tabWhen = (run: RunView): string => (run.to.start ? `${short(run.to.start)} to ${short(run.to.end)}` : "");

/** The amount a direction word goes with: "went up" or "went down". */
const way = (run: RunView): "up" | "down" => (run.changeUsd < 0 ? "down" : "up");

function who(code: string, source: string): string {
  return `<div class="who"><b>${icon(AGENT_ICONS[code] ?? "user")}${esc(agentName(code))}</b>${source ? `<span>${esc(source)}</span>` : ""}</div>`;
}

// ---------- Lead ----------

/** One line under the headline so the checker's rejection is seen without scrolling to it. */
function criticNote(run: RunView): string {
  const i = run.checks.findIndex((c) => !c.accepted);
  if (i < 0) return "";
  const c = run.checks[i];
  const back = c.sentBackTo ? ` and sent it back to ${esc(agentName(c.sentBackTo))}` : "";
  return `<p class="notice">${icon("warning-octagon")}<span>The checker rejected the first answer${back}. <a href="#check-${i + 1}">See check ${i + 1}</a>.</span></p>`;
}

function lead(run: RunView): string {
  const dir = way(run);
  const conf = run.confidence;
  const levels = ["LOW", "MEDIUM", "HIGH"];
  const at = conf ? levels.indexOf(conf.level) : -1;
  const meter = conf
    ? `<aside class="confidence block" style="--b:1" aria-labelledby="conf-h">
        <h2 id="conf-h">${icon("gauge")}How sure we are</h2>
        <div class="meter" aria-hidden="true">${levels.map((_, i) => `<span${i <= at ? ' class="on"' : ""}></span>`).join("")}</div>
        <p class="meter-labels">${levels
          .map((l, i) => {
            const word = `${l.charAt(0)}${l.slice(1).toLowerCase()}`;
            return i === at ? `<b>${word}</b>` : `<span aria-hidden="true">${word}</span>`;
          })
          .join("")}</p>
        <p>${esc(conf.reason)}</p>
      </aside>`
    : "";
  return `
    <div class="lead">
      <div class="lead-main block" style="--b:0">
        <h1 class="headline"><span class="hl-line">Your bill went ${dir}</span>
          <span class="big ${dir}">${icon(dir === "up" ? "arrow-up" : "arrow-down", "dir")}<span class="num">${usd(Math.abs(run.changeUsd))}</span></span></h1>
        <dl class="bills">
          <div class="bill-line then"><dt class="amt num">${usd(run.from.usd)}</dt><dd><b>${esc(run.from.label)}</b><span>${esc(range(run.from))}</span></dd></div>
          <div class="bill-line now"><dt class="amt num">${usd(run.to.usd)}</dt><dd><b>${esc(run.to.label)}</b><span>${esc(range(run.to))}</span></dd></div>
        </dl>
        <div class="why-row"><p class="why">Here is why.</p>${criticNote(run)}</div>
      </div>
      ${meter}
    </div>`;
}

// ---------- Cascade ----------

interface Scale {
  readonly lo: number;
  readonly hi: number;
  readonly x: (usd: number) => number;
}

/** Running-total axis on whole $5 steps around the bills, so it is clear where it starts. */
function bridgeScale(run: RunView): Scale {
  const totals = [run.from.usd];
  for (const c of run.causes) totals.push(Math.round((totals[totals.length - 1] + c.usd) * 100) / 100);
  totals.push(run.to.usd);
  const lo = Math.floor((Math.min(...totals) - 1) / 5) * 5;
  const hi = Math.ceil((Math.max(...totals) + 1) / 5) * 5;
  return { lo, hi, x: (t) => ((t - lo) / (hi - lo)) * 100 };
}

const pct = (n: number): string => `${n.toFixed(2)}%`;

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
      ? `<button type="button" class="weather-btn" aria-pressed="false" aria-controls="strip">${icon("chart-bar")}Show these days on the strip</button>`
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
    return `<p class="notice plain">${icon("warning")}<span>The agents could not split this change: ${esc(run.skipped)}</span></p>`;
  }
  const scale = bridgeScale(run);
  let total = run.from.usd;
  const rows = run.causes.map((c, k) => {
    const before = total;
    total = Math.round((total + c.usd) * 100) / 100;
    return causeRow(c, before, total, scale, k + 1);
  });
  return `
    <table class="cascade" id="cascade">
      <caption><span class="cap">${icon("arrows-horizontal")}<span>The running-total bars start at ${usd(scale.lo).replace(".00", "")}, not at $0, so each change shows at a size you can read.</span></span></caption>
      <thead><tr>
        <th scope="col">Cause, and who worked it out</th>
        <th scope="col" class="r">Change</th>
        <th scope="col" class="bridge-col">Running total
          <span class="bridge-scale"><span class="cut" aria-hidden="true"></span><span>${usd(scale.lo).replace(".00", "")}</span><span>${usd(scale.hi).replace(".00", "")}</span></span>
        </th>
      </tr></thead>
      <tbody>
        ${billRow(run.from, "From the last bill", "Last bill", scale, 0)}
        ${rows.join("")}
        ${billRow(run.to, `${agentName("RateAnalyst")} gets ${usd(run.recomputedUsd)} from the tariff`, "This bill", scale, 7)}
      </tbody>
    </table>`;
}

// ---------- Checks ----------

function check(c: CheckView, n: number): string {
  if (!c.accepted) {
    return `
      <li class="rejected" id="check-${n}" tabindex="-1">
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
    <li id="check-${n}" tabindex="-1">
      <span class="ck-n num">${n}</span>
      <div class="ck"><span class="ck-status">${icon("check-circle")}${status}</span><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p></div>
    </li>`;
}

export function rulesLine(run: RunView, rules: DemoRules): string {
  const pc = (n: number): string => `${Math.round(n * 100)}%`;
  return run.allowedUsd === null
    ? ""
    : `<p class="rule">${icon("ruler")}<span>The checker accepts a bill recomputed within ${pc(rules.recomputeTolerance)} of the billed total, and a change that leaves no more than ${usd(run.allowedUsd)} unexplained (${pc(rules.closureShare)} of the change, at least ${usd(rules.closureFloorUsd)}).</span></p>`;
}

export function checks(run: RunView, rules: DemoRules): string {
  const passes = [...new Set(run.checks.map((c) => c.attempt))].sort((a, b) => a - b);
  const rejected = run.checks.find((c) => !c.accepted && c.sentBackTo);
  let n = 0;
  const groups = passes.map((attempt, p) => {
    const items = run.checks.filter((c) => c.attempt === attempt);
    const start = n + 1;
    const html = items.map((c) => check(c, ++n)).join("");
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

// ---------- Weather strip ----------

const TEMP_STEPS: readonly (readonly [number, string])[] = [
  [60, "under 60"],
  [65, "60 to 65"],
  [70, "65 to 70"],
  [75, "70 to 75"],
  [80, "75 to 80"],
  [Infinity, "80 and up"],
];

const tempStep = (meanF: number): number => TEMP_STEPS.findIndex(([limit]) => meanF < limit) + 1;

const SOURCE_LINE: Readonly<Record<DemoWeather["source"], string>> = {
  live: "read through Zetaris for this page.",
  sample: "read through Zetaris in a recorded run and replayed here (sample mode).",
  snapshot: "from a saved copy of the Zetaris NOAA table, because this is sample mode and the query was not recorded.",
};

function bracket(b: StripBracket): string {
  return `<div class="bracket${b.noted ? " noted" : ""}"><h3>${esc(b.label)}</h3>
    <p class="b-detail">${esc(short(b.start))} to ${esc(short(b.end))}, ${b.days} days${b.drawn < b.days ? `, ${b.drawn} with readings` : ""}.${b.need ? ` <span class="need">${esc(b.need)}</span>` : ""}</p>
    ${b.noted ? `<p class="b-noted b-detail">${icon("notebook")}Not a normal month, from your note</p>` : ""}</div>`;
}

function needsList(s: StripView): string {
  return `<ul class="needs">${s.brackets
    .map(
      (b) =>
        `<li><b>${esc(b.label)}</b> ${esc(short(b.start))} to ${esc(short(b.end))}, ${b.days} days.${b.need ? ` ${esc(b.need)}.` : ""}${b.noted ? ` ${icon("notebook")}Not a normal month, from your note.` : ""}</li>`,
    )
    .join("")}</ul>`;
}

export function strip(run: RunView, weather: DemoWeather): string {
  const s = stripView(run, weather);
  if (!s) return "";
  const n = s.days.length;
  const span = s.highF - s.lowF;
  const y = (t: number): number => ((t - s.lowF) / span) * 100;
  const split = s.days.findIndex((d) => d.bill === 1);
  const at = split < 0 ? n : split;
  const ticks: string[] = [];
  const axis: string[] = [];
  for (let t = s.lowF; t <= s.highF; t += 10) {
    ticks.push(`<div class="grid-line" style="bottom:${pct(y(t))}"></div>`);
    axis.push(`<span style="bottom:${pct(y(t))}">${t}°F</span>`);
  }
  const base = 65 > s.lowF && 65 < s.highF ? `<div class="base-line" style="bottom:${pct(y(65))}"></div>` : "";
  const bars = s.days
    .map(
      (d, i) =>
        `<span class="day" data-date="${d.date}" data-hi="${d.tmaxF}" data-lo="${d.tminF}" data-bill="${esc(s.brackets[d.bill].label)}"><span class="bar t${tempStep(d.meanF)}" style="--i:${i};bottom:${pct(y(d.tminF))};height:${pct(Math.max(y(d.tmaxF) - y(d.tminF), 1))}"></span></span>`,
    )
    .join("");
  const months = s.days
    .map((d, i) => (d.date.endsWith("-01") ? `<span style="left:${pct(((i + 0.5) / n) * 100)}">${esc(short(d.date))}</span>` : ""))
    .join("");
  const noted = s.brackets.findIndex((b) => b.noted);
  const hatch =
    noted >= 0
      ? `<div class="stay" style="left:${pct(noted === 0 ? 0 : (at / n) * 100)};width:${pct(((noted === 0 ? at : n - at) / n) * 100)}"></div>`
      : "";
  const hot = s.hottest;
  const hotIdx = hot ? s.days.indexOf(hot) : -1;
  const hotLeft = hotIdx >= 0 && hotIdx < n / 2;
  const peak = hot
    ? `<div class="peak${hotLeft ? " right" : ""}" style="left:${pct(((hotIdx + (hotLeft ? 1 : 0)) / n) * 100)};bottom:${pct(y(hot.tmaxF))}">Hottest: ${hot.tmaxF}°F on ${esc(short(hot.date))}</div>`
    : "";
  const legend = TEMP_STEPS.map(([, label], i) => `<li><span class="sw t${i + 1}"></span>${label}</li>`).join("");
  const first = s.days[0];
  const last = s.days[n - 1];
  return `
    <section class="strip block" style="--b:5" id="strip" aria-labelledby="strip-h">
      <div class="strip-head">
        <div>
          <h2 id="strip-h">Columbus weather, day by day</h2>
          <p>One bar per day of the two bills: the low at the bottom, the high at the top, colored by the day's average.</p>
        </div>
        <div class="legend">
          ${icon("thermometer-cold")}<ol aria-label="Average temperature, degrees Fahrenheit">${legend}</ol>${icon("thermometer-hot")}<span>°F</span>
          ${base ? `<span class="dash">65°F, the base for degree days</span>` : ""}
          ${noted >= 0 ? `<span class="hatch">${esc(s.brackets[noted].label)}, not a normal month</span>` : ""}
        </div>
      </div>
      <p class="readout" id="readout">${icon("hand-pointing")}<span>Point at a day, or use the arrow keys, to read its high and low.</span></p>
      <div class="plot-wrap">
        <div class="yaxis" aria-hidden="true">${axis.join("")}</div>
        <div class="plot" role="slider" tabindex="0" aria-label="Daily temperatures in Columbus, ${esc(short(first.date))} to ${esc(short(last.date))}, ${first.date.slice(0, 4)}${hot ? `. Hottest day ${esc(short(hot.date))}, high ${hot.tmaxF} degrees Fahrenheit` : ""}" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="1" aria-valuetext="Choose a day">
          ${ticks.join("")}
          <div class="band" style="left:0;width:${pct((at / n) * 100)}"></div>
          <div class="band b2" style="left:${pct((at / n) * 100)};right:0"></div>
          ${hatch}${base}${peak}
          <div class="days">${bars}</div>
        </div>
      </div>
      <div class="xaxis" aria-hidden="true">${months}</div>
      <div class="brackets" style="grid-template-columns:${at}fr ${n - at}fr">${s.brackets.map(bracket).join("")}</div>
      ${needsList(s)}
      <p class="strip-foot">${icon(AGENT_ICONS.WeatherAnalyst)}<span>${esc(agentName("WeatherAnalyst"))}, from NOAA daily records for station ${esc(weather.station)}, John Glenn Columbus International Airport, ${SOURCE_LINE[weather.source]}</span></p>
    </section>`;
}

// ---------- Actions ----------

function amountText(a: ActionView): { big: string; small: string } {
  const amt = a.amount;
  if (!amt) return { big: "Amount not known", small: "We need more facts about the household." };
  switch (amt.kind) {
    case "monthly":
      return { big: `about ${usd(amt.usd).replace(".00", "")} a month`, small: `instead of this bill's ${usd(amt.insteadOfUsd)}` };
    case "range":
      return { big: `${usd(amt.minUsd).replace(".00", "")} to ${usd(amt.maxUsd).replace(".00", "")}`, small: "once, for the heating season" };
    case "up_to":
      return { big: `up to ${usd(amt.usd).replace(".00", "")}`, small: "toward the bill" };
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

/** Escapes text and keeps phone numbers on one line. */
const keepPhones = (text: string): string => esc(text).replace(/\(\d{3}\) \d{3}-\d{4}/g, (m) => `<span class="nb">${m}</span>`);

const telHref = (phone: string): string => `tel:+1${phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")}`;

function actionCard(a: ActionView, primary: boolean): string {
  const amt = amountText(a);
  const taken = a.status === "already_taken";
  const step = a.nextStep;
  const checker = taken ? "HouseholdMemory" : "ReconciliationCritic";
  const source = a.id === "usage_note"
    ? `, kept in <b>${esc(agentName("HouseholdMemory"))}</b>`
    : a.source.startsWith("https://")
    ? ` against the <a href="${esc(a.source)}" target="_blank" rel="noopener noreferrer">program rules${icon("arrow-square-out")}</a>`
    : a.source
      ? `. Source: ${esc(a.source)}`
      : "";
  return `
    <article class="act${primary ? " primary" : ""}${taken ? " quiet" : ""}">
      <h3>${icon(ACTION_ICONS[a.id] ?? "check")}${esc(a.name)}</h3>
      ${a.longName && a.longName !== a.name ? `<p class="full">${esc(a.longName)}</p>` : ""}
      ${taken ? `<p class="status">${icon("notebook")}You told us on ${esc(short(a.takenAt ?? ""))}. Not suggested again.</p>` : ""}
      <p class="body">${esc(a.why)}</p>
      <p class="figure"><span class="v num${primary ? "" : " sm"}">${esc(amt.big)}</span><span class="c">${esc(amt.small)}</span></p>
      ${
        taken
          ? `<p class="next">${icon("notebook")}<span>From your note: “${esc(a.reason)}”</span></p>`
          : `<p class="fit">${icon("check-circle")}<span>${esc(a.reason)}</span></p>
             <p class="next"><b>Next step.</b> ${keepPhones(step.text)}</p>
             ${
               step.url || step.phone
                 ? `<div class="links">
                     ${step.url ? `<a class="btn solid" href="${esc(step.url)}" target="_blank" rel="noopener noreferrer">${icon("arrow-square-out")}Apply or read more</a>` : ""}
                     ${step.phone ? `<a class="btn line" href="${telHref(step.phone)}">${icon("phone")}${esc(step.phone)}</a>` : ""}
                   </div>`
                 : ""
             }`
      }
      <p class="checked">${icon(AGENT_ICONS[checker])}<span>Checked by <b>${esc(agentName(checker))}</b>${source}</span></p>
    </article>`;
}

/** Today's date in Columbus, YYYY-MM-DD. */
export const todayInOhio = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

/**
 * The run judges eligibility at the bill's date so replays stay the same. A program
 * whose season has ended since then is shown as closed today, with no call to action.
 */
export function actions(run: RunView, today: string = todayInOhio()): string {
  const closedNow = (a: ActionView): boolean => a.status === "recommended" && a.window !== null && today > a.window.to;
  const offered = run.actions.filter((a) => a.status !== "rejected" && !closedNow(a));
  const lead = offered.find((a) => a.status === "recommended") ?? offered[0];
  const rest = offered.filter((a) => a !== lead);
  const rejected = run.actions.filter((a) => a.status === "rejected");
  const declined = [
    ...run.actions.filter(closedNow).map((a) => ({
      id: a.id,
      name: a.name,
      reason: `Closed on ${short(a.window?.to ?? "")}. It was open on this bill's date, ${short(run.actionsAsOf)}; ask about next season.`,
      by: "Checked against today's date",
    })),
    ...rejected.map((a) => ({ id: a.id, name: a.name, reason: a.reason, by: `Checked by ${agentName("ReconciliationCritic")}` })),
    ...run.notOffered.map((x) => ({ id: x.id, name: x.name, reason: x.reason, by: `Looked at by ${agentName("ActionPlanner")}` })),
  ];
  return `
    <div class="sec-head">
      <h2 id="act-h">What you can do this month</h2>
      <span class="aside">${icon("calendar-check")}Checked at the bill's date, ${esc(short(run.actionsAsOf))}</span>
    </div>
    ${
      lead
        ? `<div class="actions-grid${rest.length ? "" : " single"}">
            ${actionCard(lead, true)}
            ${rest.length ? `<div class="act-side">${rest.map((a) => actionCard(a, false)).join("")}</div>` : ""}
          </div>`
        : `<p class="notice plain">${icon("info")}<span>None of the programs we check fit this bill right now.</span></p>`
    }
    ${
      declined.length
        ? `<div class="notoffered"><h3>Looked at and not offered (${declined.length})</h3><ul>${declined
            .map(
              (d) =>
                `<li>${icon(DECLINED_ICONS[d.id] ?? "x-circle")}<div><b>${esc(d.name)}</b><p>${esc(d.reason)}</p><small>${esc(d.by)}</small></div></li>`,
            )
            .join("")}</ul></div>`
        : ""
    }`;
}

// ---------- October: the note ----------

const lowerFirst = (t: string): string => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const listOf = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

export function memoryPanel(page: PageView, on: boolean): string {
  const note = page.withMemory.note;
  if (!note) return "";
  const name = esc(page.household.name);
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
    ? `<p class="reading right">${icon("check-circle")}<span><b>With the note.</b> Your own use changed by <span class="nb">${withUsage ? usd(withUsage.usd, true) : "nothing"}</span>.${others.length ? ` The change comes from ${esc(listOf(others))}.` : ""}</span></p>`
    : `<p class="reading wrong">${icon("warning")}<span><b>Without the note.</b> ${without} Your note says ${unusual} was not a normal month, and this reading leaves that out.</span></p>`;
  return `
    <section class="note block" style="--b:2" aria-labelledby="note-h">
      <div class="note-quote">
        <h2 id="note-h">${icon(AGENT_ICONS.HouseholdMemory)}What ${name} told us on ${esc(short(note.at))}</h2>
        <blockquote>“${esc(note.text)}”</blockquote>
        <p class="by">${on ? `Kept in ${esc(agentName("HouseholdMemory"))} and used to read this bill.` : `Kept in ${esc(agentName("HouseholdMemory"))}. This reading leaves it out.`}</p>
      </div>
      <div class="note-switch">
        <div class="switch-row">
          <button class="switch" id="memSwitch" type="button" role="switch" aria-checked="${on}" aria-labelledby="memSwitch-l"></button>
          <span class="switch-label" id="memSwitch-l">Use what ${name} told us</span>
          <span class="switch-state" aria-hidden="true">${on ? "On" : "Off"}</span>
        </div>
        <div aria-live="polite">${reading}</div>
      </div>
    </section>`;
}

export function comparison(page: PageView, on: boolean): string {
  const keys = [...new Set([...page.withMemory.causes, ...page.withoutMemory.causes].map((c) => c.key))];
  const cell = (run: RunView, key: CauseView["key"]): string => {
    const c = run.causes.find((x) => x.key === key);
    if (!c) return `<td class="v ns">Not shown</td>`;
    return `<td class="v num">${usd(c.usd, true)}${c.kwh === null ? "" : `<small>${kwh(c.kwh, true)}</small>`}</td>`;
  };
  const differs = (key: CauseView["key"]): boolean => {
    const a = page.withMemory.causes.find((x) => x.key === key)?.usd;
    const b = page.withoutMemory.causes.find((x) => x.key === key)?.usd;
    return a !== b;
  };
  const title = (key: CauseView["key"]): string =>
    (page.withMemory.causes.find((x) => x.key === key) ?? page.withoutMemory.causes.find((x) => x.key === key))?.title ?? key;
  return `
    <div class="compare-wrap">
      <h3 id="cmp-h">Same bill, with and without the note</h3>
      <table class="compare" aria-labelledby="cmp-h">
        <caption>Shaded rows change when the note is used. Both readings close to ${usd(page.withMemory.to.usd)}.</caption>
        <thead><tr><th scope="col">Cause</th><th scope="col"${on ? ' class="live"' : ""}>With the note</th><th scope="col"${on ? "" : ' class="live"'}>Without it</th></tr></thead>
        <tbody>
          ${keys
            .map(
              (k) =>
                `<tr class="${differs(k) ? "diff" : ""}"><th scope="row">${differs(k) ? `${icon("arrows-left-right")}<span class="sr-only">Changes with the note: </span>` : ""}${esc(k === "usage" ? "Your own use" : title(k))}</th>${cell(page.withMemory, k)}${cell(page.withoutMemory, k)}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

// ---------- Evidence ----------

export function evidence(e: Evidence, weather: DemoWeather): string {
  const block = (title: string, ico: string, body: string): string => `
    <details>
      <summary>${icon(ico, "lead-i")}<b>${title}</b>${icon("caret-down", "chev")}</summary>
      <div class="ev-body">${body}</div>
    </details>`;
  const agents = Object.keys(AGENT_NAMES)
    .map((code) => `<tr><td>${esc(agentName(code))}</td><td><code translate="no">${esc(code)}</code></td><td>${esc(AGENT_JOBS[code] ?? "")}</td></tr>`)
    .join("");
  const weatherSource =
    weather.source === "live"
      ? "Read live from Zetaris when this page's data was prepared."
      : weather.source === "sample"
        ? "Replayed from a response Zetaris gave in a recorded run (sample mode)."
        : "Sample mode had no recorded answer for this query, so the rows come from the saved copy of the same NOAA table.";
  return `
    <div class="sec-head">
      <h2 id="ev-h">Where the numbers come from</h2>
      <span class="aside">${icon("magnifying-glass")}One step further, for anyone who wants to check</span>
    </div>
    ${
      e.weatherSql
        ? block(
            "Your bills joined with Columbus weather",
            "database",
            `<p>One federated SQL query in Zetaris joins <code translate="no">household_pg.bills</code> with NOAA's daily weather for station ${esc(weather.station)}.</p><pre class="sql"><code translate="no">${esc(e.weatherSql)}</code></pre>`,
          )
        : ""
    }
    ${block(
      "The daily weather on the strip",
      "cloud-sun",
      `<p>${weather.days.length} days, ${esc(short(weather.from))} to ${esc(short(weather.toExclusive))}, read by ${esc(agentName("WeatherAnalyst"))}. ${weatherSource}</p><pre class="sql"><code translate="no">${esc(weather.sql)}</code></pre>`,
    )}
    ${
      e.tariff
        ? block(
            "The tariff used to recompute your bill",
            "receipt",
            `<p>${esc(e.tariff.name)}, in force since ${esc(short(e.tariff.start))}. OpenEI URDB rate <code translate="no">${esc(e.tariff.label)}</code>.</p>
             <p><a href="https://apps.openei.org/IURDB/rate/view/${encodeURIComponent(e.tariff.label)}" target="_blank" rel="noopener noreferrer">Open the published tariff${icon("arrow-square-out")}</a></p>`,
          )
        : ""
    }
    ${block(
      "This run",
      "play-circle",
      `<p>Run <code translate="no">${esc(e.runId)}</code>. ${e.sampleMode ? "Replayed from responses recorded in a live run (sample mode)." : "Live run against Zetaris and Nightshift."}</p>
       ${e.billModel ? `<p>Bill read by <code translate="no">${esc(e.billModel)}</code> through Meterless Nightshift.</p>` : ""}`,
    )}
    ${block(
      "Who did what: the agents and their names in the code",
      "users-three",
      `<div class="agents-scroll"><table class="agents"><thead><tr><th scope="col">On this page</th><th scope="col">In the code</th><th scope="col">What it does</th></tr></thead><tbody>${agents}</tbody></table></div>`,
    )}`;
}

// ---------- The whole panel ----------

/** Everything under the tabs for one tab and switch position. */
export function panel(page: PageView, tab: Tab, memoryOn: boolean, today: string = todayInOhio()): string {
  const second = tab === "second";
  const run = second ? (memoryOn ? page.withMemory : page.withoutMemory) : page.first;
  const verb = run.changeUsd < 0 ? "came off" : "adds up";
  return `
    <div class="wrap">
      ${lead(run)}
      ${second ? memoryPanel(page, memoryOn) : ""}
      <div class="work">
        <section class="cascade-sec block" style="--b:3" aria-labelledby="casc-h">
          <div class="sec-head"><h2 id="casc-h">How the ${usd(Math.abs(run.changeUsd))} ${verb}</h2><span class="aside">${icon("arrow-down")}Last bill to this bill, one cause at a time</span></div>
          ${cascade(run)}
          ${second ? comparison(page, memoryOn) : ""}
        </section>
        <section class="checks-sec block" style="--b:4" aria-labelledby="ck-h">
          <div class="sec-head"><h2 id="ck-h">Checked before you see it</h2></div>
          ${checks(run, page.rules)}
        </section>
      </div>
      ${strip(run, page.weather)}
      <section class="sec actions-sec block" style="--b:6" aria-labelledby="act-h">${actions(run, today)}</section>
      <section class="sec evidence block" style="--b:7" aria-labelledby="ev-h">${evidence(run.evidence, page.weather)}</section>
    </div>`;
}

export function skeleton(): string {
  const row = (i: number): string => `<div class="sk-row" style="--i:${i}"><span class="sk-line w60"></span><span class="sk-line w30"></span></div>`;
  return `
    <div class="wrap loading" role="status">
      <div class="lead"><div class="lead-main"><span class="sk-line w40 tall"></span><span class="sk-line w30 huge"></span></div><div class="sk-box"></div></div>
      <p class="loading-msg">${icon("hourglass-medium")}The agents are reading the bill and checking each cause.</p>
      <div class="work"><div>${[0, 1, 2, 3, 4].map(row).join("")}</div><div>${[0, 1, 2].map(row).join("")}</div></div>
    </div>`;
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
