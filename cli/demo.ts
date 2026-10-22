// The two-month demo from an empty memory, so it gives the same result on any clone.
//   npm run demo
// 1. Month 1: Linda's September bill.
// 2. Linda tells us September was a one-off (samples/linda-notes.json), stored in H-MEM.
// 3. Month 2: her October bill, with memory.
// 4. Month 2 again without memory, to show what memory changed.
// Results go to out/demo/; each run also writes its own log in logs/.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openHouseholdMemory, parseNote, rememberNote } from "../src/memory/householdMemory.ts";
import { explain, ORCHESTRATOR } from "../src/pipeline.ts";
import { createRuntime } from "../src/runtime.ts";

const OUT = join("out", "demo");
const MEMORY = join(OUT, "memory");
const HOUSEHOLD = "linda";

interface Step {
  readonly name: string;
  readonly bill: string;
  readonly memory: boolean;
}

const STEPS: readonly Step[] = [
  { name: "month1", bill: "samples/linda-2026-09.png", memory: true },
  { name: "month2", bill: "samples/linda-2026-10.png", memory: true },
  { name: "month2-without-memory", bill: "samples/linda-2026-10.png", memory: false },
];

async function run(step: Step): Promise<void> {
  const runtime = createRuntime();
  const { logger } = runtime;
  logger.log({ agent: ORCHESTRATOR, step: "start", demoStep: step.name, sampleMode: runtime.config.sampleMode, bill: step.bill });
  const explanation = await explain(runtime, step.bill, { householdId: HOUSEHOLD, memoryDir: step.memory ? MEMORY : null });
  const file = join(OUT, `${step.name}.json`);
  writeFileSync(file, `${JSON.stringify({ runId: logger.runId, sampleMode: runtime.config.sampleMode, ...explanation }, null, 2)}\n`, "utf8");
  logger.log({ agent: ORCHESTRATOR, step: "done", outFile: file, logFile: logger.file });
}

rmSync(MEMORY, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
try {
  await run(STEPS[0]);
  const notes = (JSON.parse(readFileSync("samples/linda-notes.json", "utf8")) as unknown[]).map(parseNote);
  const runtime = createRuntime();
  const memory = openHouseholdMemory(join(MEMORY, "hmem"), notes[0].at);
  for (const note of notes) rememberNote(memory, HOUSEHOLD, note, runtime.logger);
  await run(STEPS[1]);
  await run(STEPS[2]);
} catch (error: unknown) {
  process.stderr.write(`Demo failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
