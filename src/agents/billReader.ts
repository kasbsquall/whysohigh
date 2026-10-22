// BillReader: reads a bill image with a Nemotron vision model through
// Nightshift and returns the printed fields. It never fills a field that is
// not on the bill; a reply that fails validation is sent back once with the
// reason. If the vision endpoint fails, it falls back to the bill's text layer.

import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { NightshiftError, type ChatMessage, type LlmClient } from "../llm/nightshift.ts";
import type { RunLogger } from "../log.ts";

export const AGENT = "BillReader";
export const BILL_READER_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
export const BILL_TEXT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
const MAX_ATTEMPTS = 2;
// The VL model spends most of its budget reasoning before the JSON; 1,500
// tokens left a live run 4 tokens short of truncation.
const MAX_TOKENS = 4000;
const MAX_ECHO_CHARS = 2000;

export interface LineItem {
  readonly label: string;
  readonly usd: number;
}

export interface Bill {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly days: number;
  readonly kwh: number;
  readonly totalUsd: number;
  readonly previous: { readonly kwh: number; readonly days: number; readonly totalUsd: number } | null;
  readonly lineItems: readonly LineItem[];
}

const PROMPT =
  "Read this electricity bill. Return only JSON with keys: period_start, period_end (MM/DD/YYYY), " +
  "days, kwh, total_usd, prev_kwh, prev_days, prev_total_usd, line_items (list of {label, usd}). " +
  "Numbers without currency symbols or thousands separators. Use null for anything not printed on the bill.";

const MIME: Readonly<Record<string, string>> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

export function imageDataUrl(path: string): string {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error(`Unsupported bill file ${path}. Use a PNG or JPG image.`);
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;
const DATE = /^\d{2}\/\d{2}\/\d{4}$/;

const num = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,]/g, "").trim();
  return DECIMAL.test(cleaned) ? Number(cleaned) : null;
};

/** Day number of an MM/DD/YYYY date, or null when the date does not exist (02/30, 13/45). */
const calendarDay = (printed: string): number | null => {
  const [m, d, y] = printed.split("/").map(Number);
  const time = Date.UTC(y, m - 1, d);
  const date = new Date(time);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? time / 86_400_000 : null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Parses and validates the model reply. Throws with a reason the model can act on. */
export function parseBill(text: string): Bill {
  const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("The reply was not valid JSON.");
  }
  if (!isObject(raw)) throw new Error("The reply must be a single JSON object.");

  const required = { days: num(raw.days), kwh: num(raw.kwh), total_usd: num(raw.total_usd) };
  const missing = Object.entries(required).filter(([, v]) => v === null).map(([k]) => k);
  for (const key of ["period_start", "period_end"]) {
    if (typeof raw[key] !== "string" || !DATE.test(raw[key] as string)) missing.push(`${key} (MM/DD/YYYY)`);
  }
  if (missing.length > 0) throw new Error(`Missing or invalid fields: ${missing.join(", ")}.`);
  if ((required.days as number) <= 0 || (required.kwh as number) < 0) {
    throw new Error("days must be above 0 and kwh cannot be negative.");
  }
  const start = calendarDay(raw.period_start as string);
  const end = calendarDay(raw.period_end as string);
  if (start === null || end === null) throw new Error("period_start and period_end must be real calendar dates (MM/DD/YYYY).");
  if (end <= start) throw new Error("period_end must be after period_start.");
  if (end - start !== required.days) {
    throw new Error(`days is ${required.days} but the period dates are ${end - start} days apart. Check the dates and the day count.`);
  }

  const items = Array.isArray(raw.line_items) ? raw.line_items : [];
  const lineItems = items.map((item, i) => {
    const usd = isObject(item) ? num(item.usd) : null;
    if (!isObject(item) || typeof item.label !== "string" || usd === null) {
      throw new Error(`line_items[${i}] needs a label and a numeric usd.`);
    }
    return { label: item.label, usd };
  });

  const prev = { kwh: num(raw.prev_kwh), days: num(raw.prev_days), totalUsd: num(raw.prev_total_usd) };
  return {
    periodStart: raw.period_start as string,
    periodEnd: raw.period_end as string,
    days: required.days as number,
    kwh: required.kwh as number,
    totalUsd: required.total_usd as number,
    previous:
      prev.kwh !== null && prev.days !== null && prev.totalUsd !== null
        ? { kwh: prev.kwh, days: prev.days, totalUsd: prev.totalUsd }
        : null,
    lineItems,
  };
}

/** The text layer of a bill, kept next to the image as <name>.txt (sample bills ship with one). */
export const textLayerPath = (billPath: string): string => billPath.slice(0, -extname(billPath).length) + ".txt";

export async function readBill(llm: LlmClient, logger: RunLogger, billPath: string): Promise<Bill> {
  const vision: readonly ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: imageDataUrl(billPath) } },
      ],
    },
  ];
  try {
    return await extract(llm, logger, BILL_READER_MODEL, vision, billPath);
  } catch (error: unknown) {
    const textPath = textLayerPath(billPath);
    if (!(error instanceof NightshiftError) || !existsSync(textPath)) throw error;
    // Plan B: the vision endpoint is down, so read the bill's text layer with a
    // Nemotron text model. Fails closed when the bill has no text layer.
    logger.log({ agent: AGENT, step: "fallback_text", reason: error.message.slice(0, 200), textPath });
    const text: readonly ChatMessage[] = [
      { role: "user", content: `${PROMPT}\n\nBill text:\n${readFileSync(textPath, "utf8")}` },
    ];
    return extract(llm, logger, BILL_TEXT_MODEL, text, billPath);
  }
}

async function extract(
  llm: LlmClient,
  logger: RunLogger,
  model: string,
  initial: readonly ChatMessage[],
  billPath: string,
): Promise<Bill> {
  let messages = initial;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const reply = await llm.chat(AGENT, { model, messages, maxTokens: MAX_TOKENS });
    try {
      const bill = parseBill(reply.text);
      logger.log({ agent: AGENT, step: "extracted", attempt, model: reply.modelServed, bill });
      return bill;
    } catch (error: unknown) {
      const reason = (error as Error).message;
      logger.log({ agent: AGENT, step: "rejected_reply", attempt, reason, willRetry: attempt < MAX_ATTEMPTS });
      messages = [
        ...messages,
        { role: "assistant", content: reply.text.slice(0, MAX_ECHO_CHARS) },
        { role: "user", content: `${reason} Answer again with only the JSON object.` },
      ];
    }
  }
  throw new Error(`BillReader could not read ${billPath} after ${MAX_ATTEMPTS} attempts.`);
}
