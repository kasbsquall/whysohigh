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

To run live:

1. Copy `.env.example` to `.env`, set `SAMPLE_MODE=false` and fill in the Meterless Nightshift runtime token, the local Zetaris password and a long random `HOUSEHOLD_DB_PASSWORD`.
2. Start the household database on the Zetaris network: `npm run db:up`.
3. Register the data sources in Zetaris (NOAA daily weather, OpenEI URDB tariffs, EIA retail prices and the household Postgres): `npm run setup:sources`.
4. Check the stack: `npm run doctor`.

If the Nemotron vision endpoint fails, BillReader reads the bill's text layer (`<bill>.txt`) with a Nemotron text model and logs a `fallback_text` step. Without a text layer it stops with the error. Provider failures are recorded with the samples, so sample mode replays the same path.

## How a run reasons

1. BillReader extracts the bill fields with Nemotron.
2. WeatherAnalyst joins the household's bills (Postgres) with NOAA daily weather in one federated Zetaris query and returns cooling and heating degree days per bill period.
3. RateAnalyst loads AEP Ohio's published residential tariff versions from OpenEI URDB through Zetaris and recomputes the bill. It first prices the whole period with the tariff in force on the last day.
4. ReconciliationCritic compares that recomputation with the billed total. Within 2% it accepts. Otherwise it sends the work back with the gap, and RateAnalyst prorates the period across every tariff in force. If that still misses, the run reports a possible billing error with the amount.
5. RateAnalyst also prices last period's kWh under both periods' tariffs to separate the effect of price changes from the effect of usage.

The sample bill is generated from the published tariff by `scripts/make-sample-bill.ts`, then rendered to PNG with a headless browser.

## Tests

```bash
npm test
npm run typecheck
npm run conformance:hmem
npm run conformance:world-model
```

Sample bills are synthetic and labelled SAMPLE. The household in `samples/linda.json` is illustrative.
