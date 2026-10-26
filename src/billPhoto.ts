// Reads one bill photo end to end: BillReader (Nemotron vision) reads it and the
// same agents explain the change. Used by POST /api/photo and by the static
// copy's recorded sample photo. The photo is written to a temporary folder for
// BillReader and deleted afterwards.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runRequest, type RunFailure, type RunSuccess } from "./runRequest.ts";
import type { Runtime } from "./runtime.ts";

/** A simulated phone photo of a synthetic bill (eval-05), served next to the page. */
export const SAMPLE_PHOTO = resolve("web", "public", "sample-photo.jpg");

export async function readBillPhoto(runtime: Runtime, bytes: Buffer, kind: "jpeg" | "png"): Promise<RunSuccess | RunFailure> {
  const dir = mkdtempSync(join(tmpdir(), "wsh-photo-"));
  const file = join(dir, `bill.${kind === "jpeg" ? "jpg" : "png"}`);
  try {
    writeFileSync(file, bytes);
    return await runRequest(runtime, { householdId: null, bill: { imagePath: file }, facts: {}, earlierBills: [] }, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
