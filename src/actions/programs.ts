// Ohio help programs and AEP Ohio options the ActionPlanner can propose, with the
// rules the critic checks them against. Every amount, limit and date comes from
// docs/11-ohio-y-piezas.md ("Acciones"), read from ODJFS, PUCO and AEP Ohio on
// 22 Oct 2026. Recheck the sources before changing a number here.

export type ProgramId = "pipp_plus" | "heap" | "summer_crisis" | "winter_crisis" | "puco_complaint" | "usage_note";

/** Facts about the household the rules need. Unknown stays undefined, and a rule that needs it rejects. */
export interface HouseholdFacts {
  readonly householdSize?: number;
  readonly annualIncomeUsd?: number;
  readonly electricHeat?: boolean;
  readonly oldestMemberAge?: number;
  readonly disconnectionNotice?: boolean;
}

const isWholeAtLeast = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;
const isMoney = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Keeps only the household facts that are valid; anything missing or malformed is
 * left out, so a rule that needs it rejects (fail closed) instead of guessing.
 */
export function parseHouseholdFacts(raw: unknown): HouseholdFacts {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    ...(isWholeAtLeast(r.householdSize, 1) ? { householdSize: r.householdSize } : {}),
    ...(isMoney(r.annualIncomeUsd) ? { annualIncomeUsd: r.annualIncomeUsd } : {}),
    ...(typeof r.electricHeat === "boolean" ? { electricHeat: r.electricHeat } : {}),
    ...(isWholeAtLeast(r.oldestMemberAge, 0) ? { oldestMemberAge: r.oldestMemberAge } : {}),
    ...(typeof r.disconnectionNotice === "boolean" ? { disconnectionNotice: r.disconnectionNotice } : {}),
  };
}

export interface Window {
  readonly from: string;
  readonly to: string;
}

export interface NextStep {
  readonly text: string;
  readonly phone?: string;
  readonly url?: string;
}

export interface Program {
  readonly id: ProgramId;
  readonly name: string;
  /** What the name stands for, in plain words, for first use. */
  readonly longName: string;
  /** Income cap at 175% of the federal poverty guidelines applies. */
  readonly incomeTested: boolean;
  /** Dates the program takes applications; none means all year. */
  readonly window?: Window;
  readonly nextStep: NextStep;
  readonly source: string;
}

/**
 * 175% of the federal poverty guidelines by household size, Jul 2026 to May 2027 (ODJFS),
 * the income cap shared by HEAP, PIPP Plus and the crisis programs.
 * Source: https://jfs.ohio.gov/public-assistance/energy-and-community-assistance/home-energy-assistance-program-heap
 */
export const INCOME_LIMIT_USD: Readonly<Record<number, number>> = {
  1: 27930,
  2: 37870,
  3: 47810,
  4: 57750,
  5: 67690,
  6: 77630,
  7: 87570,
};

/** PIPP Plus: share of gross income paid to the electric company, and the monthly floor. */
export const PIPP_SHARE_GAS_HEAT = 0.05;
export const PIPP_SHARE_ELECTRIC_HEAT = 0.1;
export const PIPP_MIN_MONTHLY_USD = 10;
/** HEAP pays once per season between these amounts; households also on PIPP Plus get 75% less. */
export const HEAP_MIN_USD = 31;
export const HEAP_MAX_USD = 546;
export const HEAP_PIPP_CUT = 0.75;
export const SUMMER_CRISIS_MAX_USD = 1300;
export const SUMMER_CRISIS_MIN_AGE = 60;
export const WINTER_CRISIS_MAX_USD = 1200;

const APPLY_ONLINE = "https://jfs.ohio.gov/public-assistance/energy-and-community-assistance/apply-for-ohio-energy-assistance-programs";
const APPLY_TEXT = "Apply online on the Energy Assistance Portal, or call (800) 282-0880 to find your local agency. It takes about 12 weeks.";

export const PROGRAMS: Readonly<Record<ProgramId, Program>> = {
  pipp_plus: {
    id: "pipp_plus",
    name: "PIPP Plus",
    longName: "Percentage of Income Payment Plan",
    incomeTested: true,
    nextStep: { text: APPLY_TEXT, phone: "(800) 282-0880", url: APPLY_ONLINE },
    source: "https://jfs.ohio.gov/public-assistance/energy-and-community-assistance/percentage-of-income-payment-plan-pipp",
  },
  heap: {
    id: "heap",
    name: "HEAP",
    longName: "Home Energy Assistance Program",
    incomeTested: true,
    window: { from: "2026-10-01", to: "2027-04-30" },
    nextStep: { text: APPLY_TEXT, phone: "(800) 282-0880", url: APPLY_ONLINE },
    source: "https://jfs.ohio.gov/public-assistance/energy-and-community-assistance/home-energy-assistance-program-heap",
  },
  summer_crisis: {
    id: "summer_crisis",
    name: "Summer Crisis Program",
    longName: "Summer Crisis Program",
    incomeTested: true,
    window: { from: "2026-07-01", to: "2026-09-30" },
    nextStep: { text: "Call (800) 282-0880 to find your local agency and ask for Summer Crisis help with this bill.", phone: "(800) 282-0880", url: APPLY_ONLINE },
    source: "ODJFS LIHEAP State Plan 2026-2027, sections 4.12 and 11.5",
  },
  winter_crisis: {
    id: "winter_crisis",
    name: "Winter Crisis Program",
    longName: "Winter Crisis Program",
    incomeTested: true,
    window: { from: "2026-11-01", to: "2027-03-31" },
    nextStep: { text: "Call (800) 282-0880 to find your local agency as soon as you get a disconnection notice.", phone: "(800) 282-0880", url: APPLY_ONLINE },
    source: "ODJFS LIHEAP State Plan 2026-2027, sections 1.1 and 4.12",
  },
  puco_complaint: {
    id: "puco_complaint",
    name: "PUCO complaint",
    longName: "Public Utilities Commission of Ohio",
    incomeTested: false,
    nextStep: {
      text: "Call AEP Ohio first at 800-672-2231. If it is not fixed, call PUCO at 1-800-686-7826 or file online; AEP Ohio must give a status within 3 business days.",
      phone: "1-800-686-7826",
      url: "https://puco.ohio.gov/wps/portal/gov/puco/help-center/file-a-complaint",
    },
    source: "OAC 4901:1-10-21",
  },
  usage_note: {
    id: "usage_note",
    name: "Tell us what changed at home",
    longName: "A note for your next bill",
    incomeTested: false,
    nextStep: { text: "If something was different this month (guests, a new appliance, a stay away), add a note so your next bill is read against a normal month." },
    source: "Why So High household memory",
  },
};
