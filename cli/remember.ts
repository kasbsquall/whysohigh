// Stores what the household tells us about a bill in its H-MEM memory.
//   npm run remember -- --household samples/linda.json --notes samples/linda-notes.json
// The notes file is a JSON array of { periodStart, kind: "one_off" | "ongoing" | "action", text, at }.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { openHouseholdMemory, parseNote, rememberNote } from "../src/memory/householdMemory.ts";
import { createRunLogger } from "../src/log.ts";

const { values } = parseArgs({
  options: {
    household: { type: "string" },
    notes: { type: "string" },
    memory: { type: "string" },
  },
});

if (!values.household || !values.notes) {
  process.stderr.write("Usage: npm run remember -- --household <json> --notes <json> [--memory <dir>]\n");
  process.exit(2);
}

const logger = createRunLogger();
try {
  const household = JSON.parse(readFileSync(values.household, "utf8")) as { id?: string };
  if (!household.id || !/^[a-z0-9_-]+$/.test(household.id)) throw new Error("The household id must use only a-z, 0-9, _ and -.");
  const raw = JSON.parse(readFileSync(values.notes, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("The notes file must be a JSON array.");
  const notes = raw.map(parseNote);
  const dir = values.memory ?? join(".memory", household.id);
  const memory = openHouseholdMemory(join(dir, "hmem"), notes[0]?.at ?? "1970-01-01");
  for (const note of notes) rememberNote(memory, household.id, note, logger);
} catch (error: unknown) {
  logger.log({ agent: "HouseholdMemory", step: "failed", error: (error as Error).message });
  process.exitCode = 1;
}
