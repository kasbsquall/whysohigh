// Turns one demo run (result plus trace) into what the page shows. Every number
// comes from the run; the words around it are chosen here.

import type { ActionAmount, ActionStatus } from "../../src/agents/actionPlanner.ts";
import type { ComponentKey } from "../../src/agents/usageAnalyst.ts";
import type { DemoPayload, DemoPayloadRun, DemoRules, Household } from "../../src/demo.ts";
import type { LogEvent } from "../../src/log.ts";
import type { BillWeather } from "../../src/zetaris/queries.ts";
import { day, month, plainReason, usd } from "./format.ts";

export interface BillEnd {
  readonly label: string;
  readonly start: string;
  readonly end: string;
  readonly days: number;
  readonly kwh: number;
  readonly usd: number;
}

export interface CauseView {
  readonly key: ComponentKey;
  readonly title: string;
  readonly detail: string;
  readonly usd: number;
  readonly kwh: number | null;
  readonly role: string;
  readonly agent: string;
  readonly source: string;
  /** Size against the largest cause, 0 to 1, for the bar. */
  readonly share: number;
}

export interface CheckView {
  readonly accepted: boolean;
  readonly title: string;
  readonly text: string;
  readonly about: string;
  readonly attempt: number;
  readonly stamp: "void" | "valid" | null;
  readonly sentBackTo: string | null;
}

export interface ActionView {
  readonly id: string;
  readonly name: string;
  readonly longName: string;
  readonly status: ActionStatus;
  readonly why: string;
  readonly amount: ActionAmount | null;
  /** Check 4's reason, or what the household told us it did. */
  readonly reason: string;
  readonly takenAt: string | null;
  readonly nextStep: { readonly text: string; readonly phone?: string; readonly url?: string };
  readonly source: string;
  /** Dates the program takes applications, when it has a season. */
  readonly window: { readonly from: string; readonly to: string } | null;
}

export interface Evidence {
  readonly weatherSql: string | null;
  readonly tariffSql: string | null;
  readonly tariff: { readonly label: string; readonly name: string; readonly start: string } | null;
  readonly billModel: string | null;
  readonly runId: string;
  readonly sampleMode: boolean;
}

export interface RunView {
  readonly step: DemoPayloadRun["step"];
  readonly tabLabel: string;
  readonly changeUsd: number;
  /** This bill recomputed by RateAnalyst from the published tariff. */
  readonly recomputedUsd: number;
  readonly from: BillEnd;
  readonly to: BillEnd;
  readonly causes: readonly CauseView[];
  readonly allowedUsd: number | null;
  readonly confidence: { readonly level: string; readonly reason: string } | null;
  readonly checks: readonly CheckView[];
  readonly evidence: Evidence;
  readonly note: { readonly text: string; readonly at: string } | null;
  /** Why the run could not split the change, when it could not. */
  readonly skipped: string | null;
  /** The date check 4 judged eligibility at. */
  readonly actionsAsOf: string;
  readonly actions: readonly ActionView[];
  readonly notOffered: readonly { readonly name: string; readonly reason: string }[];
}

const TARIFF_AGENT = "RateAnalyst";
const NOAA_SOURCE = "NOAA station USW00014821, Columbus";

/** The bill in history that ends on a date, or starts on it. */
const historyEnding = (history: readonly BillWeather[], end: string): BillWeather | undefined =>
  history.find((b) => b.periodEnd === end);
const historyStarting = (history: readonly BillWeather[], start: string): BillWeather | undefined =>
  history.find((b) => b.periodStart === start);

const billName = (end: string): string => `${month(end)} bill`;

function weatherDetail(previous: BillWeather, current: BillWeather): string {
  const perDay = (n: number, days: number): number => n / days;
  const parts: string[] = [];
  const pairs: readonly (readonly [string, number, number])[] = [
    ["cooling", perDay(previous.cdd, previous.days), perDay(current.cdd, current.days)],
    ["heating", perDay(previous.hdd, previous.days), perDay(current.hdd, current.days)],
  ];
  for (const [kind, before, now] of pairs) {
    if (Math.max(before, now) < 0.5) continue;
    const way = now < before ? "down" : "up";
    parts.push(`${kind} need ${now.toFixed(1)} degree days a day, ${way} from ${before.toFixed(1)}`);
  }
  const definition = "A degree day measures how much heating or cooling a day needs.";
  if (parts.length === 0) return `Little heating or cooling was needed on either bill. ${definition}`;
  const text = parts.join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}. ${definition}`;
}

interface CauseContext {
  readonly run: DemoPayloadRun;
  readonly from: BillEnd;
  readonly to: BillEnd;
  readonly previous: BillWeather | undefined;
  readonly current: BillWeather | undefined;
  readonly allowedUsd: number | null;
  readonly note: RunView["note"];
}

function describeCause(key: ComponentKey, amount: number, ctx: CauseContext): Omit<CauseView, "key" | "usd" | "kwh" | "share"> {
  const d = ctx.run.change.decomposition;
  switch (key) {
    case "price": {
      const segment = ctx.run.rate.estimate.charges.segments[0];
      return {
        title: "Price of electricity",
        detail:
          amount === 0
            ? "No change in AEP Ohio's published prices between the two bills."
            : "AEP Ohio's published prices changed between the two bills.",
        role: "CHECKED BY",
        agent: TARIFF_AGENT,
        source: segment ? `Tariff in force since ${day(segment.tariff.start)}` : "Published AEP Ohio tariff",
      };
    }
    case "one_off":
      return {
        title: `${ctx.from.label.replace(" bill", "")}'s extra use did not repeat`,
        detail: "You told us that bill was not a normal month, so its extra use is set apart.",
        role: "FROM YOUR NOTE",
        agent: "HouseholdMemory",
        source: ctx.note ? `Your note of ${day(ctx.note.at)}` : "Your note",
      };
    case "days": {
      const diff = ctx.to.days - ctx.from.days;
      return {
        title: diff > 0 ? `${diff} more days in this bill` : diff < 0 ? `${-diff} fewer days in this bill` : "Same number of days",
        detail: `${ctx.to.days} days this time, ${ctx.from.days} last time.`,
        role: "WORKED OUT BY",
        agent: "UsageAnalyst",
        source: "Bill dates read by BillReader",
      };
    }
    case "weather":
      return {
        title: amount <= 0 ? "Milder weather" : "Weather that needed more energy",
        detail: ctx.previous && ctx.current ? weatherDetail(ctx.previous, ctx.current) : "Weather for both bills from NOAA.",
        role: "CHECKED BY",
        agent: "WeatherAnalyst",
        source: NOAA_SOURCE,
      };
    case "usage": {
      const calibratedTo = d?.calibratedTo ? historyStarting(ctx.run.history, d.calibratedTo) : undefined;
      return {
        title:
          Math.abs(amount) < 1
            ? "Your own use barely changed"
            : amount > 0
              ? "You used more electricity yourself"
              : "You used less electricity yourself",
        detail: "What is left after price, days and weather.",
        role: "WORKED OUT BY",
        agent: "UsageAnalyst",
        source: !calibratedTo
          ? "Measured against the weather model"
          : ctx.note && calibratedTo.periodEnd !== ctx.from.end
            ? `Measured against your ${billName(calibratedTo.periodEnd)}, the last normal one`
            : `Measured against your ${billName(calibratedTo.periodEnd)}`,
      };
    }
    case "unexplained":
      return {
        title: "Not explained",
        detail: amount === 0 ? "Nothing is left over. It would show here if there were." : "The part the agents could not explain.",
        role: "CHECKED BY",
        agent: "ReconciliationCritic",
        source: ctx.allowedUsd === null ? "Must stay small" : `Allowed: up to ${usd(ctx.allowedUsd)}`,
      };
  }
}

const CHECK_TITLES: Readonly<Record<string, string>> = {
  freshness: "The data covers every day",
  weather_model: "The weather model is believable",
};

function checkTitle(e: LogEvent): string {
  if (e.check === "bill_recompute") return e.about === "previous bill" ? "The last bill matches the tariff" : "This bill matches the tariff";
  if (e.check === "closure") return e.accepted ? "The change adds up" : "Too much left unexplained";
  return CHECK_TITLES[String(e.check)] ?? String(e.check);
}

export function checksFromTrace(trace: readonly LogEvent[]): CheckView[] {
  const checks: CheckView[] = [];
  let rejectedBefore = false;
  trace.forEach((e, i) => {
    // Check 4 (eligibility) is shown with the actions it judged, not in this trail.
    if (e.agent !== "ReconciliationCritic" || e.check === "eligibility") return;
    const accepted = e.accepted === true;
    const retry = accepted ? undefined : trace.slice(i + 1).find((next) => next.step === "retry");
    checks.push({
      accepted,
      title: checkTitle(e),
      text: plainReason(String(e.reason)),
      about: String(e.about),
      attempt: Number(e.attempt),
      stamp: !accepted ? "void" : rejectedBefore && e.check === "closure" ? "valid" : null,
      sentBackTo: retry ? String(retry.target) : null,
    });
    if (!accepted) rejectedBefore = true;
  });
  return checks;
}

function evidenceFrom(run: DemoPayloadRun): Evidence {
  const sqlOf = (agent: string): string | null => {
    const e = run.trace.find((t) => t.agent === agent && t.step === "sql");
    return e ? String(e.sql) : null;
  };
  const model = [...run.trace].reverse().find((t) => t.agent === "BillReader" && t.step === "model_call");
  const segment = run.rate.estimate.charges.segments[0];
  return {
    weatherSql: sqlOf("WeatherAnalyst"),
    tariffSql: sqlOf(TARIFF_AGENT),
    tariff: segment ? { label: segment.tariff.label, name: segment.tariff.name, start: segment.tariff.start } : null,
    billModel: model ? String(model.modelServed) : null,
    runId: run.runId,
    sampleMode: run.sampleMode,
  };
}

export function runView(run: DemoPayloadRun, household: Household, minBillsToFit: number): RunView {
  const { start, end } = run.rate.estimate.period;
  const current = historyStarting(run.history, start);
  const previous = historyEnding(run.history, start);
  const d = run.change.decomposition;
  const to: BillEnd = { label: billName(end), start, end, days: run.bill.days, kwh: run.bill.kwh, usd: run.bill.totalUsd };
  const from: BillEnd = {
    label: previous ? billName(previous.periodEnd) : "Last bill",
    start: previous?.periodStart ?? "",
    end: previous?.periodEnd ?? start,
    days: run.bill.previous?.days ?? previous?.days ?? 0,
    kwh: run.bill.previous?.kwh ?? previous?.kwh ?? 0,
    usd: run.bill.previous?.totalUsd ?? d?.fromUsd ?? 0,
  };
  const recalled = run.memory?.notes.find((n) => n.kind === "one_off") ?? null;
  const note = recalled ? { text: recalled.text, at: recalled.at } : null;
  const ctx: CauseContext = { run, from, to, previous, current, allowedUsd: run.closureAllowedUsd, note };
  const largest = Math.max(...(d?.components ?? []).map((c) => Math.abs(c.usd)), 0.01);
  const causes = (d?.components ?? []).map((c) => ({
    key: c.key,
    usd: c.usd,
    kwh: c.kwh,
    share: Math.abs(c.usd) / largest,
    ...describeCause(c.key, c.usd, ctx),
  }));
  const calibratedTo = d?.calibratedTo ? historyStarting(run.history, d.calibratedTo) : undefined;
  const confidence = d
    ? {
        level: d.model.confidence.toUpperCase(),
        reason:
          d.model.source === "ohio_prior"
            ? `${household.name} has fewer than ${minBillsToFit} earlier bills, so the weather share uses Ohio averages` +
              (calibratedTo ? `, calibrated to the ${billName(calibratedTo.periodEnd)}.` : ".")
            : `Fitted on ${household.name}'s own ${d.model.billsUsed} earlier bills.`,
      }
    : null;
  return {
    step: run.step,
    tabLabel: billName(end),
    changeUsd: d?.changeUsd ?? Math.round((to.usd - from.usd) * 100) / 100,
    recomputedUsd: run.rate.estimate.charges.totalUsd,
    from,
    to,
    causes,
    allowedUsd: run.closureAllowedUsd,
    confidence,
    checks: checksFromTrace(run.trace),
    evidence: evidenceFrom(run),
    note,
    skipped: run.change.skipped,
    actionsAsOf: run.actions.asOf,
    actions: run.actions.actions.map((a) => {
      const program = run.programs[a.id];
      return {
        id: a.id,
        name: program?.name ?? a.id,
        longName: program?.longName ?? "",
        status: a.status,
        why: plainReason(a.why),
        amount: a.amount,
        reason: plainReason(a.verdict?.reason ?? a.taken?.text ?? ""),
        takenAt: a.taken?.at ?? null,
        nextStep: program?.nextStep ?? { text: "" },
        source: program?.source ?? "",
        window: program?.window ?? null,
      };
    }),
    notOffered: run.actions.notProposed.map((n) => ({ name: n.name, reason: plainReason(n.reason) })),
  };
}

export interface PageView {
  readonly household: Household;
  readonly rules: DemoRules;
  readonly first: RunView;
  readonly withMemory: RunView;
  readonly withoutMemory: RunView;
}

export function pageView(payload: DemoPayload): PageView {
  const byStep = (step: DemoPayloadRun["step"]): RunView => {
    const run = payload.runs.find((r) => r.step === step);
    if (!run) throw new Error(`The server did not return the ${step} run.`);
    return runView(run, payload.household, payload.rules.minBillsToFit);
  };
  return {
    household: payload.household,
    rules: payload.rules,
    first: byStep("month1"),
    withMemory: byStep("month2"),
    withoutMemory: byStep("month2-without-memory"),
  };
}
