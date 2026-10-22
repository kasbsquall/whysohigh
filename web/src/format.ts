// Formatting for the page: dollars, kWh, dates, and the critic's reasons in plain words.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MINUS = "−";

const parts = (iso: string): [number, number, number] => {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
};

/** "2026-09-16" to "September". */
export const month = (iso: string): string => MONTHS[parts(iso)[1] - 1];

/** "2026-09-16" to "Sep 16". */
export const short = (iso: string): string => {
  const [, m, d] = parts(iso);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
};

/** "2026-04-10" to "Apr 10, 2026". */
export const day = (iso: string): string => `${short(iso)}, ${parts(iso)[0]}`;

const money = (n: number): string =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Dollars; with sign, positive numbers get a plus and negatives a true minus. */
export const usd = (n: number, signed = false): string => {
  if (n < 0) return `${MINUS}${money(n)}`;
  return signed && n > 0 ? `+${money(n)}` : money(n);
};

export const kwh = (n: number, signed = false): string => {
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const sign = n < 0 ? MINUS : signed && n > 0 ? "+" : "";
  return `${sign}${abs} kWh`;
};

/** The critic writes "12.60 USD"; the page says "$12.60". */
export const plainReason = (reason: string): string =>
  reason
    .replace(/(-?)(\d[\d,]*(?:\.\d+)?) USD/g, (_, sign: string, n: string) => `${sign ? MINUS : ""}$${n}`)
    .replace(/(?<![\w-])-(\d)/g, `${MINUS}$1`)
    .replace(/the −\$([\d.]+) change/g, "the $$$1 drop")
    .replace(/the ohio_prior weather model/g, "Ohio averages")
    .replace(/The Ohio prior/g, "The Ohio-average model");

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for HTML. Everything from the server goes through this. */
export const esc = (value: string | number): string => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
