import { describe, expect, it } from "vitest";
import { demoWeatherRange, type DemoRun } from "../src/demo.ts";
import { readDemoWeather } from "../src/demoWeather.ts";
import type { Row, SqlClient } from "../src/zetaris/client.ts";
import { NOAA_DAILY_SQL, dailyWeather } from "../src/zetaris/queries.ts";

const ROWS: readonly Row[] = [
  ["2026-07-15", "90", "70"],
  ["2026-07-16", "94", "74"],
  ["2026-07-17", "", "71"],
  ["2026-07-18", "93", "71"],
  ["2026-08-14", "79", "68"],
];

interface Call {
  readonly agent: string;
  readonly sql: string;
  readonly limit: number | undefined;
}

/** A SQL client that answers with ROWS, or with the offline rows as sample mode does when nothing was recorded. */
function fakeSql(answer: "rows" | "offline", calls: Call[]): SqlClient {
  return {
    async run(agent, sql, limit, offline) {
      calls.push({ agent, sql, limit });
      if (answer === "offline") {
        if (!offline) throw new Error("no offline fallback");
        return offline();
      }
      return ROWS;
    },
  };
}

const range = { from: "2026-07-16", toExclusive: "2026-08-14" };

describe("daily weather for the strip", () => {
  it("reads NOAA_DAILY_SQL as WeatherAnalyst through the agents' SQL client, with room for every day", async () => {
    const calls: Call[] = [];
    await readDemoWeather(fakeSql("rows", calls), range, false);
    expect(calls).toHaveLength(1);
    expect(calls[0].agent).toBe("WeatherAnalyst");
    expect(calls[0].sql).toBe(NOAA_DAILY_SQL);
    expect(calls[0].limit).toBeGreaterThanOrEqual(1500);
  });

  it("keeps only the days from the first bill's start up to the last bill's end, and drops days with a missing reading", async () => {
    const weather = await readDemoWeather(fakeSql("rows", []), range, false);
    expect(weather.days).toEqual([
      { date: "2026-07-16", tmaxF: 94, tminF: 74 },
      { date: "2026-07-18", tmaxF: 93, tminF: 71 },
    ]);
    expect(weather).toMatchObject({ station: "USW00014821", from: "2026-07-16", toExclusive: "2026-08-14", sql: NOAA_DAILY_SQL });
  });

  it("says where the rows came from: live Zetaris, a recorded answer, or the saved NOAA copy", async () => {
    expect((await readDemoWeather(fakeSql("rows", []), range, false)).source).toBe("live");
    expect((await readDemoWeather(fakeSql("rows", []), range, true)).source).toBe("sample");
    const offline = await readDemoWeather(fakeSql("offline", []), range, true, () => dailyWeather(ROWS));
    expect(offline.source).toBe("snapshot");
    expect(offline.days.map((d) => d.date)).toEqual(["2026-07-16", "2026-07-18"]);
  });

  it("covers the earliest bill compared through the end of the latest bill", () => {
    const bills: [string, string][] = [
      ["2026-07-16", "2026-08-14"],
      ["2026-08-14", "2026-09-16"],
      ["2026-09-16", "2026-10-16"],
    ];
    const run = (start: string, end: string): DemoRun =>
      ({
        rate: { estimate: { period: { start, end } } },
        history: bills.map(([periodStart, periodEnd]) => ({ periodStart, periodEnd })),
      }) as unknown as DemoRun;
    expect(demoWeatherRange([run("2026-08-14", "2026-09-16"), run("2026-09-16", "2026-10-16")])).toEqual({
      from: "2026-07-16",
      toExclusive: "2026-10-16",
    });
    expect(() => demoWeatherRange([])).toThrow(/no runs/);
  });
});
