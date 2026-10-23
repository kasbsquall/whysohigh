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
    // A day counts only when both TMAX and TMIN are present (the sum is null otherwise).
    "SELECT b.period_start, b.period_end, b.days, CAST(b.kwh AS DOUBLE) AS kwh, " +
    "count(CAST(w.TMAX AS DOUBLE) + CAST(w.TMIN AS DOUBLE)) AS weather_days, " +
    `coalesce(round(sum(greatest(${mean} - 65, 0)), 1), 0) AS cdd, coalesce(round(sum(greatest(65 - ${mean}, 0)), 1), 0) AS hdd ` +
    // LEFT JOIN keeps a bill with missing weather days, so the critic can see the gap.
    "FROM household_pg.bills b LEFT JOIN noaa_ncei.cmh_daily_from_2024 w " +
    "ON to_date(w.DATE) >= b.period_start AND to_date(w.DATE) < b.period_end " +
    `WHERE b.household_id = '${householdId}' ` +
    "GROUP BY b.period_start, b.period_end, b.days, b.kwh ORDER BY b.period_start"
  );
}

/** NOAA's daily temperatures for Columbus, as registered in Zetaris. */
export const NOAA_DAILY_SQL = "SELECT DATE, TMAX, TMIN FROM noaa_ncei.cmh_daily_from_2024 ORDER BY DATE";

const toNumber = (cell: string, column: string): number => {
  const value = Number(cell);
  if (cell === "" || !Number.isFinite(value)) throw new Error(`Column ${column} is not numeric: "${cell}".`);
  return value;
};

const positive = (value: number, column: string): number => {
  if (value <= 0) throw new Error(`Column ${column} must be above 0, got ${value}.`);
  return value;
};

export function parseBillWeather(rows: readonly Row[]): readonly BillWeather[] {
  return rows.map((row) => ({
    periodStart: row[0],
    periodEnd: row[1],
    days: positive(toNumber(row[2], "days"), "days"),
    kwh: toNumber(row[3], "kwh"),
    weatherDays: toNumber(row[4], "weather_days"),
    cdd: toNumber(row[5], "cdd"),
    hdd: toNumber(row[6], "hdd"),
  }));
}

/** AEP Ohio's bundled residential tariff (rate RS), every version URDB holds. */
export const RS_BUNDLED = "Residential Service Bundled Ohio Power Rate Zone (RS)";

export function tariffsSql(name: string = RS_BUNDLED): string {
  if (/['\\]/.test(name)) throw new Error(`Invalid tariff name "${name}".`);
  return (
    "SELECT t.label, t.name, t.startdate, t.enddate, t.approved, t.fixedchargefirstmeter, t.fixedchargeunits, " +
    "to_json(t.energyratestructure), to_json(t.energyweekdayschedule[0]), to_json(t.energyweekendschedule[0]) " +
    "FROM openei_urdb.aep_ohio_residential LATERAL VIEW explode(items) AS t " +
    `WHERE t.name = '${name}' ORDER BY t.startdate`
  );
}

export async function billWeather(sql: SqlClient, agent: string, householdId: string): Promise<readonly BillWeather[]> {
  return parseBillWeather(await sql.run(agent, billWeatherSql(householdId)));
}
