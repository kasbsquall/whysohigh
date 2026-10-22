// Federated queries behind the analysts. Each joins the household's bills in
// Postgres with a public source, so every number traces to one SQL statement
// in the run log.

import type { Row, SqlClient } from "./client.ts";

export interface BillWeather {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly days: number;
  readonly kwh: number;
  /** Days of station data found inside the bill period. */
  readonly weatherDays: number;
  /** Cooling and heating degree days, base 65 F, from daily (TMAX + TMIN) / 2. */
  readonly cdd: number;
  readonly hdd: number;
}

const ID = /^[a-z0-9_-]+$/;

function assertId(householdId: string): void {
  if (!ID.test(householdId)) throw new Error(`Invalid household id "${householdId}".`);
}

const mean = "(CAST(w.TMAX AS DOUBLE) + CAST(w.TMIN AS DOUBLE)) / 2";

export function billWeatherSql(householdId: string): string {
  assertId(householdId);
  return (
    "SELECT b.period_start, b.period_end, b.days, CAST(b.kwh AS DOUBLE) AS kwh, count(w.DATE) AS weather_days, " +
    `round(sum(greatest(${mean} - 65, 0)), 1) AS cdd, round(sum(greatest(65 - ${mean}, 0)), 1) AS hdd ` +
    "FROM household_pg.bills b JOIN noaa_ncei.cmh_daily w " +
    "ON to_date(w.DATE) >= b.period_start AND to_date(w.DATE) < b.period_end " +
    `WHERE b.household_id = '${householdId}' ` +
    "GROUP BY b.period_start, b.period_end, b.days, b.kwh ORDER BY b.period_start"
  );
}

const toNumber = (cell: string, column: string): number => {
  const value = Number(cell);
  if (cell === "" || !Number.isFinite(value)) throw new Error(`Column ${column} is not numeric: "${cell}".`);
  return value;
};

export function parseBillWeather(rows: readonly Row[]): readonly BillWeather[] {
  return rows.map((row) => ({
    periodStart: row[0],
    periodEnd: row[1],
    days: toNumber(row[2], "days"),
    kwh: toNumber(row[3], "kwh"),
    weatherDays: toNumber(row[4], "weather_days"),
    cdd: toNumber(row[5], "cdd"),
    hdd: toNumber(row[6], "hdd"),
  }));
}

export async function billWeather(sql: SqlClient, agent: string, householdId: string): Promise<readonly BillWeather[]> {
  return parseBillWeather(await sql.run(agent, billWeatherSql(householdId)));
}
