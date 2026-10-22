// Dev helper: saves the live URDB rows for AEP Ohio RS, read through Zetaris,
// as the tariff test fixture.
//   npx tsx scripts/dump-tariffs.ts

import { writeFileSync } from "node:fs";
import { loadConfig, loadDotEnv } from "../src/config.ts";
import { createZetarisRest } from "../src/zetaris/client.ts";
import { tariffsSql } from "../src/zetaris/queries.ts";

loadDotEnv();
const config = loadConfig({ ...process.env, SAMPLE_MODE: "false" });
const rows = await createZetarisRest(config.zetaris).run(tariffsSql());
writeFileSync("test/fixtures/urdb-aep-rs.json", `${JSON.stringify(rows, null, 2)}\n`, "utf8");
process.stdout.write(`${rows.length} tariff rows written to test/fixtures/urdb-aep-rs.json\n`);
