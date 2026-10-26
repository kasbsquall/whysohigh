// Explainer: Nemotron puts the accepted split of the change into a few plain
// sentences. The critic then checks every number in those sentences against
// the split (check 6); a sentence with a number the agents did not compute is
// sent back once with the reason, and a second failure falls back to a
// sentence built from the numbers alone.

import type { LlmClient } from "../llm/nightshift.ts";
import type { RunLogger } from "../log.ts";
import type { PlannedAction } from "./actionPlanner.ts";
import { AGENT as CRITIC, logVerdict, type Verdict } from "./critic.ts";
import { componentUsd, type Decomposition } from "./usageAnalyst.ts";

export const AGENT = "Explainer";
export const EXPLAINER_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
// Nemotron reasons before it answers; with 2,000 tokens the September answer came back cut mid-sentence.
const MAX_TOKENS = 6000;
const ATTEMPTS = 2;

export interface Explained {
  readonly text: string;
  /** "model" when Nemotron's sentences passed check 6, "template" otherwise. */
  readonly source: "model" | "template";
  readonly verdicts: readonly Verdict[];
}

export interface ExplainInput {
  readonly previousKwh: number;
  readonly currentKwh: number;
  readonly previousDays: number;
  readonly currentDays: number;
  readonly decomposition: Decomposition;
  /** The first recommended action with a monthly or one-time amount, if any. */
  readonly action: { readonly name: string; readonly usd: number; readonly insteadOfUsd: number | null } | null;
}

const usd = (n: number): string => `$${Math.abs(n).toFixed(2)}`;

/** The figures the sentences may use, labelled for the model. */
export function factsFor(input: ExplainInput): Record<string, string | number> {
  const d = input.decomposition;
  const c = (key: Parameters<typeof componentUsd>[1]): number => componentUsd(d, key);
  return {
    previous_bill: usd(d.fromUsd),
    this_bill: usd(d.toUsd),
    change: `${d.changeUsd >= 0 ? "up" : "down"} ${usd(d.changeUsd)}`,
    from_price_per_kwh: `${c("price") >= 0 ? "+" : "-"}${usd(c("price"))}`,
    from_more_or_fewer_billing_days: `${c("days") >= 0 ? "+" : "-"}${usd(c("days"))}`,
    from_weather: `${c("weather") >= 0 ? "+" : "-"}${usd(c("weather"))}`,
    from_the_household_own_use: `${c("usage") >= 0 ? "+" : "-"}${usd(c("usage"))}`,
    not_explained: usd(c("unexplained")),
    previous_bill_days: input.previousDays,
    this_bill_days: input.currentDays,
    previous_bill_kwh: input.previousKwh,
    this_bill_kwh: input.currentKwh,
    difference_in_days: Math.abs(input.currentDays - input.previousDays),
    difference_in_kwh: Math.round(Math.abs(input.currentKwh - input.previousKwh) * 10) / 10,
    ...(input.action
      ? {
          action: input.action.name,
          action_amount: usd(input.action.usd),
          ...(input.action.insteadOfUsd !== null ? { action_instead_of: usd(input.action.insteadOfUsd) } : {}),
        }
      : {}),
  };
}

const SYSTEM =
  "You explain an electric bill to a 71-year-old reader in Columbus, Ohio. Write at most three short sentences, " +
  "under 60 words, in plain English. The page already shows the total change in large type above your sentences, " +
  "so do not open with it: start with the biggest reason, then the next one, and say what pulled the other way if anything did. " +
  "If FACTS has an action, end with what it could do and its amount; the household still has to apply. " +
  "Write dollar amounts without a plus or minus sign; let the words say which way they moved. " +
  "Use only numbers that appear in FACTS, written exactly as " +
  "they appear there (dollars with two decimals). No other numbers, no percentages, no dates, no math shown. " +
  "Do not call the reader by name. Reply with the sentences only.";

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** Every number a fact contains, so "$20.86" allows 20.86 and "33" allows 33. */
function allowedNumbers(facts: Record<string, string | number>): ReadonlySet<string> {
  const out = new Set<string>();
  for (const value of Object.values(facts)) {
    for (const m of String(value).match(NUMBER) ?? []) out.add(Number(m.replaceAll(",", "")).toFixed(2));
  }
  return out;
}

/**
 * Check 6: every number in the sentences is one the agents computed, and the
 * sentences state the change itself. Dollar amounts must match to the cent.
 */
/** The component with the largest amount in the direction of the change: the reason the sentences must name. */
export function biggestReason(d: Decomposition): number {
  const same = d.components.filter((c) => c.key !== "unexplained" && Math.sign(c.usd) === Math.sign(d.changeUsd));
  return same.reduce((a, c) => (Math.abs(c.usd) > Math.abs(a) ? c.usd : a), 0);
}

export function checkNumbers(text: string, facts: Record<string, string | number>, mustStateUsd: number): Verdict {
  const allowed = allowedNumbers(facts);
  const found = (text.match(NUMBER) ?? []).map((m) => Number(m.replaceAll(",", "")).toFixed(2));
  const strange = [...new Set(found.filter((n) => !allowed.has(n)))];
  const must = Math.abs(mustStateUsd).toFixed(2);
  const problems = [
    strange.length > 0 ? `uses ${strange.map((n) => n.replace(/\.00$/, "")).join(", ")}, which the agents did not compute` : null,
    found.includes(must) ? null : `leaves out the biggest reason, ${usd(mustStateUsd)}`,
    text.trim() === "" ? "is empty" : null,
    text.trim() !== "" && !/[.!?]["”)]?$/.test(text.trim()) ? "stops mid-sentence" : null,
  ].filter((p): p is string => p !== null);
  const accepted = problems.length === 0;
  const reason = accepted
    ? `All ${found.length} numbers in the explanation match the split of the change to the cent.`
    : `The explanation ${problems.join(" and ")}.`;
  return { check: "explanation_numbers", accepted, reason, gapUsd: 0 };
}

const LABEL: Readonly<Record<string, string>> = {
  days: "more days on this bill",
  usage: "more use at home",
  weather: "the weather",
  price: "a higher price per kWh",
};

/** The sentence used when the model is unavailable or its sentences fail check 6 twice. */
export function templateText(input: ExplainInput): string {
  const d = input.decomposition;
  const ups = d.components
    .filter((c) => c.key !== "unexplained" && Math.sign(c.usd) === Math.sign(d.changeUsd) && c.usd !== 0)
    .sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd))
    .slice(0, 2)
    .map((c) => `${LABEL[c.key] ?? c.key} (${usd(c.usd)})`);
  const why = ups.length > 0 ? `Most of the change came from ${ups.join(" and ")}.` : `The bill went from ${usd(d.fromUsd)} to ${usd(d.toUsd)}.`;
  const act = input.action ? ` ${input.action.name} could make it ${usd(input.action.usd)} a month.` : "";
  return `${why}${act}`;
}

export async function explainInWords(llm: LlmClient, logger: RunLogger, input: ExplainInput): Promise<Explained> {
  const facts = factsFor(input);
  const verdicts: Verdict[] = [];
  let feedback: string | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const user = `FACTS\n${JSON.stringify(facts, null, 1)}${feedback ? `\n\nYour last answer was sent back: ${feedback} Write it again.` : ""}`;
    let text: string;
    try {
      const reply = await llm.chat(AGENT, {
        model: EXPLAINER_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        maxTokens: MAX_TOKENS,
      });
      text = reply.text.replace(/\s+/g, " ").trim();
    } catch (error: unknown) {
      logger.log({ agent: AGENT, step: "fallback", reason: `No model reply: ${(error as Error).message.slice(0, 200)}` });
      return { text: templateText(input), source: "template", verdicts };
    }
    logger.log({ agent: AGENT, step: "wrote", attempt, text });
    const verdict = checkNumbers(text, facts, biggestReason(input.decomposition));
    verdicts.push(verdict);
    logVerdict(logger, verdict, AGENT, attempt);
    if (verdict.accepted) return { text, source: "model", verdicts };
    feedback = verdict.reason;
    if (attempt < ATTEMPTS) logger.log({ agent: "Orchestrator", step: "retry", target: AGENT, reason: verdict.reason, by: CRITIC });
  }
  logger.log({ agent: AGENT, step: "fallback", reason: "The explanation failed check 6 twice; the sentence is built from the numbers alone." });
  return { text: templateText(input), source: "template", verdicts };
}
