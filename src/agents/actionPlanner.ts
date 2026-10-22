// ActionPlanner: proposes what the household can do this month, each with a dollar
// amount and the exact next step. It proposes from need (the bill, the split of the
// change, a billing gap); it does not judge eligibility. ReconciliationCritic check 4
// does that, so a proposal the household cannot take is rejected with its reason.

import type { RateResult } from "../pipeline.ts";
import type { ChangeResult } from "../changeAnalysis.ts";
import type { RunLogger } from "../log.ts";
import {
  HEAP_MAX_USD,
  HEAP_MIN_USD,
  HEAP_PIPP_CUT,
  PIPP_MIN_MONTHLY_USD,
  PIPP_SHARE_ELECTRIC_HEAT,
  PIPP_SHARE_GAS_HEAT,
  PROGRAMS,
  SUMMER_CRISIS_MAX_USD,
  WINTER_CRISIS_MAX_USD,
  type HouseholdFacts,
  type ProgramId,
} from "../actions/programs.ts";
import { checkEligibility, logVerdict, type Verdict } from "./critic.ts";
import { componentUsd } from "./usageAnalyst.ts";

export const AGENT = "ActionPlanner";

/** Usage advice only when the household's own use is a real part of a rise: this share of the change, and at least this many dollars. */
export const USAGE_SHARE_FOR_NOTE = 0.25;
export const USAGE_FLOOR_FOR_NOTE_USD = 10;
/** AEP Ohio's Average Monthly Payment averages the last 12 months. */
export const BUDGET_BILLING_MONTHS = 12;

export type ActionAmount =
  | { readonly kind: "monthly"; readonly usd: number; readonly insteadOfUsd: number }
  | { readonly kind: "range"; readonly minUsd: number; readonly maxUsd: number }
  | { readonly kind: "up_to"; readonly usd: number }
  | { readonly kind: "disputed"; readonly usd: number }
  | { readonly kind: "share_of_change"; readonly usd: number };

export interface ProposedAction {
  readonly id: ProgramId;
  /** Why it fits this bill, in plain words. */
  readonly why: string;
  /** Null when the amount needs a fact the household has not given. */
  readonly amount: ActionAmount | null;
}

export type ActionStatus = "recommended" | "rejected" | "already_taken";

export interface PlannedAction extends ProposedAction {
  readonly status: ActionStatus;
  /** Check 4; null for an action the household already took. */
  readonly verdict: Verdict | null;
  /** What the household told us it did, when it did. */
  readonly taken: { readonly at: string; readonly text: string } | null;
}

export interface NotProposed {
  readonly id: string;
  readonly name: string;
  readonly reason: string;
}

export interface ActionPlan {
  /** The date the rules are checked at: the end of the bill being explained. */
  readonly asOf: string;
  readonly actions: readonly PlannedAction[];
  readonly notProposed: readonly NotProposed[];
}

export interface PlannerInput {
  readonly facts: HouseholdFacts | null;
  readonly billTotalUsd: number;
  readonly rate: RateResult;
  readonly change: ChangeResult;
  /** Bills on record up to this one, for options that need a year of history. */
  readonly billsOnRecord: number;
  readonly asOf: string;
  /** Actions the household told us it already took, by program. */
  readonly taken: ReadonlyMap<ProgramId, { readonly at: string; readonly text: string }>;
}

const dollars = (n: number): string => `${n.toFixed(2)} USD`;

export function pippMonthlyUsd(facts: HouseholdFacts | null): number | null {
  if (typeof facts?.annualIncomeUsd !== "number" || !Number.isFinite(facts.annualIncomeUsd) || facts.annualIncomeUsd < 0) return null;
  if (typeof facts.electricHeat !== "boolean") return null;
  const share = facts.electricHeat ? PIPP_SHARE_ELECTRIC_HEAT : PIPP_SHARE_GAS_HEAT;
  return Math.max(PIPP_MIN_MONTHLY_USD, Math.round((facts.annualIncomeUsd * share) / 12));
}

/** What the planner proposes from need, before any eligibility check. */
export function propose(input: PlannerInput): { proposed: ProposedAction[]; notProposed: NotProposed[] } {
  const proposed: ProposedAction[] = [];
  const notProposed: NotProposed[] = [];
  const pipp = pippMonthlyUsd(input.facts);
  proposed.push({
    id: "pipp_plus",
    why:
      input.facts?.electricHeat === false
        ? "Pay a share of your income each month instead of the full electric bill, all year. With gas heat, another 5% of income goes to the gas company."
        : "Pay a share of your income each month instead of the full electric bill, all year.",
    amount: pipp === null ? null : { kind: "monthly", usd: pipp, insteadOfUsd: input.billTotalUsd },
  });
  const pippApplied = input.taken.has("pipp_plus");
  const cut = (n: number): string => dollars(Math.round(n * (1 - HEAP_PIPP_CUT)));
  proposed.push({
    id: "heap",
    why: pippApplied
      ? `A one-time credit on your bill for the heating season. Once PIPP Plus is approved, HEAP pays 75% less: about ${cut(HEAP_MIN_USD)} to ${cut(HEAP_MAX_USD)}.`
      : "A one-time credit on your bill for the heating season. Households also on PIPP Plus get 75% less.",
    amount: { kind: "range", minUsd: HEAP_MIN_USD, maxUsd: HEAP_MAX_USD },
  });
  proposed.push({ id: "summer_crisis", why: "Help paying a summer bill, for households with someone 60 or older or a disconnection notice.", amount: { kind: "up_to", usd: SUMMER_CRISIS_MAX_USD } });
  proposed.push({ id: "winter_crisis", why: "Help to keep or restore service in winter, once there is a disconnection notice.", amount: { kind: "up_to", usd: WINTER_CRISIS_MAX_USD } });

  // Only a bill above the tariff is worth questioning; our recompute leaves out riders URDB does not carry.
  const gap = input.rate.possibleBillingErrorUsd;
  if (gap !== null && gap > 0) {
    proposed.push({
      id: "puco_complaint",
      why: `Your bill is ${dollars(gap)} above what AEP Ohio's published tariff gives for the same use. Ask AEP Ohio to explain the difference first; it may be a charge the published tariff does not list.`,
      amount: { kind: "disputed", usd: gap },
    });
  } else {
    notProposed.push({
      id: "puco_complaint",
      name: PROGRAMS.puco_complaint.name,
      reason:
        gap === null
          ? "This bill matches AEP Ohio's published tariff, so there is nothing to question."
          : "This bill is below what the published tariff gives, so there is nothing to question.",
    });
  }

  const d = input.change.decomposition;
  if (d && !input.change.closed) {
    notProposed.push({
      id: "usage_note",
      name: PROGRAMS.usage_note.name,
      reason: "The change could not be fully explained, so your own use is not measured well enough to act on.",
    });
  } else if (d) {
    const usage = componentUsd(d, "usage");
    const needed = Math.max(Math.abs(d.changeUsd) * USAGE_SHARE_FOR_NOTE, USAGE_FLOOR_FOR_NOTE_USD);
    if (usage > 0 && usage >= needed) {
      proposed.push({
        id: "usage_note",
        why: `Your own use added ${dollars(usage)} to this bill, more than price, days and weather explain.`,
        amount: { kind: "share_of_change", usd: usage },
      });
    } else {
      notProposed.push({
        id: "usage_note",
        name: PROGRAMS.usage_note.name,
        reason: `Your own use changed this bill by ${dollars(usage)}; a note is suggested only when it adds at least ${dollars(needed)}.`,
      });
    }
  }

  notProposed.push({
    id: "budget_billing",
    name: "AEP Ohio Average Monthly Payment",
    reason:
      input.billsOnRecord >= BUDGET_BILLING_MONTHS
        ? "It evens out your bills but saves nothing; not suggested for a single high bill."
        : `It averages the last ${BUDGET_BILLING_MONTHS} months to set a flat amount; we have ${input.billsOnRecord} of your bills, so we cannot work out that amount yet.`,
  });
  return { proposed, notProposed };
}

/** A seasonal program the household took up only counts within that season's window. */
function takenThisSeason(id: ProgramId, taken: { readonly at: string; readonly text: string } | null): { at: string; text: string } | null {
  const w = PROGRAMS[id].window;
  if (!taken || (w && (taken.at < w.from || taken.at > w.to))) return null;
  return { at: taken.at, text: taken.text };
}

export function planActions(input: PlannerInput, logger: RunLogger): ActionPlan {
  const { proposed, notProposed } = propose(input);
  logger.log({ agent: AGENT, step: "proposed", asOf: input.asOf, actions: proposed.map((a) => ({ id: a.id, amount: a.amount })), notProposed });
  const actions = proposed.map((action): PlannedAction => {
    const taken = takenThisSeason(action.id, input.taken.get(action.id) ?? null);
    if (taken) {
      logger.log({ agent: AGENT, step: "already_taken", action: action.id, at: taken.at });
      return { ...action, status: "already_taken", verdict: null, taken };
    }
    const verdict = checkEligibility(PROGRAMS[action.id], input.facts, input.asOf, action.amount !== null);
    logVerdict(logger, verdict, action.id, 1);
    return { ...action, status: verdict.accepted ? "recommended" : "rejected", verdict, taken: null };
  });
  return { asOf: input.asOf, actions, notProposed };
}
