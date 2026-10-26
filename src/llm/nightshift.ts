// Model calls through Meterless Nightshift, the app's primary AI provider.
// OpenAI-compatible chat completions on the local runtime. The model that
// actually answered is read from the response and logged, because the router
// can serve a different model than the one requested.

import type { Config } from "../config.ts";
import type { ResponseCache } from "../cache.ts";
import type { RunLogger } from "../log.ts";

export type ContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image_url"; readonly image_url: { readonly url: string } };

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string | readonly ContentPart[];
}

export interface ChatRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Repetition number in an evaluation. Part of the recorded key so each repetition is replayed; never sent. */
  readonly repeat?: number;
}

/**
 * The part of Meterless's compute receipt (schema meterless.compute_receipt.v1) the
 * run log keeps: which route answered, how many lanes raced, and the cross-checks.
 */
export interface ComputeReceipt {
  readonly receiptId: string;
  readonly requestedModel: string;
  readonly routedModel: string;
  readonly route: string;
  readonly consensus: string;
  readonly raced: number | null;
  readonly crossChecks: readonly string[];
  readonly privacy: string;
  readonly costUsd: number | null;
  readonly latencyMs: number | null;
}

export interface ChatResult {
  readonly text: string;
  readonly reasoning: string;
  readonly modelRequested: string;
  readonly modelServed: string;
  readonly usage?: Readonly<Record<string, number>>;
  readonly receipt?: ComputeReceipt;
}

export interface LlmClient {
  chat(agent: string, request: ChatRequest): Promise<ChatResult>;
}

const TIMEOUT_MS = 240_000;
const THINK_END = "</think>";

/** status is the HTTP status, or 0 when the reply arrived but is unusable. */
export class NightshiftError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NightshiftError";
  }
}

const redact = (text: string, secret: string): string => (secret ? text.replaceAll(secret, "[redacted]") : text);

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Keeps the receipt fields worth tracing; undefined when the reply carries no Meterless receipt. */
export function readReceipt(meterless: unknown): ComputeReceipt | undefined {
  const m = obj(meterless);
  if (typeof m.receipt_id !== "string") return undefined;
  const route = obj(m.winning_route);
  const receipt = obj(m.receipt);
  const consensus = obj(receipt.consensus);
  const checks = obj(receipt.cross_check).checks;
  return {
    receiptId: m.receipt_id,
    requestedModel: str(m.requested_model),
    routedModel: str(m.routed_model),
    route: [str(route.label), str(route.kind)].filter(Boolean).join(", "),
    consensus: str(consensus.label) || str(consensus.level),
    raced: num(consensus.raced),
    crossChecks: (Array.isArray(checks) ? checks : [])
      .map(obj)
      .map((c) => `${str(c.type)} ${str(c.status)}`.trim())
      .filter(Boolean),
    privacy: str(obj(m.privacy).path),
    costUsd: num(obj(m.cost).actual_usd),
    latencyMs: num(obj(m.usage).latency_ms),
  };
}

/** Splits a completion into the reasoning trace and the final answer. */
export function splitReasoning(content: string): { text: string; reasoning: string } {
  const at = content.lastIndexOf(THINK_END);
  if (at === -1) return { text: content.trim(), reasoning: "" };
  const reasoning = content.slice(0, at).replace(/^\s*<think>/, "").trim();
  return { text: content.slice(at + THINK_END.length).trim(), reasoning };
}

export async function callNightshift(
  config: Config["meterless"],
  request: ChatRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatResult> {
  const maxTokens = request.maxTokens ?? 1200;
  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "meterless-app": "whysohigh",
      "meterless-scope": "user",
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: maxTokens,
      temperature: request.temperature ?? 0,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = redact(await response.text(), config.token).slice(0, 300);
    throw new NightshiftError(response.status, `Nightshift returned HTTP ${response.status} for ${request.model}: ${detail}`);
  }
  const body = (await response.json()) as {
    model?: string;
    usage?: Record<string, number>;
    meterless?: unknown;
    choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  };
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new NightshiftError(0, `Nightshift output for ${request.model} was cut at max_tokens (${maxTokens}).`);
  }
  const content = choice?.message?.content;
  if (typeof content !== "string") {
    throw new NightshiftError(0, `Nightshift returned no message content for ${request.model}.`);
  }
  return {
    ...splitReasoning(content),
    modelRequested: request.model,
    modelServed: body.model ?? "unknown",
    usage: body.usage,
    receipt: readReceipt(body.meterless),
  };
}

export interface LlmDeps {
  readonly config: Config;
  readonly cache: ResponseCache;
  readonly logger: RunLogger;
  readonly fetchImpl?: typeof fetch;
  readonly backoffMs?: readonly number[];
}

// Upstream provider errors (HTTP 5xx) are often transient: the NVIDIA VL
// endpoint once answered "multimodal processing is not enabled" and worked
// on the next call. Client errors are not retried.
const BACKOFF_MS = [3_000, 10_000];
// Seen on 22 Oct: the NVIDIA VL endpoint kept answering "multimodal processing
// is not enabled" (as a 502) for every call for over ten minutes, so retrying
// that one only adds minutes before the caller's fallback.
const NOT_RETRYABLE = /multimodal processing is not enabled/i;
const isTransient = (error: unknown): boolean =>
  error instanceof NightshiftError && error.status >= 500 && !NOT_RETRYABLE.test(error.message);

async function callWithRetry(deps: LlmDeps, agent: string, request: ChatRequest): Promise<ChatResult> {
  const backoff = deps.backoffMs ?? BACKOFF_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return await callNightshift(deps.config.meterless, request, deps.fetchImpl);
    } catch (error: unknown) {
      if (attempt >= backoff.length || !isTransient(error)) throw error;
      deps.logger.log({
        agent,
        step: "provider_retry",
        attempt: attempt + 1,
        waitMs: backoff[attempt],
        reason: (error as Error).message.slice(0, 200),
      });
      await new Promise((resolve) => setTimeout(resolve, backoff[attempt]));
    }
  }
}

// Provider failures are recorded too, so SAMPLE_MODE replays the same path
// (for example the text-layer fallback when the vision endpoint is down).
interface RecordedFailure {
  readonly providerError: { readonly status: number; readonly message: string };
}
type Recorded = ChatResult | RecordedFailure;

async function liveOrRecorded(deps: LlmDeps, agent: string, request: ChatRequest): Promise<Recorded> {
  if (deps.config.sampleMode) return deps.cache.read<Recorded>("llm", request);
  try {
    return await callWithRetry(deps, agent, request);
  } catch (error: unknown) {
    if (!(error instanceof NightshiftError)) throw error;
    return { providerError: { status: error.status, message: error.message } };
  }
}

// A transient failure while re-recording must not replace a good answer.
function hasGoodRecording(cache: ResponseCache, request: ChatRequest): boolean {
  try {
    return !("providerError" in cache.read<Recorded>("llm", request));
  } catch {
    return false;
  }
}

/** Live, recording or replaying client depending on SAMPLE_MODE and RECORD_SAMPLES. */
export function createLlmClient(deps: LlmDeps): LlmClient {
  const { config, cache, logger } = deps;
  return {
    async chat(agent: string, request: ChatRequest): Promise<ChatResult> {
      const started = Date.now();
      const source = config.sampleMode ? "sample" : "live";
      const result = await liveOrRecorded(deps, agent, request);
      if (config.recordSamples && !("providerError" in result && hasGoodRecording(cache, request))) {
        cache.write("llm", request, result);
      }
      if ("providerError" in result) {
        const { status, message } = result.providerError;
        logger.log({ agent, step: "model_call_failed", source, modelRequested: request.model, status, latencyMs: Date.now() - started });
        throw new NightshiftError(status, message);
      }
      logger.log({
        agent,
        step: "model_call",
        source,
        modelRequested: result.modelRequested,
        modelServed: result.modelServed,
        latencyMs: Date.now() - started,
        usage: result.usage,
        ...(result.receipt ? { receipt: result.receipt } : {}),
      });
      return result;
    },
  };
}
