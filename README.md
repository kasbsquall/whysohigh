# Why So High

Snap your electricity bill. Why So High tells you why it went up and what you can do about it this month.

Work in progress for the Open Agent Hackathon 2026, Track 03 (Reasoning Architecture). Scope: AEP Ohio residential customers in Columbus, Ohio.

## Run it

Requires Node 22.

```bash
npm install
npm run explain -- --bill samples/linda-2026-09.png --household samples/linda.json
```

With no `.env`, the run uses `SAMPLE_MODE=true`: the same agent code runs on model and SQL responses recorded from a live run in `samples/cache/`. Each run writes its trace to `logs/<runId>.jsonl` and its result to `out/<runId>.json`.

To run live, copy `.env.example` to `.env`, set `SAMPLE_MODE=false`, fill in the Meterless Nightshift runtime token and the local Zetaris password, and check the stack with `npm run doctor`.

## Tests

```bash
npm test
npm run typecheck
npm run conformance:hmem
npm run conformance:world-model
```

Sample bills are synthetic and labelled SAMPLE. The household in `samples/linda.json` is illustrative.
