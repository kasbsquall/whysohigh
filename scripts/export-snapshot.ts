// Saves the public data the analysts read through Zetaris, so sample mode can
// run a bill that was never recorded. Needs the live stack.
//   npx tsx scripts/export-snapshot.ts
//
// Writes data/snapshot/noaa-cmh-daily.json (NOAA NCEI daily TMAX and TMIN,
// Columbus) and data/snapshot/urdb-aep-rs.json (AEP Ohio RS tariff rows from
// OpenEI URDB), each with the SQL that produced it and the export time.

import { mkdirSync, writeFileSync } from "node:fs";
import { loadConfig, loadDotEnv } from "../src/config.ts";
import { createZetarisRest } from "../src/zetaris/client.ts";
import { NOAA_DAILY_SQL, tariffsSql } from "../src/zetaris/queries.ts";

loadDotEnv();
const config = loadConfig({ ...process.env, SAMPLE_MODE: "false" });
const zetaris = createZetarisRest(config.zetaris);
const exportedAt = new Date().toISOString();

mkdirSync("data/snapshot", { recursive: true });
for (const [file, sql, limit] of [
  ["data/snapshot/noaa-cmh-daily.json", NOAA_DAILY_SQL, 5000],
  ["data/snapshot/urdb-aep-rs.json", tariffsSql(), 1000],
] as const) {
  const rows = await zetaris.run(sql, limit);
  writeFileSync(file, `${JSON.stringify({ exportedAt, sql, rows }, null, 1)}\n`, "utf8");
  process.stdout.write(`${rows.length} rows written to ${file}\n`);
}
