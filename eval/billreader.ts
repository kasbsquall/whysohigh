// BillReader evaluation: reads the 30 rendered evaluation bills
// (eval/bills/png/<id>.png) with the Nemotron vision model and compares every
// field with what eval/generate.ts printed on the bill. There is no text layer
// next to these images, so a vision failure counts as a failure instead of
// falling back to text.
//
//   npm run eval:generate && python scripts/render-bills.py
//   RECORD_SAMPLES=true npx tsx eval/billreader.ts   (live, records the replies)
//   SAMPLE_MODE=true npx tsx eval/billreader.ts      (replays the recording)
//
// These are clean renders of one synthetic layout, not phone photos of real
// AEP Ohio bills; the result says how well the model reads this layout only.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readBill, type Bill } from "../src/agents/billReader.ts";
import { SampleMissError } from "../src/cache.ts";
import { createRuntime } from "../src/runtime.ts";
import type { EvalHousehold } from "./households.ts";

const RESULTS = "eval/results";
const CONCURRENCY = 3;
const FIELDS = ["period_start", "period_end", "days", "kwh", "total_usd", "prev_kwh", "prev_days", "prev_total_usd", "line_items_sum"] as const;
type Field = (typeof FIELDS)[number];
type Values = Readonly<Record<Field, string | number | null>>;

const printed = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const cents = (n: number): number => Math.round(n * 100) / 100;

/** What the bill image says, from the same household data the HTML was written from. */
function truthOf(h: EvalHousehold): Values {
  const [previous, current] = h.bills.slice(-2);
  return {
    period_start: printed(current.periodStart),
    period_end: printed(current.periodEnd),
    days: current.days,
    kwh: current.kwh,
    total_usd: h.billedUsd,
    prev_kwh: previous.kwh,
    prev_days: previous.days,
    prev_total_usd: h.previousBilledUsd,
    line_items_sum: h.billedUsd,
  };
}

function valuesOf(bill: Bill): Values {
  return {
    period_start: bill.periodStart,
    period_end: bill.periodEnd,
    days: bill.days,
    kwh: bill.kwh,
    total_usd: bill.totalUsd,
    prev_kwh: bill.previous?.kwh ?? null,
    prev_days: bill.previous?.days ?? null,
    prev_total_usd: bill.previous?.totalUsd ?? null,
    line_items_sum: bill.lineItems.length > 0 ? cents(bill.lineItems.reduce((sum, item) => sum + item.usd, 0)) : null,
  };
}

interface Outcome {
  readonly id: string;
  readonly read: boolean;
  readonly failure?: string;
  readonly wrong: readonly { readonly field: Field; readonly expected: string | number | null; readonly got: string | number | null }[];
}

const households = JSON.parse(readFileSync("eval/households.json", "utf8")) as EvalHousehold[];
const runtime = createRuntime({ echo: (): void => {} });

async function evaluate(h: EvalHousehold): Promise<Outcome> {
  const image = `eval/bills/png/${h.id}.png`;
  if (!existsSync(image)) throw new Error(`${image} is missing. Run python scripts/render-bills.py first.`);
  try {
    const got = valuesOf(await readBill(runtime.llm, runtime.logger, image));
    const expected = truthOf(h);
    const wrong = FIELDS.filter((f) => got[f] !== expected[f]).map((field) => ({ field, expected: expected[field], got: got[field] }));
    runtime.logger.log({ agent: "BillReaderEval", step: "compared", eval: h.id, wrong });
    return { id: h.id, read: true, wrong };
  } catch (error: unknown) {
    if (error instanceof SampleMissError) throw error;
    const failure = (error as Error).message.slice(0, 300);
    runtime.logger.log({ agent: "BillReaderEval", step: "failed", eval: h.id, failure });
    return { id: h.id, read: false, failure, wrong: [] };
  }
}

const outcomes: Outcome[] = [];
for (let i = 0; i < households.length; i += CONCURRENCY) {
  try {
    outcomes.push(...(await Promise.all(households.slice(i, i + CONCURRENCY).map(evaluate))));
  } catch (error: unknown) {
    if (!(error instanceof SampleMissError)) throw error;
    process.stderr.write("BillReader replies for the evaluation bills are not recorded yet. Run it live with RECORD_SAMPLES=true.\n");
    process.exit(1);
  }
}

const read = outcomes.filter((o) => o.read);
const fieldAccuracy = Object.fromEntries(
  FIELDS.map((f) => [f, { correct: read.filter((o) => !o.wrong.some((w) => w.field === f)).length, of: outcomes.length }]),
);
const summary = {
  bills: outcomes.length,
  read: read.length,
  allFieldsCorrect: read.filter((o) => o.wrong.length === 0).length,
  fieldAccuracy,
  sampleMode: runtime.config.sampleMode,
  logFile: runtime.logger.file,
  note: "Clean renders of one synthetic bill layout (scripts/render-bills.py), not photos of real bills.",
  outcomes,
};
mkdirSync(RESULTS, { recursive: true });
writeFileSync(`${RESULTS}/billreader.json`, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
process.stdout.write(
  `BillReader: read ${read.length} of ${outcomes.length} bills, all fields right on ${summary.allFieldsCorrect}.\n` +
    FIELDS.map((f) => `  ${f.padEnd(15)} ${fieldAccuracy[f].correct}/${fieldAccuracy[f].of}`).join("\n") +
    `\nWrote ${RESULTS}/billreader.json\n`,
);
