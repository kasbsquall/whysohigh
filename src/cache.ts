// Recorded responses for SAMPLE_MODE. A request is keyed by a hash of its
// canonical JSON, so replay runs the same agent code on the same inputs.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function cacheKey(request: unknown): string {
  return createHash("sha256").update(canonicalJson(request)).digest("hex").slice(0, 24);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export class SampleMissError extends Error {
  constructor(kind: string, key: string) {
    super(
      `SAMPLE_MODE has no recorded ${kind} response for request ${key}. ` +
        "Run once with SAMPLE_MODE=false RECORD_SAMPLES=true to record it.",
    );
    this.name = "SampleMissError";
  }
}

export interface ResponseCache {
  read<T>(kind: string, request: unknown): T;
  write(kind: string, request: unknown, response: unknown): void;
}

export function fileCache(root = join("samples", "cache")): ResponseCache {
  const path = (kind: string, key: string): string => join(root, kind, `${key}.json`);
  return {
    read<T>(kind: string, request: unknown): T {
      const key = cacheKey(request);
      const file = path(kind, key);
      if (!existsSync(file)) throw new SampleMissError(kind, key);
      let parsed: { response?: T };
      try {
        parsed = JSON.parse(readFileSync(file, "utf8")) as { response?: T };
      } catch {
        throw new Error(`Corrupt sample ${file}: not valid JSON. Delete it and record again.`);
      }
      if (parsed?.response === undefined) throw new Error(`Corrupt sample ${file}: no "response" field.`);
      return parsed.response;
    },
    write(kind: string, request: unknown, response: unknown): void {
      const key = cacheKey(request);
      mkdirSync(join(root, kind), { recursive: true });
      const file = path(kind, key);
      // Write then rename, so an interrupted recording never leaves half a file.
      writeFileSync(`${file}.tmp`, `${JSON.stringify({ key, response }, null, 2)}\n`, "utf8");
      renameSync(`${file}.tmp`, file);
    },
  };
}
