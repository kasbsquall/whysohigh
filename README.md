# Why So High

Snap your electricity bill. Why So High tells you why it went up and what you can do about it this month.

Work in progress for the Open Agent Hackathon 2026, Track 03 (Reasoning Architecture). Scope: AEP Ohio residential customers in Columbus, Ohio.

## Run it

Requires Node 22.

```bash
npm install
npm run explain -- --bill samples/linda-2026-09.png --household samples/linda.json
```

The two-month demo, from an empty memory:

```bash
npm run demo
```

It explains Linda's September bill, stores her note that September was a one-off (`samples/linda-notes.json`), explains her October bill with that memory, and explains October again without memory so the difference is visible. Results go to `out/demo/`.

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
6. ReconciliationCritic checks that the published tariff and NOAA's weather cover every day of both bills (check 5). If not, the run stops the comparison and says which days are missing.
7. WeatherAnalyst picks the weather model: kWh = base use per day + kWh per cooling degree day + kWh per heating degree day. With 6 or more earlier bills that have NOAA data for every day, it fits the household's own history. Otherwise it uses a statewide Ohio prior (482.2 kWh + 0.511 per HDD + 1.743 per CDD per month, fitted on EIA sales per customer against Columbus degree days, Jan 2025 to Jul 2026) and marks confidence as low.
8. ReconciliationCritic checks that the previous bill also matches the published tariff, and judges any weather model before its share is believed (check 3): base use above zero, slopes between 0 and 4 times the Ohio ones, and a fit that explains at least half of past bills.
9. UsageAnalyst splits the dollar change into price, extra days, weather per day, usage and unexplained. Usage is first measured against the model's prediction, so whatever the model misses on the previous bill stays unexplained. ReconciliationCritic requires the unexplained part to be under 5% of the change, never less than 1 USD (check 2). If it is larger, the work goes back with the reason and the model is calibrated to the household's previous bill.

What the checks prove: the first closure check tests whether the model fits this household. After calibration the kWh add up by construction and both bills already match the tariff, so closure there only confirms the bookkeeping, and the split between weather and usage rests on check 3. With fewer than 6 bills of history, that split uses statewide slopes and is marked low confidence.

Days and weather are separated per day: "days" is the extra days used like an average day of the previous bill, "weather" is how much hotter or colder each day of this bill was.

## Memory

Two Meterless engines, vendored in `engines/` and declared in `engines/VENDORED.md`, keep the household's memory in `.memory/<household id>/` (or `--memory <dir>`; `--no-memory` runs without it).

- H-MEM keeps what happened in words: each bill's diagnosis and what the household tells us (`npm run remember -- --household <json> --notes <json>`), tagged with the bill period it is about. Its clock is the bill's date, so replays give the same state.
- World Model keeps the household graph with provenance on every write: household, AEP Ohio (EIA 14006), the URDB tariff versions it was billed under, NOAA station USW00014821, and each bill with its diagnosis as facts.

How memory changes a diagnosis: when the household marked the previous bill as a one-off, WeatherAnalyst leaves it out of any fit and calibrates the model to the latest normal bill instead. The previous bill's extra use then shows as its own component ("last bill's one-off use did not repeat"). Without that note, the same October bill reads as "used less".

The sample bills are generated from the published tariff by `scripts/make-sample-bill.ts`, then rendered to PNG with a headless browser. Linda's October kWh follow a stated recipe (the Ohio prior calibrated to her August bill, applied to NOAA's degree days for that period), so in the demo her October usage matches the model by construction. Accuracy has to be measured on synthetic households with known causes; that evaluation is not built yet.

## Tests

```bash
npm test
npm run typecheck
npm run conformance:hmem
npm run conformance:world-model
```

Sample bills are synthetic and labelled SAMPLE. The household in `samples/linda.json` is illustrative.
