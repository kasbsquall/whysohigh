// The synthetic sample bill (HTML and its text layer), with charges computed
// from AEP Ohio's published RS tariff. Shared by the demo bills
// (scripts/make-sample-bill.ts) and the evaluation households (eval/).

import { computeCharges, periodDays, segmentsFor, type BillPeriod, type Tariff } from "../src/tariff/tariff.ts";

export interface Period extends BillPeriod {
  readonly kwh: number;
}

export interface BillSpec {
  readonly current: Period;
  readonly previous: Period;
  readonly statementDate: string;
  readonly dueDate: string;
  readonly meterPrevious: number;
  /** Dollars billed above the tariff, hidden in the energy charge as a wrong rate would be. 0 for a correct bill. */
  readonly overchargeUsd?: number;
}

export interface SampleBill {
  readonly text: string;
  readonly html: string;
  readonly totalUsd: number;
  readonly previousTotalUsd: number;
}

const usd = (n: number): string => `$${n.toFixed(2)}`;
const kwh = (n: number): string => n.toLocaleString("en-US");
const label = (text: string): string => text.replace(/(\d+) kWh/, (_, n: string) => `${kwh(Number(n))} kWh`);
const printed = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const cents = (n: number): number => Math.round(n * 100) / 100;

export const tariffTotal = (tariffs: readonly Tariff[], p: Period): number => computeCharges(segmentsFor(tariffs, p), p.kwh).totalUsd;

export function sampleBill(tariffs: readonly Tariff[], spec: BillSpec): SampleBill {
  const { current, previous } = spec;
  const charges = computeCharges(segmentsFor(tariffs, current), current.kwh);
  const overcharge = spec.overchargeUsd ?? 0;
  const totalUsd = cents(charges.totalUsd + overcharge);
  const previousTotalUsd = tariffTotal(tariffs, previous);
  const facts: readonly (readonly [string, string])[] = [
    ["Account: 0000-111-222", `Statement date: ${spec.statementDate}`],
    [`Service period: ${printed(current.start)} - ${printed(current.end)}`, `Days in period: ${periodDays(current)}`],
    [`Meter read previous: ${kwh(spec.meterPrevious)}`, `Meter read current: ${kwh(spec.meterPrevious + current.kwh)}`],
    [`Energy used: ${kwh(current.kwh)} kWh`, "Rate: Residential Service (RS)"],
    [`Last month: ${kwh(previous.kwh)} kWh, ${periodDays(previous)} days, ${usd(previousTotalUsd)}`, `Due date: ${spec.dueDate}`],
  ];
  const lines = charges.lines.map((l, i) => [label(l.label), usd(i === 1 ? cents(l.usd + overcharge) : l.usd)] as const);

  const text = [
    "Electric Service Statement",
    "Residential service, Columbus OH",
    "SAMPLE / NOT A REAL BILL",
    ...facts.flat(),
    ...lines.map(([a, b]) => `${a}\t${b}`),
    `Total amount due\t${usd(totalUsd)}`,
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
<tr class="t"><td>Total amount due</td><td>${usd(totalUsd)}</td></tr>
</table></div></body></html>
`;
  return { text: `${text}\n`, html, totalUsd, previousTotalUsd };
}
