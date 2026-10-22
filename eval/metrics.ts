// Scoring for the evaluation: dollar error per component against the known truth,
// whether the biggest cause is the right one, and billing error detection.

export const PARTS = ["price", "days", "weather", "usage", "unexplained"] as const;
export type Part = (typeof PARTS)[number];
/** A dollar change split into its parts. */
export type Split = Readonly<Record<Part, number>>;

/** The causes a household can act on or understand; "unexplained" is never a cause. */
const CAUSE_PARTS: readonly Part[] = ["price", "days", "weather", "usage"];

const cents = (n: number): number => Math.round(n * 100) / 100;

export function splitOf(components: readonly { readonly key: string; readonly usd: number }[]): Split {
  const usd = (key: Part): number => components.find((c) => c.key === key)?.usd ?? 0;
  return { price: usd("price"), days: usd("days"), weather: usd("weather"), usage: usd("usage"), unexplained: usd("unexplained") };
}

/** Four parts as a model gave them; whatever they leave of the change is unexplained. */
export function splitWithRemainder(parts: Omit<Split, "unexplained">, changeUsd: number): Split {
  const sum = parts.price + parts.days + parts.weather + parts.usage;
  return { ...parts, unexplained: cents(changeUsd - sum) };
}

/** The cause with the most dollars, in either direction. */
export function mainCause(split: Split): Part {
  return CAUSE_PARTS.reduce((best, part) => (Math.abs(split[part]) > Math.abs(split[best]) ? part : best));
}

export const absErrors = (estimate: Split, truth: Split): Split =>
  Object.fromEntries(PARTS.map((p) => [p, cents(Math.abs(estimate[p] - truth[p]))])) as Split;

export const totalError = (estimate: Split, truth: Split): number =>
  cents(PARTS.reduce((s, p) => s + Math.abs(estimate[p] - truth[p]), 0));

export const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : cents(values.reduce((s, v) => s + v, 0) / values.length);

export interface Scored {
  /** Answers scored; a method that gave no split for a household is counted apart. */
  readonly answered: number;
  readonly unanswered: number;
  readonly meanAbsErrorUsd: Split | null;
  readonly meanTotalErrorUsd: number | null;
  readonly mainCauseRight: number;
}

export function score(pairs: readonly { readonly estimate: Split | null; readonly truth: Split }[]): Scored {
  const answered = pairs.filter((p): p is { estimate: Split; truth: Split } => p.estimate !== null);
  const errors = answered.map((p) => absErrors(p.estimate, p.truth));
  return {
    answered: answered.length,
    unanswered: pairs.length - answered.length,
    meanAbsErrorUsd:
      errors.length === 0 ? null : (Object.fromEntries(PARTS.map((p) => [p, mean(errors.map((e) => e[p]))])) as Split),
    meanTotalErrorUsd: mean(answered.map((p) => totalError(p.estimate, p.truth))),
    mainCauseRight: answered.filter((p) => mainCause(p.estimate) === mainCause(p.truth)).length,
  };
}

export interface Detection {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly trueNegatives: number;
  /** Null when nothing was flagged. */
  readonly precision: number | null;
  readonly recall: number | null;
}

export function detection(cases: readonly { readonly actual: boolean; readonly flagged: boolean }[]): Detection {
  const count = (actual: boolean, flagged: boolean): number => cases.filter((c) => c.actual === actual && c.flagged === flagged).length;
  const tp = count(true, true);
  const fp = count(false, true);
  const fn = count(true, false);
  const ratio = (a: number, b: number): number | null => (a + b === 0 ? null : Math.round((a / (a + b)) * 1000) / 1000);
  return { truePositives: tp, falsePositives: fp, falseNegatives: fn, trueNegatives: count(false, false), precision: ratio(tp, fp), recall: ratio(tp, fn) };
}

const NUMBER = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.replace(/[$,]/g, "").trim())) return Number(v.replace(/[$,]/g, "").trim());
  return null;
};

export interface BaselineAnswer {
  readonly parts: Omit<Split, "unexplained">;
  readonly suspected: boolean;
  readonly errorUsd: number | null;
}

/** Reads the bill-only baseline's JSON. Throws with the reason when it is not usable. */
export function parseBaselineReply(text: string): BaselineAnswer {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in the reply.");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("The reply's JSON does not parse.");
  }
  const parts = {
    price: NUMBER(raw.price_usd),
    days: NUMBER(raw.days_usd),
    weather: NUMBER(raw.weather_usd),
    usage: NUMBER(raw.usage_usd),
  };
  const missing = Object.entries(parts).filter(([, v]) => v === null).map(([k]) => `${k}_usd`);
  if (missing.length > 0) throw new Error(`Missing or non-numeric: ${missing.join(", ")}.`);
  if (typeof raw.billing_error_suspected !== "boolean") throw new Error("billing_error_suspected must be true or false.");
  return {
    parts: parts as Omit<Split, "unexplained">,
    suspected: raw.billing_error_suspected,
    errorUsd: NUMBER(raw.billing_error_usd),
  };
}
