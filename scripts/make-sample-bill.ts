// Writes the synthetic sample bills (HTML and their text layer) with charges
// computed from AEP Ohio's published RS tariff, so the demo bills reconcile.
// The PNGs are rendered from the HTML afterwards (see README).
//   npx tsx scripts/make-sample-bill.ts
//
// Linda's kWh are synthetic. August (902) and September (1,184) were set in
// block 1. October follows a stated recipe: the Ohio prior calibrated to her
// August bill, applied to NOAA's degree days for 16 Sep to 16 Oct 2026
// (81.5 CDD, 87.5 HDD over 30 days, read through Zetaris on 22 Oct 2026).
// That is "September's extra use did not repeat" by construction.

import { readFileSync, writeFileSync } from "node:fs";
import { calibrate, OHIO_PRIOR, predictKwh } from "../src/agents/weatherAnalyst.ts";
import { parseTariffRows } from "../src/tariff/tariff.ts";
import type { Row } from "../src/zetaris/client.ts";
import { sampleBill, type BillSpec, type Period } from "./sample-bill.ts";

const tariffs = parseTariffRows(JSON.parse(readFileSync("test/fixtures/urdb-aep-rs.json", "utf8")) as Row[]);

const august: Period = { start: "2026-07-16", end: "2026-08-14", kwh: 902 };
const september: Period = { start: "2026-08-14", end: "2026-09-16", kwh: 1184 };
const augustWeather = { days: 29, cdd: 297, hdd: 0, kwh: 902 };
const octoberWeather = { days: 30, cdd: 81.5, hdd: 87.5 };
const october: Period = {
  start: "2026-09-16",
  end: "2026-10-16",
  kwh: Math.round(predictKwh(calibrate(OHIO_PRIOR, augustWeather), octoberWeather)),
};

const usd = (n: number): string => `$${n.toFixed(2)}`;

function writeBill(spec: BillSpec & { readonly file: string }): void {
  const bill = sampleBill(tariffs, spec);
  writeFileSync(`samples/${spec.file}.html`, bill.html, "utf8");
  writeFileSync(`samples/${spec.file}.txt`, bill.text, "utf8");
  process.stdout.write(`${spec.file}: ${spec.current.kwh} kWh, total ${usd(bill.totalUsd)}, last month ${usd(bill.previousTotalUsd)}\n`);
}

writeBill({ file: "linda-2026-09", current: september, previous: august, statementDate: "09/19/2026", dueDate: "10/09/2026", meterPrevious: 48210 });
writeBill({ file: "linda-2026-10", current: october, previous: september, statementDate: "10/19/2026", dueDate: "11/09/2026", meterPrevious: 49394 });
