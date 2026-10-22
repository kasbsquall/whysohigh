// Writes the synthetic sample bill (HTML and its text layer) with charges
// computed from AEP Ohio's published RS tariff, so the demo bill reconciles.
// The PNG is rendered from the HTML afterwards (see README).
//   npx tsx scripts/make-sample-bill.ts

import { readFileSync, writeFileSync } from "node:fs";
import { computeCharges, parseTariffRows, periodDays, segmentsFor } from "../src/tariff/tariff.ts";
import type { Row } from "../src/zetaris/client.ts";

const tariffs = parseTariffRows(JSON.parse(readFileSync("test/fixtures/urdb-aep-rs.json", "utf8")) as Row[]);

const current = { start: "2026-08-14", end: "2026-09-16", kwh: 1184 };
const previous = { start: "2026-07-16", end: "2026-08-14", kwh: 902 };

const charges = computeCharges(segmentsFor(tariffs, current), current.kwh);
const previousTotal = computeCharges(segmentsFor(tariffs, previous), previous.kwh).totalUsd;

const usd = (n: number): string => `$${n.toFixed(2)}`;
const kwh = (n: number): string => n.toLocaleString("en-US");
const label = (text: string): string => text.replace(/(\d+) kWh/, (_, n: string) => `${kwh(Number(n))} kWh`);

const facts: readonly (readonly [string, string])[] = [
  ["Account: 0000-111-222", "Statement date: 09/19/2026"],
  ["Service period: 08/14/2026 - 09/16/2026", `Days in period: ${periodDays(current)}`],
  ["Meter read previous: 48,210", "Meter read current: 49,394"],
  [`Energy used: ${kwh(current.kwh)} kWh`, "Rate: Residential Service (RS)"],
  [`Last month: ${previous.kwh} kWh, ${periodDays(previous)} days, ${usd(previousTotal)}`, "Due date: 10/09/2026"],
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

writeFileSync("samples/linda-2026-09.html", html, "utf8");
writeFileSync("samples/linda-2026-09.txt", `${text}\n`, "utf8");
process.stdout.write(`total ${usd(charges.totalUsd)}, last month ${usd(previousTotal)}\n`);
