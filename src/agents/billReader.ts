// BillReader: reads a bill image with a Nemotron vision model through
// Nightshift and returns the printed fields. It never fills a field that is
// not on the bill; a reply that fails validation is sent back once with the
// reason.

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { ChatMessage, LlmClient } from "../llm/nightshift.ts";
import type { RunLogger } from "../log.ts";

export const AGENT = "BillReader";
export const BILL_READER_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
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

export async function readBill(llm: LlmClient, logger: RunLogger, billPath: string): Promise<Bill> {
  let messages: readonly ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: imageDataUrl(billPath) } },
      ],
    },
  ];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const reply = await llm.chat(AGENT, { model: BILL_READER_MODEL, messages, maxTokens: MAX_TOKENS });
    try {
      const bill = parseBill(reply.text);
      logger.log({ agent: AGENT, step: "extracted", attempt, bill });
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
