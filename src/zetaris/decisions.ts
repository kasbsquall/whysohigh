// Writes the decision a run reached back to the household's Postgres through
// Zetaris, then reads it back through Zetaris, so the record of what was
// concluded lives next to the bills it was concluded from.

import type { Row, SqlClient } from "./client.ts";

export const DECISION_AGENT = "Orchestrator";

export interface Decision {
  /** Household, bill start and whether memory was used: one row per kind of run. */
  readonly runKey: string;
  readonly householdId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly changeUsd: number;
  readonly priceUsd: number;
  readonly daysUsd: number;
  readonly weatherUsd: number;
  readonly usageUsd: number;
  readonly unexplainedUsd: number;
  readonly checksPassed: number;
  readonly checksRun: number;
  readonly action: string | null;
  readonly actionUsd: number | null;
  readonly explanation: string;
}

export interface RecordedDecision {
  readonly runKey: string;
  readonly table: string;
  /** The row as Zetaris returned it after the insert: run key, change, action, action amount. */
  readonly readBack: Row | null;
}

const TABLE = "household_pg.decisions";
const ID = /^[a-z0-9_:-]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Text goes into a SQL literal: quotes become typographic, backslashes go. */
const text = (s: string): string => `'${s.replaceAll("\\", "").replaceAll("'", "’")}'`;
const money = (n: number): string => {
  if (!Number.isFinite(n)) throw new Error(`Not a dollar amount: ${n}`);
  return n.toFixed(2);
};

export function decisionInsertSql(d: Decision): string {
  if (!ID.test(d.runKey) || !ID.test(d.householdId)) throw new Error(`Invalid run key "${d.runKey}".`);
  if (!ISO.test(d.periodStart) || !ISO.test(d.periodEnd)) throw new Error("Decision dates must be YYYY-MM-DD.");
  const values = [
    text(d.runKey),
    text(d.householdId),
    `DATE '${d.periodStart}'`,
    `DATE '${d.periodEnd}'`,
    money(d.changeUsd),
    money(d.priceUsd),
    money(d.daysUsd),
    money(d.weatherUsd),
    money(d.usageUsd),
    money(d.unexplainedUsd),
    String(Math.trunc(d.checksPassed)),
    String(Math.trunc(d.checksRun)),
    d.action === null ? "NULL" : text(d.action),
    d.actionUsd === null ? "NULL" : money(d.actionUsd),
    text(d.explanation),
    text("whysohigh"),
  ];
  return `INSERT INTO ${TABLE} VALUES (${values.join(", ")})`;
}

export const decisionReadSql = (runKey: string): string => {
  if (!ID.test(runKey)) throw new Error(`Invalid run key "${runKey}".`);
  return `SELECT run_key, change_usd, action, action_usd FROM ${TABLE} WHERE run_key = '${runKey}' LIMIT 1`;
};

export async function recordDecision(sql: SqlClient, d: Decision): Promise<RecordedDecision> {
  await sql.run(DECISION_AGENT, decisionInsertSql(d), 1);
  const rows = await sql.run(DECISION_AGENT, decisionReadSql(d.runKey), 1);
  return { runKey: d.runKey, table: TABLE, readBack: rows[0] ?? null };
}
