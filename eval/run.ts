// Evaluation: the agents against the known truth of the 30 synthetic households
// in eval/households.json, next to three baselines:
//   (a) "it was the weather": the whole change goes to weather;
//   (b) Nemotron with the bill only: the bill's text and no tools, k = 3 repetitions;
//   (c) Nemotron with the agents' data: the bill, the published tariffs and the
//       household's bill history with NOAA degree days, k = 3 repetitions.
// The truth is the same dollar accounting the agents use (price from the
// published tariff, then days, weather and usage in waterfall order) applied with
// the household's true weather response, which the agents never see. What the
// evaluation measures is how well the agents recover that response from 12 noisy
// bills, and whether the critic catches a bill that does not match the tariff.
//
//   npm run eval   (SAMPLE_MODE=true replays the recorded run; results are deterministic)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Bill } from "../src/agents/billReader.ts";
import { loadTariffs, priceEffect } from "../src/agents/rateAnalyst.ts";
import { decompose } from "../src/agents/usageAnalyst.ts";
import type { WeatherModel } from "../src/agents/weatherAnalyst.ts";
import { SampleMissError } from "../src/cache.ts";
import { analyzeChange } from "../src/changeAnalysis.ts";
import { analyzeRate, ORCHESTRATOR } from "../src/pipeline.ts";
import { createRuntime } from "../src/runtime.ts";
import type { Tariff } from "../src/tariff/tariff.ts";
import { billWeather, type BillWeather } from "../src/zetaris/queries.ts";
import type { Cause, EvalHousehold } from "./households.ts";
import { createLlmClient, type ChatMessage, type LlmClient } from "../src/llm/nightshift.ts";
import type { Runtime } from "../src/runtime.ts";
import { detection, parseBaselineReply, score, splitOf, splitWithRemainder, type BaselineAnswer, type Split } from "./metrics.ts";

const K = 3;
const RESULTS = "eval/results";
export const BASELINE_AGENT = "BillOnlyBaseline";
/** The strongest Nemotron text model Nightshift serves, so the baseline is not a weak one. */
export const BASELINE_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
const BASELINE_MAX_TOKENS = 8000;
const BASELINE_TEMPERATURE = 0.6;
const CONCURRENCY = 5;
export const BASELINE_PROMPT =
  "You are given an electricity bill from AEP Ohio, a residential customer in Columbus, Ohio. " +
  "Explain why the amount due changed from last month's bill. Split the dollar change (this bill's total minus last month's total) " +
  "into four parts that add up to it: price_usd (changes in the utility's rates between the two billing periods), " +
  "days_usd (a longer or shorter billing period), weather_usd (hotter or colder weather), " +
  "usage_usd (the household itself using more or less). Also say whether you suspect a billing error and, if so, how many dollars. " +
  "Return only a JSON object with keys price_usd, days_usd, weather_usd, usage_usd, " +
  "billing_error_suspected (true or false) and billing_error_usd (number or null).";

export const INFORMED_AGENT = "InformedBaseline";
export const INFORMED_PROMPT =
  `${BASELINE_PROMPT} You also get the data the agents get: the AEP Ohio residential tariffs published in OpenEI URDB that ` +
  "cover the bills (fixed monthly charge, and per-kWh rate plus adjustment for each tier), and the household's bill history " +
  "with cooling and heating degree days (base 65 F) for each bill from NOAA's Columbus airport station.";

const quiet = { echo: (): void => {} };
const cents = (n: number): number => Math.round(n * 100) / 100;
const printed = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const changeOf = (h: EvalHousehold): number => cents(h.billedUsd - h.previousBilledUsd);

interface PipelineOutcome {
  readonly rateClosed: boolean;
  readonly rateStrategy: string;
  readonly rateAttempts: number;
  readonly possibleBillingErrorUsd: number | null;
  readonly changeClosed: boolean;
  readonly skipped: string | null;
  /** Did the first closure check pass, before any calibration? Null when no split was tried. */
  readonly firstClosureAccepted: boolean | null;
  readonly weatherModelRejections: number;
  readonly modelSource: string | null;
  readonly usageStrategy: string | null;
  readonly split: Split | null;
}

async function runPipeline(h: EvalHousehold, tariffs: readonly Tariff[]): Promise<{ outcome: PipelineOutcome; history: readonly BillWeather[] }> {
  const runtime = createRuntime(quiet);
  runtime.logger.log({ agent: ORCHESTRATOR, step: "start", eval: h.id, cause: h.cause, sampleMode: runtime.config.sampleMode });
  const history = await billWeather(runtime.sql, "WeatherAnalyst", h.id);
  const [previous, current] = h.bills.slice(-2);
  // The fields BillReader would extract; reading is not what this evaluation measures.
  const bill: Bill = {
    periodStart: printed(current.periodStart),
    periodEnd: printed(current.periodEnd),
    days: current.days,
    kwh: current.kwh,
    totalUsd: h.billedUsd,
    previous: { kwh: previous.kwh, days: previous.days, totalUsd: h.previousBilledUsd },
    lineItems: [],
  };
  const rate = analyzeRate(runtime, tariffs, bill, history);
  const change = analyzeChange(runtime, tariffs, bill, history, rate);
  const closures = change.verdicts.filter((v) => v.check === "closure");
  const d = change.decomposition;
  runtime.logger.log({ agent: ORCHESTRATOR, step: "done", eval: h.id });
  return {
    history,
    outcome: {
      rateClosed: rate.closed,
      rateStrategy: rate.estimate.strategy,
      rateAttempts: rate.verdicts.length,
      possibleBillingErrorUsd: rate.possibleBillingErrorUsd,
      changeClosed: change.closed,
      skipped: change.skipped,
      firstClosureAccepted: closures.length === 0 ? null : closures[0].accepted,
      weatherModelRejections: change.verdicts.filter((v) => v.check === "weather_model" && !v.accepted).length,
      modelSource: d?.model.source ?? null,
      usageStrategy: d?.usageStrategy ?? null,
      split: d ? splitOf(d.components) : null,
    },
  };
}

/** The split with the household's true weather response, calibrated to its previous bill; null for a billing error. */
function truthOf(h: EvalHousehold, tariffs: readonly Tariff[], history: readonly BillWeather[]): Split | null {
  if (h.cause === "billing_error") return null;
  const [previous, current] = h.bills.slice(-2);
  const side = (start: string): BillWeather => {
    const found = history.find((b) => b.periodStart === start);
    if (!found) throw new Error(`${h.id}: no bill starting ${start} in the database.`);
    return found;
  };
  const model: WeatherModel = { source: "household_fit", calibrationPerDay: 0, ...h.model, r2: null, billsUsed: 0, confidence: "fitted" };
  const p = { start: previous.periodStart, end: previous.periodEnd };
  const c = { start: current.periodStart, end: current.periodEnd };
  const price = priceEffect(tariffs, p, c, previous.kwh, "prorated");
  const d = decompose(
    tariffs,
    "prorated",
    price,
    model,
    { bill: side(previous.periodStart), billedUsd: h.previousBilledUsd },
    { bill: side(current.periodStart), billedUsd: h.billedUsd },
    "calibrated",
  );
  return splitOf(d.components);
}

/** The bill text plus the tariffs and history the agents read through Zetaris. */
function informedContent(h: EvalHousehold, tariffs: readonly Tariff[], history: readonly BillWeather[]): string {
  const first = history[0]?.periodStart ?? "";
  const last = history.at(-1)?.periodEnd ?? "";
  const covering = tariffs
    .filter((t) => t.approved && t.start < last && (t.end === null || t.end >= first))
    .map((t) => ({ name: t.label, start: t.start, end: t.end, fixedMonthlyUsd: t.fixedMonthlyUsd, tiers: t.tiers }));
  const bills = history.map((b) => ({ periodStart: b.periodStart, periodEnd: b.periodEnd, days: b.days, kwh: b.kwh, cdd: b.cdd, hdd: b.hdd }));
  return `${INFORMED_PROMPT}\n\nBill text:\n${h.billText}\n\nTariffs:\n${JSON.stringify(covering)}\n\nBill history with degree days:\n${JSON.stringify(bills)}`;
}

interface BaselineRecord {
  readonly id: string;
  readonly repeat: number;
  readonly split: Split | null;
  readonly suspected: boolean | null;
  readonly errorUsd: number | null;
  readonly failure: string | null;
}

/**
 * A live run first reuses a good recording of the same request (logged with source "sample"),
 * so an interrupted evaluation resumes instead of asking the model again.
 */
function resumable(runtime: Runtime): LlmClient {
  if (runtime.config.sampleMode) return runtime.llm;
  const replay = createLlmClient({ config: { ...runtime.config, sampleMode: true, recordSamples: false }, cache: runtime.cache, logger: runtime.logger });
  return {
    chat: async (agent, request) => {
      try {
        return await replay.chat(agent, request);
      } catch {
        return runtime.llm.chat(agent, request);
      }
    },
  };
}

/** Like BillReader, a reply that is not the JSON asked for is sent back once with the reason. */
async function baselineAnswer(runtime: Runtime, agent: string, content: string, h: EvalHousehold, repeat: number): Promise<BaselineAnswer> {
  const llm = resumable(runtime);
  let messages: ChatMessage[] = [{ role: "user", content }];
  for (let attempt = 1; ; attempt++) {
    const reply = await llm.chat(agent, {
      model: BASELINE_MODEL,
      messages,
      maxTokens: BASELINE_MAX_TOKENS,
      temperature: BASELINE_TEMPERATURE,
      repeat,
    });
    try {
      return parseBaselineReply(reply.text);
    } catch (error: unknown) {
      const reason = (error as Error).message;
      runtime.logger.log({ agent, step: "rejected_reply", eval: h.id, repeat, attempt, reason });
      if (attempt === 2) throw error;
      messages = [
        ...messages,
        { role: "assistant", content: reply.text.slice(0, 2000) },
        { role: "user", content: `${reason} Answer again with only the JSON object.` },
      ];
    }
  }
}

async function askBaseline(agent: string, content: string, h: EvalHousehold, repeat: number): Promise<BaselineRecord> {
  const runtime = createRuntime(quiet);
  try {
    const answer = await baselineAnswer(runtime, agent, content, h, repeat);
    runtime.logger.log({ agent, step: "answer", eval: h.id, repeat, answer });
    return { id: h.id, repeat, split: splitWithRemainder(answer.parts, changeOf(h)), suspected: answer.suspected, errorUsd: answer.errorUsd, failure: null };
  } catch (error: unknown) {
    if (error instanceof SampleMissError) throw error;
    const failure = (error as Error).message.slice(0, 200);
    runtime.logger.log({ agent, step: "no_answer", eval: h.id, repeat, failure });
    return { id: h.id, repeat, split: null, suspected: null, errorUsd: null, failure };
  }
}

async function pool<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]);
      }
    }),
  );
  return out;
}

const households = JSON.parse(readFileSync("eval/households.json", "utf8")) as EvalHousehold[];
const setup = createRuntime(quiet);
const tariffs = await loadTariffs(setup.sql);
process.stderr.write(`Evaluating ${households.length} households (${setup.config.sampleMode ? "sample mode" : "live"}).\n`);

// The agents' reasoning is deterministic given its inputs; running it K times checks that.
const pipeline = new Map<string, { outcome: PipelineOutcome; truth: Split | null; identicalAcrossRuns: boolean; history: readonly BillWeather[] }>();
for (const h of households) {
  const runs = [];
  for (let k = 0; k < K; k++) runs.push(await runPipeline(h, tariffs));
  const shown = runs.map((r) => JSON.stringify(r.outcome));
  pipeline.set(h.id, { outcome: runs[0].outcome, truth: truthOf(h, tariffs, runs[0].history), identicalAcrossRuns: shown.every((s) => s === shown[0]), history: runs[0].history });
}
process.stderr.write("Agents done. Asking the bill-only baseline.\n");

const jobs = households.flatMap((h) => Array.from({ length: K }, (_, k) => ({ h, repeat: k + 1 })));
let finished = 0;
const baseline = await pool(jobs, CONCURRENCY, async ({ h, repeat }) => {
  const record = await askBaseline(BASELINE_AGENT, `${BASELINE_PROMPT}\n\nBill text:\n${h.billText}`, h, repeat);
  finished += 1;
  if (!setup.config.sampleMode) process.stderr.write(`  baseline ${finished}/${jobs.length} ${h.id} #${repeat}${record.failure ? " no answer" : ""}\n`);
  return record;
});

process.stderr.write("Asking the baseline with the agents' data.\n");
finished = 0;
const informed = await pool(jobs, CONCURRENCY, async ({ h, repeat }) => {
  const record = await askBaseline(INFORMED_AGENT, informedContent(h, tariffs, pipeline.get(h.id)?.history ?? []), h, repeat);
  finished += 1;
  if (!setup.config.sampleMode) process.stderr.write(`  informed ${finished}/${jobs.length} ${h.id} #${repeat}${record.failure ? " no answer" : ""}\n`);
  return record;
});

const weatherOnly = (h: EvalHousehold): Split => ({ price: 0, days: 0, weather: changeOf(h), usage: 0, unexplained: 0 });

function scores(group: readonly EvalHousehold[]) {
  const truth = (h: EvalHousehold): Split => pipeline.get(h.id)?.truth as Split;
  return {
    households: group.length,
    agents: score(group.map((h) => ({ estimate: pipeline.get(h.id)?.outcome.split ?? null, truth: truth(h) }))),
    weatherOnly: score(group.map((h) => ({ estimate: weatherOnly(h), truth: truth(h) }))),
    billOnly: score(group.flatMap((h) => baseline.filter((b) => b.id === h.id).map((b) => ({ estimate: b.split, truth: truth(h) })))),
    informed: score(group.flatMap((h) => informed.filter((b) => b.id === h.id).map((b) => ({ estimate: b.split, truth: truth(h) })))),
  };
}

const graded = households.filter((h) => h.cause !== "billing_error");
const outcomes = graded.map((h) => pipeline.get(h.id)?.outcome as PipelineOutcome);
const answeredBaseline = baseline.filter((b) => b.suspected !== null);
const answeredInformed = informed.filter((b) => b.suspected !== null);
const isError = (id: string): boolean => (households.find((h) => h.id === id) as EvalHousehold).overchargeUsd !== 0;
const summary = {
  households: households.length,
  repetitions: K,
  baselineModel: BASELINE_MODEL,
  informedNote: "Same model and prompt as the bill-only baseline, plus the published tariffs and the bill history with NOAA degree days.",
  truthDefinition:
    "Price from the published tariff, then days, weather and usage in waterfall order, with the household's true weather response calibrated to its previous bill.",
  split: {
    note: "The 24 households without a billing error. Bill-only answers are pooled over the repetitions.",
    all: scores(graded),
    byCause: Object.fromEntries((["price", "days", "weather", "usage"] as const satisfies readonly Cause[]).map((c) => [c, scores(graded.filter((h) => h.cause === c))])),
    byHeating: { gas: scores(graded.filter((h) => h.heating === "gas")), electric: scores(graded.filter((h) => h.heating === "electric")) },
    byAgentsConfidence: {
      note: "Grouped by the confidence the agents report: fitted on the household's bills, or low on the Ohio prior after the critic rejected the fit.",
      fitted: scores(graded.filter((h) => pipeline.get(h.id)?.outcome.modelSource === "household_fit")),
      low: scores(graded.filter((h) => pipeline.get(h.id)?.outcome.modelSource === "ohio_prior")),
    },
  },
  critic: {
    note: "The 24 households without a billing error.",
    billMatchesTariff: outcomes.filter((o) => o.rateClosed).length,
    rateAnalystRetried: outcomes.filter((o) => o.rateAttempts > 1).length,
    firstClosureAccepted: outcomes.filter((o) => o.firstClosureAccepted === true).length,
    changeClosed: outcomes.filter((o) => o.changeClosed).length,
    weatherModelRejected: outcomes.filter((o) => o.weatherModelRejections > 0).length,
    modelSource: {
      household_fit: outcomes.filter((o) => o.modelSource === "household_fit").length,
      ohio_prior: outcomes.filter((o) => o.modelSource === "ohio_prior").length,
      none: outcomes.filter((o) => o.modelSource === null).length,
    },
  },
  billingErrors: {
    note: "All 30 households; 6 have a billing error, one of them (1%) under the critic's 2% tolerance on purpose.",
    agents: detection(households.map((h) => ({ actual: h.overchargeUsd !== 0, flagged: pipeline.get(h.id)?.outcome.possibleBillingErrorUsd !== null }))),
    billOnly: {
      answers: answeredBaseline.length,
      noAnswer: baseline.length - answeredBaseline.length,
      ...detection(
        answeredBaseline.map((b) => ({ actual: (households.find((h) => h.id === b.id) as EvalHousehold).overchargeUsd !== 0, flagged: b.suspected === true })),
      ),
    },
    informed: {
      answers: answeredInformed.length,
      noAnswer: informed.length - answeredInformed.length,
      ...detection(answeredInformed.map((b) => ({ actual: isError(b.id), flagged: b.suspected === true }))),
    },
    cases: households
      .filter((h) => h.overchargeUsd !== 0)
      .map((h) => ({
        id: h.id,
        injectedUsd: h.overchargeUsd,
        agentsFlaggedUsd: pipeline.get(h.id)?.outcome.possibleBillingErrorUsd ?? null,
        billOnlyFlagged: baseline.filter((b) => b.id === h.id && b.suspected === true).length,
        informedFlagged: informed.filter((b) => b.id === h.id && b.suspected === true).length,
      })),
  },
  deterministic: [...pipeline.values()].every((p) => p.identicalAcrossRuns),
};

mkdirSync(RESULTS, { recursive: true });
const jsonl = (rows: readonly unknown[]): string => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
writeFileSync(
  `${RESULTS}/households.jsonl`,
  jsonl(
    households.map((h) => {
      const p = pipeline.get(h.id);
      return { id: h.id, cause: h.cause, heating: h.heating, injected: h.injected, changeUsd: changeOf(h), truth: p?.truth, agents: p?.outcome, identicalAcrossRuns: p?.identicalAcrossRuns };
    }),
  ),
  "utf8",
);
writeFileSync(`${RESULTS}/bill-only-baseline.jsonl`, jsonl(baseline), "utf8");
writeFileSync(`${RESULTS}/informed-baseline.jsonl`, jsonl(informed), "utf8");
writeFileSync(`${RESULTS}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const fmt = (n: number | null | undefined): string => (n === null || n === undefined ? "-" : n.toFixed(2));
const line = (name: string, s: ReturnType<typeof score>): string =>
  `  ${name.padEnd(12)} answered ${String(s.answered).padStart(2)}  total error ${fmt(s.meanTotalErrorUsd).padStart(6)} USD  ` +
  `main cause right ${s.mainCauseRight}/${s.answered}  ` +
  `(price ${fmt(s.meanAbsErrorUsd?.price)}, days ${fmt(s.meanAbsErrorUsd?.days)}, weather ${fmt(s.meanAbsErrorUsd?.weather)}, usage ${fmt(s.meanAbsErrorUsd?.usage)}, unexplained ${fmt(s.meanAbsErrorUsd?.unexplained)})`;
const all = summary.split.all;
process.stdout.write(
  [
    `Split of the change, ${all.households} households, mean error per household in USD:`,
    line("agents", all.agents),
    line("weather only", all.weatherOnly),
    line("bill only", all.billOnly),
    line("informed", all.informed),
    line("agents, fitted", summary.split.byAgentsConfidence.fitted.agents),
    line("agents, low", summary.split.byAgentsConfidence.low.agents),
    `Critic: bill matches tariff ${summary.critic.billMatchesTariff}/24, first closure ${summary.critic.firstClosureAccepted}/24, closed ${summary.critic.changeClosed}/24, weather model rejected ${summary.critic.weatherModelRejected}/24.`,
    `Billing errors: agents precision ${fmt(summary.billingErrors.agents.precision)} recall ${fmt(summary.billingErrors.agents.recall)}; ` +
      `bill only precision ${fmt(summary.billingErrors.billOnly.precision)} recall ${fmt(summary.billingErrors.billOnly.recall)} over ${summary.billingErrors.billOnly.answers} answers; ` +
      `informed precision ${fmt(summary.billingErrors.informed.precision)} recall ${fmt(summary.billingErrors.informed.recall)} over ${summary.billingErrors.informed.answers} answers.`,
    `Agents identical across ${K} runs: ${summary.deterministic}. Results in ${RESULTS}/.`,
    "",
  ].join("\n"),
);
