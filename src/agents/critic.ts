// ReconciliationCritic: checks the analysts' numbers against the bill and can
// reject them. Each check returns a verdict with its reason; nothing passes
// silently.

import type { RunLogger } from "../log.ts";
import type { RateEstimate } from "./rateAnalyst.ts";

export const AGENT = "ReconciliationCritic";

/** Check 1 tolerance: the recomputed bill must land within 2% of the billed total. */
export const RECOMPUTE_TOLERANCE = 0.02;

export interface Verdict {
  readonly check: string;
  readonly accepted: boolean;
  readonly reason: string;
  readonly gapUsd: number;
}

export function checkRecompute(estimate: RateEstimate, billedUsd: number): Verdict {
  const gapUsd = Math.round((billedUsd - estimate.charges.totalUsd) * 100) / 100;
  const share = billedUsd === 0 ? (gapUsd === 0 ? 0 : 1) : Math.abs(gapUsd) / Math.abs(billedUsd);
  const pct = (share * 100).toFixed(1);
  const accepted = share <= RECOMPUTE_TOLERANCE;
  const reason = accepted
    ? `Published tariff gives ${estimate.charges.totalUsd.toFixed(2)} USD, billed ${billedUsd.toFixed(2)} USD (${pct}% apart).`
    : `Published tariff gives ${estimate.charges.totalUsd.toFixed(2)} USD but the bill says ${billedUsd.toFixed(2)} USD: ` +
      `${Math.abs(gapUsd).toFixed(2)} USD (${pct}%) more than the ${RECOMPUTE_TOLERANCE * 100}% allowed.`;
  return { check: "bill_recompute", accepted, reason, gapUsd };
}

export function logVerdict(logger: RunLogger, verdict: Verdict, about: string, attempt: number): void {
  logger.log({ agent: AGENT, step: verdict.accepted ? "accepted" : "rejected", about, attempt, ...verdict });
}
