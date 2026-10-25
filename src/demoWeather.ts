// Columbus daily weather for the days the demo's bills cover, read through the
// same SQL client the agents use, so the page's weather strip draws real data.
// Live mode reads Zetaris; sample mode replays a recorded answer or, when the
// statement was never recorded, the saved NOAA copy. The client logs the source.

import { noaaSnapshot } from "./input.ts";
import type { Row, SqlClient } from "./zetaris/client.ts";
import { NOAA_DAILY_SQL, type DailyWeather } from "./zetaris/queries.ts";

export const NOAA_STATION = "USW00014821";
const AGENT = "WeatherAnalyst";
/** The NOAA table holds about 1,000 days from 2024 on; this leaves room for years more. */
const DAILY_LIMIT = 5000;

export interface DailyTemperature {
  /** ISO date, YYYY-MM-DD. */
  readonly date: string;
  readonly tmaxF: number;
  readonly tminF: number;
}

export interface DemoWeather {
  readonly station: string;
  /** First day shown, the first bill's start. */
  readonly from: string;
  /** The last bill's end; that day belongs to the next bill and is not included. */
  readonly toExclusive: string;
  /** Where the rows came from: Zetaris now, a recorded Zetaris answer, or the saved NOAA copy. */
  readonly source: "live" | "sample" | "snapshot";
  readonly sql: string;
  readonly days: readonly DailyTemperature[];
}

const snapshotRows = (weather: DailyWeather): readonly Row[] =>
  [...weather].map(([date, t]) => [date, t.tmax === null ? "" : String(t.tmax), t.tmin === null ? "" : String(t.tmin)]);

const number = (cell: string | undefined): number | null => {
  if (cell === undefined || cell.trim() === "") return null;
  const n = Number(cell);
  return Number.isFinite(n) ? n : null;
};

/** Daily highs and lows from `from` up to, not including, `toExclusive`. Days with a missing reading are left out. */
export async function readDemoWeather(
  sql: SqlClient,
  range: { readonly from: string; readonly toExclusive: string },
  sampleMode: boolean,
  snapshot: () => DailyWeather = noaaSnapshot,
): Promise<DemoWeather> {
  let usedSnapshot = false;
  const rows = await sql.run(AGENT, NOAA_DAILY_SQL, DAILY_LIMIT, () => {
    usedSnapshot = true;
    return snapshotRows(snapshot());
  });
  const days: DailyTemperature[] = [];
  for (const [date, tmax, tmin] of rows) {
    if (!date || date < range.from || date >= range.toExclusive) continue;
    const hi = number(tmax);
    const lo = number(tmin);
    if (hi === null || lo === null) continue;
    days.push({ date, tmaxF: hi, tminF: lo });
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    station: NOAA_STATION,
    from: range.from,
    toExclusive: range.toExclusive,
    source: usedSnapshot ? "snapshot" : sampleMode ? "sample" : "live",
    sql: NOAA_DAILY_SQL,
    days,
  };
}
