// Ohio's average residential price from the EIA API, read through Zetaris, so a
// bill's price per kWh can be set next to what Ohio homes paid that month.

import type { RunLogger } from "../log.ts";
import type { Row, SqlClient } from "./client.ts";

export interface StatePrice {
  /** The EIA month used, YYYY-MM: the bill's last month, or the latest EIA has published before it. */
  readonly month: string;
  readonly ohioCentsPerKwh: number;
  /** This bill's total divided by its kWh, fixed charge included. */
  readonly billCentsPerKwh: number;
}

const MONTH = /^\d{4}-\d{2}$/;

/** EIA nests the rows under response.data; explode turns them into one row per month. */
export function ohioPriceSql(month: string): string {
  if (!MONTH.test(month)) throw new Error(`Invalid month "${month}".`);
  return (
    "SELECT d.period, d.price FROM eia_api.oh_res_monthly LATERAL VIEW explode(response.data) t AS d " +
    `WHERE d.period <= '${month}' ORDER BY d.period DESC LIMIT 1`
  );
}

/**
 * Null when EIA has no month at or before the bill's or cannot be reached. This is
 * context next to the bill, not an input to any decision, so a failure is logged
 * and the run goes on.
 */
export async function ohioPrice(sql: SqlClient, logger: RunLogger, periodEnd: string, totalUsd: number, kwh: number): Promise<StatePrice | null> {
  let rows: readonly Row[];
  try {
    rows = await sql.run("RateAnalyst", ohioPriceSql(periodEnd.slice(0, 7)), 1, () => []);
  } catch (error: unknown) {
    logger.log({ agent: "RateAnalyst", step: "context_unavailable", source: "eia", reason: (error as Error).message.slice(0, 200) });
    return null;
  }
  const [period, price] = rows[0] ?? [];
  const cents = Number(price);
  if (!period || !Number.isFinite(cents) || kwh <= 0) return null;
  return { month: period, ohioCentsPerKwh: cents, billCentsPerKwh: Math.round((totalUsd / kwh) * 10000) / 100 };
}
