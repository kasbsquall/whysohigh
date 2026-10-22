// Checks that the live stack answers: Nightshift lists Nemotron models and
// Zetaris runs a statement. Prints PASS or FAIL per check, never secrets.
//   npm run doctor

import { loadConfig, loadDotEnv } from "../src/config.ts";
import { createZetarisRest } from "../src/zetaris/client.ts";

loadDotEnv();
const config = loadConfig({ ...process.env, SAMPLE_MODE: "false" });

type Check = readonly [name: string, run: () => Promise<string>];

const checks: readonly Check[] = [
  [
    "Nightshift lists NVIDIA Nemotron models",
    async () => {
      const response = await fetch(`${config.meterless.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.meterless.token}`, "meterless-app": "whysohigh" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { data?: { id: string }[] };
      const nemotron = (body.data ?? []).filter((m) => m.id.startsWith("nvidia/nemotron"));
      if (nemotron.length === 0) throw new Error("no nvidia/nemotron models; add the NVIDIA key in Setup > Providers");
      return `${nemotron.length} Nemotron models`;
    },
  ],
  [
    "Zetaris runs SQL over REST",
    async () => {
      const rows = await createZetarisRest(config.zetaris).run("SELECT 1 AS one", 1);
      if (rows[0]?.[0] !== "1") throw new Error(`unexpected result ${JSON.stringify(rows)}`);
      return "SELECT 1 returned 1";
    },
  ],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    process.stdout.write(`PASS  ${name}: ${await run()}\n`);
  } catch (error: unknown) {
    failed += 1;
    process.stdout.write(`FAIL  ${name}: ${(error as Error).message}\n`);
  }
}
process.exitCode = failed === 0 ? 0 : 1;
