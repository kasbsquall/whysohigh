// Household graph on Meterless World Model (vendored in engines/world-model).
// Who the household is, which utility, tariff and weather station apply, and
// each bill with its diagnosis as facts. Every write carries provenance: the
// agent or public source and the bill's date (never the wall clock), so a
// replay folds to the same state.

import { WorldModel } from "../../engines/world-model/reference/src/index.ts";
import type { RunLogger } from "../log.ts";
import type { Decomposition } from "../agents/usageAnalyst.ts";
import type { RateEstimate } from "../agents/rateAnalyst.ts";

export const AGENT = "WorldModel";

const AEP_OHIO_EIA = "14006";
const CMH_STATION = "USW00014821";
const URDB_PAGE = "https://apps.openei.org/IURDB/rate/view/";

export interface BillFacts {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly kwh: number;
  readonly totalUsd: number;
}

export interface PreviousDiagnosis {
  readonly periodStart: string;
  readonly totalUsd: number | null;
  /** Null when that run could not split the change. */
  readonly components: Readonly<Record<string, number>> | null;
  readonly usageStrategy: string | null;
  readonly confidence: string | null;
}

export function openHouseholdGraph(dir: string, householdId: string): WorldModel {
  return new WorldModel({ namespace: `household-${householdId}`, storage: "local", directory: dir });
}

const billKey = (householdId: string, periodStart: string) => ({ system: "whysohigh-bill", id: `${householdId}:${periodStart}` });

export async function recordRun(
  wm: WorldModel,
  householdId: string,
  bill: BillFacts,
  rate: RateEstimate,
  decomposition: Decomposition | null,
  runId: string,
  logger: RunLogger,
): Promise<string> {
  const at = `${bill.periodEnd}T00:00:00.000Z`;
  // Fact ids are content-addressed on (subject, predicate, value, at, kind, url). Every run
  // asserts at the bill's date, so the run goes in url: a rerun that returns to an earlier
  // value still adds a new fact, and "latest" means the latest run.
  const agent = (by: string) => ({ kind: "agent", by, at, runId, url: `whysohigh://run/${runId}` });

  const household = await wm.upsertEntity({ type: "household", externalKey: { system: "whysohigh", id: householdId }, name: householdId, source: agent("Orchestrator") });
  const utility = await wm.upsertEntity({
    type: "utility",
    externalKey: { system: "eia", id: AEP_OHIO_EIA },
    name: "AEP Ohio (Ohio Power Co)",
    source: { kind: "api", by: "Zetaris EIA_API", at },
  });
  const station = await wm.upsertEntity({
    type: "weather_station",
    externalKey: { system: "ghcnd", id: CMH_STATION },
    name: "John Glenn Columbus International Airport",
    source: { kind: "api", by: "Zetaris NOAA_NCEI", at },
  });
  await wm.relate({ from: household.id, type: "served_by", to: utility.id, source: agent("Orchestrator") });
  await wm.relate({ from: household.id, type: "weather_from", to: station.id, source: agent("WeatherAnalyst") });
  for (const segment of rate.charges.segments) {
    const t = segment.tariff;
    const tariff = await wm.upsertEntity({
      type: "tariff",
      externalKey: { system: "urdb", id: t.label },
      name: t.name,
      attrs: { start: t.start, end: t.end, fixedMonthlyUsd: t.fixedMonthlyUsd },
      source: { kind: "api", by: "Zetaris OPENEI_URDB", at, url: `${URDB_PAGE}${t.label}` },
    });
    await wm.relate({ from: household.id, type: "billed_under", to: tariff.id, validFrom: `${t.start}T00:00:00.000Z`, source: agent("RateAnalyst") });
  }

  const billEntity = await wm.upsertEntity({
    type: "bill",
    externalKey: billKey(householdId, bill.periodStart),
    name: `${householdId} ${bill.periodStart}`,
    attrs: { periodStart: bill.periodStart, periodEnd: bill.periodEnd },
    source: agent("BillReader"),
  });
  // bill -> household, so each bill keeps its own open edge (a new household -> bill edge would close the last one).
  await wm.relate({ from: billEntity.id, type: "bill_of", to: household.id, source: agent("BillReader") });
  await wm.assertFact({ about: billEntity.id, predicate: "kwh", value: bill.kwh, confidence: 0.9, source: agent("BillReader") });
  await wm.assertFact({ about: billEntity.id, predicate: "totalUsd", value: bill.totalUsd, confidence: 0.9, source: agent("BillReader") });
  // A run that could not split the change records null, so an older split is not read back as current.
  const components = decomposition ? Object.fromEntries(decomposition.components.map((c) => [c.key, c.usd])) : null;
  const confidence = decomposition?.model.confidence === "fitted" ? 0.7 : 0.4;
  await wm.assertFact({ about: billEntity.id, predicate: "changeComponentsUsd", value: components, confidence, source: agent("UsageAnalyst") });
  await wm.assertFact({ about: billEntity.id, predicate: "usageStrategy", value: decomposition?.usageStrategy ?? null, confidence, source: agent("UsageAnalyst") });
  await wm.assertFact({ about: billEntity.id, predicate: "modelConfidence", value: decomposition?.model.confidence ?? null, confidence, source: agent("WeatherAnalyst") });
  logger.log({ agent: AGENT, step: "recorded", bill: billEntity.id, facts: wm.view("facts").about(billEntity.id).length });
  return billEntity.id;
}

/**
 * What an earlier run concluded about a bill, read back from the graph's facts.
 * The reference engine rebuilds facts from its log on reopen but not the copy
 * on the entity's attrs, so facts are read directly: the latest per predicate.
 */
export function previousDiagnosis(wm: WorldModel, householdId: string, periodStart: string, logger: RunLogger): PreviousDiagnosis | null {
  const key = billKey(householdId, periodStart);
  const id = `bill:${key.system}:${key.id}`;
  const facts = wm.view("facts").about(id);
  logger.log({ agent: AGENT, step: "read", bill: id, facts: facts.length });
  if (facts.length === 0) return null;
  const latest = new Map<string, unknown>();
  for (const f of facts) latest.set(f.predicate, f.value); // about() is sorted by assertedAt
  const value = (predicate: string): unknown => latest.get(predicate);
  return {
    periodStart,
    totalUsd: typeof value("totalUsd") === "number" ? (value("totalUsd") as number) : null,
    components: (value("changeComponentsUsd") as Record<string, number> | null | undefined) ?? null,
    usageStrategy: typeof value("usageStrategy") === "string" ? (value("usageStrategy") as string) : null,
    confidence: typeof value("modelConfidence") === "string" ? (value("modelConfidence") as string) : null,
  };
}
