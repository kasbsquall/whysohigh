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
import { computeCharges, parseTariffRows, periodDays, segmentsFor, type BillPeriod } from "../src/tariff/tariff.ts";
import type { Row } from "../src/zetaris/client.ts";

const tariffs = parseTariffRows(JSON.parse(readFileSync("test/fixtures/urdb-aep-rs.json", "utf8")) as Row[]);

interface Period extends BillPeriod {
  readonly kwh: number;
}

const august: Period = { start: "2026-07-16", end: "2026-08-14", kwh: 902 };
const september: Period = { start: "2026-08-14", end: "2026-09-16", kwh: 1184 };
const augustWeather = { days: 29, cdd: 297, hdd: 0, kwh: 902 };
const octoberWeather = { days: 30, cdd: 81.5, hdd: 87.5 };
const october: Period = {
  start: "2026-09-16",
  end: "2026-10-16",
  kwh: Math.round(predictKwh(calibrate(OHIO_PRIOR, augustWeather), octoberWeather)),
};

interface BillSpec {
  readonly file: string;
  readonly current: Period;
  readonly previous: Period;
  readonly statementDate: string;
  readonly dueDate: string;
  readonly meterPrevious: number;
}

const usd = (n: number): string => `$${n.toFixed(2)}`;
const kwh = (n: number): string => n.toLocaleString("en-US");
const label = (text: string): string => text.replace(/(\d+) kWh/, (_, n: string) => `${kwh(Number(n))} kWh`);
const printed = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const total = (p: Period): number => computeCharges(segmentsFor(tariffs, p), p.kwh).totalUsd;

function writeBill(spec: BillSpec): void {
  const { current, previous } = spec;
  const charges = computeCharges(segmentsFor(tariffs, current), current.kwh);
  const facts: readonly (readonly [string, string])[] = [
    ["Account: 0000-111-222", `Statement date: ${spec.statementDate}`],
    [`Service period: ${printed(current.start)} - ${printed(current.end)}`, `Days in period: ${periodDays(current)}`],
    [`Meter read previous: ${kwh(spec.meterPrevious)}`, `Meter read current: ${kwh(spec.meterPrevious + current.kwh)}`],
    [`Energy used: ${kwh(current.kwh)} kWh`, "Rate: Residential Service (RS)"],
    [`Last month: ${kwh(previous.kwh)} kWh, ${periodDays(previous)} days, ${usd(total(previous))}`, `Due date: ${spec.dueDate}`],
  ];
  const lines = charges.lines.map((l) => [label(l.label), usd(l.usd)] as const);

  const text = [
    "Electric Service Statement",
    "Residential service, Columbus OH",
    "SAMPLE / NOT A REAL BILL",
    ...facts.flat(),
    ...lines.map(([a, b]) => `${a}\t${b}`),
    `Total amount due\t${usd(charges.totalUsd)}`,
  ].join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#fff;font:15px/1.4 Arial,sans-serif;color:#222;width:850px}
.w{padding:36px 44px}.h{display:flex;justify-content:space-between;border-bottom:3px solid #222;padding-bottom:12px}
.h b{font-size:24px}.s{color:#c00;font-weight:bold;letter-spacing:2px}
table{width:100%;border-collapse:collapse;margin-top:18px}td{padding:6px 4px;border-bottom:1px solid #ddd}
td:last-child{text-align:right}.t td{font-weight:bold;font-size:19px;border-top:2px solid #222}
.g{display:grid;grid-template-columns:1fr 1fr;gap:6px 30px;margin-top:16px}
</style></head><body><div class="w">
<div class="h"><div><b>Electric Service Statement</b><br>Residential service, Columbus OH</div><div class="s">SAMPLE / NOT A REAL BILL</div></div>
<div class="g">
${facts.map(([a, b]) => `<div>${a}</div><div>${b}</div>`).join("\n")}
</div>
<table>
${lines.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("\n")}
<tr class="t"><td>Total amount due</td><td>${usd(charges.totalUsd)}</td></tr>
</table></div></body></html>
`;

  writeFileSync(`samples/${spec.file}.html`, html, "utf8");
  writeFileSync(`samples/${spec.file}.txt`, `${text}\n`, "utf8");
  process.stdout.write(`${spec.file}: ${current.kwh} kWh, total ${usd(charges.totalUsd)}, last month ${usd(total(previous))}\n`);
}

writeBill({ file: "linda-2026-09", current: september, previous: august, statementDate: "09/19/2026", dueDate: "10/09/2026", meterPrevious: 48210 });
writeBill({ file: "linda-2026-10", current: october, previous: september, statementDate: "10/19/2026", dueDate: "11/09/2026", meterPrevious: 49394 });
