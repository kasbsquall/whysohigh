// Evaluation of the Explainer and critic check 6: Nemotron writes the summary for
// each of the 24 households without a billing error, from the split the agents
// accepted (eval/results/households.jsonl), and the critic checks every number.
// Counts how often the sentences passed on the first try, after one send-back,
// or fell back to the sentence built from the numbers.
//
//   npm run eval:explainer   (SAMPLE_MODE=true replays the recorded run)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { explainInWords, type ExplainInput } from "../src/agents/explainer.ts";
import type { Decomposition } from "../src/agents/usageAnalyst.ts";
import { createRuntime } from "../src/runtime.ts";
import type { EvalHousehold } from "./households.ts";
import type { Split } from "./metrics.ts";

const RESULTS = "eval/results";
const quiet = { echo: (): void => {} };

interface Graded {
  readonly id: string;
  readonly changeUsd: number;
  readonly agents: { readonly changeClosed: boolean; readonly split: Split | null };
}

const households = JSON.parse(readFileSync("eval/households.json", "utf8")) as EvalHousehold[];
const graded = readFileSync(`${RESULTS}/households.jsonl`, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Graded)
  .filter((g) => g.agents.changeClosed && g.agents.split !== null);

function inputOf(g: Graded): ExplainInput {
  const h = households.find((x) => x.id === g.id) as EvalHousehold;
  const [previous, current] = h.bills.slice(-2);
  const s = g.agents.split as Split;
  const decomposition = {
    fromUsd: h.previousBilledUsd,
    toUsd: h.billedUsd,
    changeUsd: g.changeUsd,
    components: (["price", "days", "weather", "usage", "unexplained"] as const).map((key) => ({ key, kwh: null, usd: s[key] })),
  } as unknown as Decomposition;
  return { previousKwh: previous.kwh, currentKwh: current.kwh, previousDays: previous.days, currentDays: current.days, decomposition, action: null };
}

const rows = [];
for (const g of graded) {
  const runtime = createRuntime(quiet);
  const out = await explainInWords(runtime.llm, runtime.logger, inputOf(g));
  const rejected = out.verdicts.filter((v) => !v.accepted).map((v) => v.reason);
  rows.push({ id: g.id, source: out.source, attempts: out.verdicts.length, rejected, text: out.text });
  if (!runtime.config.sampleMode) process.stderr.write(`  ${g.id} ${out.source} after ${out.verdicts.length}\n`);
}

const summary = {
  note: "Households without a billing error whose split the critic accepted. One run each, temperature 0.",
  households: rows.length,
  passedFirstTry: rows.filter((r) => r.source === "model" && r.attempts === 1).length,
  passedAfterSendBack: rows.filter((r) => r.source === "model" && r.attempts > 1).length,
  fellBackToNumbersOnly: rows.filter((r) => r.source === "template").length,
  sentBack: rows.filter((r) => r.rejected.length > 0).map((r) => ({ id: r.id, reasons: r.rejected })),
};
mkdirSync(RESULTS, { recursive: true });
writeFileSync(`${RESULTS}/explainer.json`, `${JSON.stringify({ summary, rows }, null, 2)}\n`, "utf8");
process.stdout.write(
  `Explainer on ${summary.households} households: ${summary.passedFirstTry} passed check 6 first, ` +
    `${summary.passedAfterSendBack} after one send-back, ${summary.fellBackToNumbersOnly} fell back. Results in ${RESULTS}/explainer.json.\n`,
);
