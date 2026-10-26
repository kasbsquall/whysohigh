// "Read your own bill": the photo is shrunk in the browser, sent to POST /api/photo,
// read by BillReader (Nemotron vision) and explained by the same agents as Linda's bills.

import { esc, usd } from "./format.ts";

const MAX_SIDE = 1600;
const QUALITY = 0.85;

interface Verdict {
  readonly accepted: boolean;
}
interface Component {
  readonly key: string;
  readonly usd: number;
}
interface PhotoResult {
  readonly status: "success" | "error";
  readonly error?: { readonly message: string };
  readonly output?: {
    readonly bill: {
      readonly periodStart: string;
      readonly periodEnd: string;
      readonly days: number;
      readonly kwh: number;
      readonly totalUsd: number;
      readonly previous: { readonly kwh: number; readonly days: number; readonly totalUsd: number } | null;
    };
    readonly rate: { readonly verdicts: readonly Verdict[]; readonly possibleBillingErrorUsd: number | null };
    readonly change: { readonly verdicts: readonly Verdict[]; readonly skipped: string | null; readonly decomposition: { readonly changeUsd: number; readonly components: readonly Component[] } | null };
    readonly words: { readonly text: string; readonly source: string; readonly verdicts: readonly Verdict[] } | null;
  };
}

const LABELS: Readonly<Record<string, string>> = {
  price: "Price per kWh",
  days: "Billing days",
  weather: "Weather",
  usage: "Your own use",
  unexplained: "Not explained",
};

/** Draws the photo at most MAX_SIDE pixels on its long side and encodes it as JPEG. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare the photo.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", QUALITY);
}

export function photoResult(r: PhotoResult): string {
  const out = r.output;
  if (r.status !== "success" || !out) return `<p class="photo-msg">${esc(r.error?.message ?? "The photo could not be read.")}</p>`;
  const b = out.bill;
  const read = [
    ["Service period", `${b.periodStart} to ${b.periodEnd}, ${b.days} days`],
    ["Energy used", `${b.kwh.toLocaleString("en-US")} kWh`],
    ["Total", usd(b.totalUsd)],
    ...(b.previous ? [["Last bill", `${b.previous.kwh.toLocaleString("en-US")} kWh, ${b.previous.days} days, ${usd(b.previous.totalUsd)}`]] : []),
  ]
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`)
    .join("");
  const verdicts = [...out.rate.verdicts, ...out.change.verdicts, ...(out.words?.verdicts ?? [])];
  const passed = verdicts.filter((v) => v.accepted).length;
  const d = out.change.decomposition;
  const split = d
    ? `<h3 class="photo-h">Your bill went ${d.changeUsd < 0 ? "down" : "up"} <span class="num">${usd(Math.abs(d.changeUsd))}</span></h3>
       ${out.words ? `<p class="summary-text">${esc(out.words.text)}</p>` : ""}
       <ul class="photo-split">${d.components.map((c) => `<li><span>${esc(LABELS[c.key] ?? c.key)}</span><span class="num">${usd(c.usd, true)}</span></li>`).join("")}</ul>`
    : `<p class="photo-msg">${esc(out.change.skipped ?? "The change could not be split.")}</p>`;
  const error =
    out.rate.possibleBillingErrorUsd !== null
      ? `<p class="photo-msg">AEP Ohio's published tariff gives a total ${usd(Math.abs(out.rate.possibleBillingErrorUsd))} ${out.rate.possibleBillingErrorUsd > 0 ? "lower" : "higher"} than this bill for the same kWh. It is worth asking AEP Ohio about it.</p>`
      : "";
  return `
    <h3 class="photo-h">Read from your photo</h3>
    <dl class="photo-read">${read}</dl>
    ${error}
    ${split}
    <p class="summary-credit">${passed} of ${verdicts.length} checks passed. Without your household size and income we cannot check help programs.</p>`;
}

export function wirePhoto(): void {
  const open = document.getElementById("photoOpen");
  const dialog = document.getElementById("photoDialog") as HTMLDialogElement | null;
  const input = document.getElementById("photoFile") as HTMLInputElement | null;
  const status = document.getElementById("photoStatus");
  const result = document.getElementById("photoResult");
  if (!open || !dialog || !input || !status || !result) return;
  open.addEventListener("click", () => dialog.showModal());
  document.getElementById("photoClose")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => open.focus());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    result.innerHTML = "";
    status.textContent = "Reading your bill. This takes about a minute.";
    input.disabled = true;
    try {
      const image = await shrink(file);
      const res = await fetch("/api/photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }) });
      const body = (await res.json()) as PhotoResult;
      status.textContent = res.ok ? "Done." : "";
      result.innerHTML = photoResult(body);
    } catch {
      status.textContent = "";
      result.innerHTML = `<p class="photo-msg">The photo could not be sent. Check the connection and try again.</p>`;
    } finally {
      input.disabled = false;
      input.value = "";
    }
  });
}
