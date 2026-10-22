// Household memory on Meterless H-MEM (vendored in engines/hmem). It keeps what
// happened to the household in words: each bill's diagnosis and what the
// household told us (a one-off, an ongoing change, an action taken). Notes are
// tagged with the bill period they are about, so later runs can find them.
// The clock is the bill's date, never the wall clock, so replays are identical.
// Writes are idempotent: storing the same note or diagnosis twice keeps one.

import { HMEM, type MemoryRecord } from "../../engines/hmem/reference/src/index.ts";
import { PROGRAMS, type ProgramId } from "../actions/programs.ts";
import type { RunLogger } from "../log.ts";

export const AGENT = "HouseholdMemory";

export type NoteKind = "one_off" | "ongoing" | "action";

export interface HouseholdNote {
  /** Start of the bill period the note is about, YYYY-MM-DD. */
  readonly periodStart: string;
  readonly kind: NoteKind;
  readonly text: string;
  /** When the household said it, YYYY-MM-DD. */
  readonly at: string;
  /** For an "action" note: the program the household says it already took up. */
  readonly action?: ProgramId;
}

export interface RecalledNote extends HouseholdNote {
  readonly memoryId: string;
}

const NOTE_KINDS: readonly NoteKind[] = ["one_off", "ongoing", "action"];

/** True for an existing calendar date written as YYYY-MM-DD. */
export const isCalendarDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(value);
};

export function parseNote(raw: unknown): HouseholdNote {
  const n = raw as Partial<Record<keyof HouseholdNote, unknown>>;
  if (!isCalendarDate(n?.periodStart)) throw new Error("A note needs periodStart as a real date, YYYY-MM-DD.");
  if (!isCalendarDate(n.at)) throw new Error("A note needs at as a real date, YYYY-MM-DD.");
  if (!NOTE_KINDS.includes(n.kind as NoteKind)) throw new Error(`A note kind must be one of ${NOTE_KINDS.join(", ")}.`);
  if (typeof n.text !== "string" || n.text.trim() === "") throw new Error("A note needs its text.");
  const note = { periodStart: n.periodStart, kind: n.kind as NoteKind, text: n.text.trim(), at: n.at };
  if (n.kind !== "action") {
    if (n.action !== undefined) throw new Error("Only an action note names an action.");
    return note;
  }
  if (typeof n.action !== "string" || !Object.hasOwn(PROGRAMS, n.action)) {
    throw new Error(`An action note needs action, one of ${Object.keys(PROGRAMS).join(", ")}.`);
  }
  return { ...note, action: n.action as ProgramId };
}

const dayMs = (date: string): number => Date.parse(`${date}T12:00:00Z`);
const dateOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const periodTag = (periodStart: string): string => `period:${periodStart}`;
/** H-MEM ids are mem-<n>; order them by n, not as strings (mem-10 after mem-2). */
const seq = (m: MemoryRecord): number => Number(m.id.slice(m.id.lastIndexOf("-") + 1));
const byTime = (a: MemoryRecord, b: MemoryRecord): number => a.timestamp - b.timestamp || seq(a) - seq(b);

export interface HouseholdMemory {
  readonly hmem: HMEM;
  /** Moves the memory clock to a date (YYYY-MM-DD). */
  at(date: string): void;
}

export function openHouseholdMemory(dir: string, date: string): HouseholdMemory {
  let now = dayMs(date);
  const hmem = new HMEM({ persistDir: dir, clock: () => now, actor: "whysohigh" });
  return {
    hmem,
    at(next: string) {
      now = dayMs(next);
    },
  };
}

const notes = (memory: HouseholdMemory, asOf: string): MemoryRecord[] =>
  memory.hmem.store
    .all()
    .filter((m) => m.tags.includes("note") && dateOf(m.timestamp) <= asOf)
    .sort(byTime);

export function rememberNote(memory: HouseholdMemory, householdId: string, note: HouseholdNote, logger: RunLogger): MemoryRecord {
  const tags = ["note", note.kind, periodTag(note.periodStart), `household:${householdId}`, ...(note.action ? [`action:${note.action}`] : [])];
  const same = memory.hmem.store
    .all()
    .find((m) => m.content === note.text && dateOf(m.timestamp) === note.at && tags.every((t) => m.tags.includes(t)));
  if (same) {
    logger.log({ agent: AGENT, step: "remember_unchanged", memoryId: same.id, kind: note.kind, periodStart: note.periodStart });
    return same;
  }
  memory.at(note.at);
  const record = memory.hmem.add({
    content: note.text,
    type: "personal",
    layer: "long_term",
    tags,
    confidence: 0.9,
    source: `household:${householdId}`,
    provenance: { origin: "user_correction", learnedAt: dayMs(note.at), label: "household feedback" },
  });
  logger.log({ agent: AGENT, step: "remember", memoryId: record.id, kind: note.kind, periodStart: note.periodStart, text: note.text });
  return record;
}

/** Notes the household left about one bill period up to a date, oldest first. */
export function notesAbout(memory: HouseholdMemory, periodStart: string, asOf: string): readonly RecalledNote[] {
  return notes(memory, asOf)
    .filter((m) => m.tags.includes(periodTag(periodStart)))
    .map((m) => {
      const action = actionOf(m);
      return {
        memoryId: m.id,
        periodStart,
        kind: NOTE_KINDS.find((k) => m.tags.includes(k)) ?? "ongoing",
        text: m.content,
        at: dateOf(m.timestamp),
        ...(action ? { action } : {}),
      };
    });
}

const actionOf = (m: MemoryRecord): ProgramId | undefined => {
  const tag = m.tags.find((t) => t.startsWith("action:"));
  const id = tag?.slice("action:".length);
  return id !== undefined && Object.hasOwn(PROGRAMS, id) ? (id as ProgramId) : undefined;
};

/** Actions the household told us it took by a date, latest note per program. */
export function actionsTaken(memory: HouseholdMemory, asOf: string): ReadonlyMap<ProgramId, { readonly at: string; readonly text: string }> {
  const taken = new Map<ProgramId, { at: string; text: string }>();
  for (const m of notes(memory, asOf).filter((n) => n.tags.includes("action"))) {
    const id = actionOf(m);
    if (id) taken.set(id, { at: dateOf(m.timestamp), text: m.content });
  }
  return taken;
}

/** Bill periods the household had marked as a one-off by a date. */
export function oneOffPeriods(memory: HouseholdMemory, asOf: string): ReadonlySet<string> {
  return new Set(
    notes(memory, asOf)
      .filter((m) => m.tags.includes("one_off"))
      .flatMap((m) => m.tags.filter((t) => t.startsWith("period:")).map((t) => t.slice("period:".length))),
  );
}

export function rememberDiagnosis(
  memory: HouseholdMemory,
  householdId: string,
  periodStart: string,
  periodEnd: string,
  summary: string,
  runId: string,
  logger: RunLogger,
): MemoryRecord {
  const same = memory.hmem.store
    .all()
    .find((m) => m.tags.includes("diagnosis") && m.tags.includes(periodTag(periodStart)) && m.content === summary);
  if (same) {
    logger.log({ agent: AGENT, step: "remember_unchanged", memoryId: same.id, kind: "diagnosis", periodStart });
    return same;
  }
  memory.at(periodEnd);
  const record = memory.hmem.add({
    content: summary,
    type: "factual",
    layer: "long_term",
    tags: ["diagnosis", periodTag(periodStart), `household:${householdId}`],
    confidence: 0.8,
    source: `whysohigh:run:${runId}`,
    provenance: { origin: "plan_completion", learnedAt: dayMs(periodEnd), label: "bill diagnosis", refs: [runId] },
  });
  logger.log({ agent: AGENT, step: "remember", memoryId: record.id, kind: "diagnosis", periodStart });
  return record;
}
