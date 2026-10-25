# Why So High

Snap your electricity bill. Why So High tells you why it went up and what you can do about it this month.

Work in progress for the Open Agent Hackathon 2026, Track 03 (Reasoning Architecture). Scope: AEP Ohio residential customers in Columbus, Ohio.

## Run it

Requires Node 22.

```bash
npm install
npm run explain -- --bill samples/linda-2026-09.png --household samples/linda.json
```

### Try your own bill

No keys needed. Write the numbers printed on an AEP Ohio residential bill into a request like `input_examples/example_1.json` and run it:

```bash
npm run explain -- --input input_examples/example_1.json
```

The same request works over HTTP once `npm run serve` is running:

```bash
curl -X POST http://127.0.0.1:8787/api/run -H "Content-Type: application/json" -d @input_examples/example_1.json
```

A request has three parts. `household` holds what the action plan needs (`householdSize`, `annualIncomeUsd`, `electricHeat`, `oldestMemberAge`, `disconnectionNotice`; all optional, and a missing fact rejects the programs that need it). `bill.fields` holds the bill as printed: `period_start` and `period_end` (MM/DD/YYYY), `days`, `kwh`, `total_usd`, and the previous period's `prev_kwh`, `prev_days` and `prev_total_usd`. `history` is optional: earlier bills as `period_start`, `period_end` and `kwh`; with 6 or more, the weather model is fitted to the household instead of the Ohio average. Dates start on 1 Jan 2024, where the weather and tariff data start; each period is 1 to 62 days; earlier bills go oldest first and may not overlap; up to 36 of them. The answer is JSON with `status`, the full explanation under `output`, and the trace file under `log_file`. A request the agents cannot use gets HTTP 400 and `status: "error"` with the reason; the endpoint takes `Content-Type: application/json` only, up to 256 KB.

The three examples take different paths, and their outputs and traces are in `output_examples/`:

| Request | What happens |
|---|---|
| `example_1.json` | A gas-heated home that used 20% more than its weather response. The bill matches the tariff; the critic rejects the first split, the model is calibrated to the previous bill, and the second split closes. |
| `example_2.json` | An electric-heated home whose spring bill crosses the 10 Apr 2026 tariff change. The bill is within 2% of the tariff; 2.06 USD of the change stays unexplained and is reported as such. |
| `example_3.json` | A winter bill 18.40 USD above the published tariff, with no earlier bills. It is flagged as a possible billing error with the amount. |

Live, the weather join runs in Zetaris with the bills written into the query. In sample mode, a request that was never recorded uses a copy of the same NOAA table saved in `data/snapshot/` (`scripts/export-snapshot.ts`, exported from Zetaris on 23 Oct 2026, weather up to 18 Oct 2026), and the trace marks that query `"source":"snapshot"`. The tariff query is the recorded one. Reading a bill image always needs the live stack, so the HTTP endpoint takes `bill.fields` only; the CLI takes `--bill <image>`.

The two-month demo, from an empty memory:

```bash
npm run demo
```

It explains Linda's September bill, stores her notes that September was a one-off and that she applied for PIPP Plus on September 25 (`samples/linda-notes.json`), explains her October bill with that memory, and explains October again without memory so the difference is visible. Results go to `out/demo/`.

To see it as a page:

```bash
npm run web:build
npm run serve
```

Then open http://127.0.0.1:8787. The server runs the same two-month demo through the agent pipeline once, then serves the explanation: each cause of the change with the agent that worked it out, the critic's checks in the order they ran (including the rejected first pass), the federated SQL and the tariff behind the numbers, and the October bill with and without Linda's note. For development, `npm run serve` in one terminal and `npm run web:dev` in another (Vite on port 5173, proxying `/api`). The server listens on 127.0.0.1 unless `HOST` says otherwise.

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

10. ActionPlanner proposes what the household can do with this bill, each with an amount worked out from the household's facts: PIPP Plus (a share of income each month: 5% with gas heat, 10% with electric heat, at least 10 USD), HEAP (31 to 546 USD once per heating season, 75% less on PIPP Plus), the Summer and Winter Crisis programs (up to 1,300 and 1,200 USD), a PUCO complaint only when the bill is above the published tariff, and a usage note when the household's own use drove the change. A program the household already told us it applied for this season is skipped. Budget billing is left out until there are 12 bills to average.
11. ReconciliationCritic checks every proposal before it is shown (check 4): income under 175% of the federal poverty guidelines for the household size (ODJFS table, Jul 2026 to May 2027, sizes 1 to 7), the program open on the bill's end date, and the crisis programs' extra condition (someone 60 or older, or a disconnection notice). A missing or malformed fact rejects the program instead of guessing. Every amount, limit and date was read from ODJFS, PUCO and AEP Ohio on 22 Oct 2026 and is listed in `src/actions/programs.ts` with its source.

Eligibility is judged at the bill's end date so a replay gives the same plan. The page then compares each program's dates with today in Ohio: a season that closed after the bill shows as "Closed on …" with no call to action.

Days and weather are separated per day: "days" is the extra days used like an average day of the previous bill, "weather" is how much hotter or colder each day of this bill was.

## Memory

Two Meterless engines, vendored in `engines/` and declared in `engines/VENDORED.md`, keep the household's memory in `.memory/<household id>/` (or `--memory <dir>`; `--no-memory` runs without it).

- H-MEM keeps what happened in words: each bill's diagnosis and what the household tells us (`npm run remember -- --household <json> --notes <json>`), tagged with the bill period it is about. Its clock is the bill's date, so replays give the same state.
- World Model keeps the household graph with provenance on every write: household, AEP Ohio (EIA 14006), the URDB tariff versions it was billed under, NOAA station USW00014821, and each bill with its diagnosis as facts.

How memory changes a diagnosis: when the household marked the previous bill as a one-off, WeatherAnalyst leaves it out of any fit and calibrates the model to the latest normal bill instead. The previous bill's extra use then shows as its own component ("last bill's one-off use did not repeat"). Without that note, the same October bill reads as "used less".

An action note (kind `action`, tagged with the program) tells ActionPlanner the household already applied: in October, with memory, PIPP Plus shows as "You told us on Sep 25" and HEAP warns that it pays 75% less once PIPP Plus is approved. Without memory, PIPP Plus is suggested again.

The sample bills are generated from the published tariff by `scripts/make-sample-bill.ts`, then rendered to PNG with a headless browser. Linda's October kWh follow a stated recipe (the Ohio prior calibrated to her August bill, applied to NOAA's degree days for that period), so in the demo her October usage matches the model by construction. Accuracy is measured on synthetic households with known causes (see Evaluation).

## Evaluation

```bash
npm run eval
```

With no `.env` this replays the recorded run and writes the same files that are committed in `eval/results/` (`summary.json`, one line per household in `households.jsonl`, and every bill-only answer in `bill-only-baseline.jsonl`).

**The households.** `npm run eval:generate` builds 30 synthetic AEP Ohio households (`eval/households.json`), each with 13 monthly bills made from a weather response the agents never see (base use per day, kWh per cooling and per heating degree day), NOAA's real Columbus weather, 5% monthly noise, and one cause injected in the last bill. There are six households per cause: a bill across the 10 Apr 2026 tariff change, a longer billing period, a change of season with nothing injected, a jump or drop in use, and a billing error (1, 3, 5, 8, 12 and -6% of the correct total). The bills are loaded into the household Postgres and read through the same federated Zetaris query as any household.

**The truth.** The same dollar accounting the agents use (price from the published tariff, then days, weather and usage in waterfall order), applied with the household's true weather response calibrated to its previous bill. So the evaluation measures whether the agents recover that response from 12 noisy bills, and whether the critic catches a bill that does not match the tariff. It does not measure BillReader: the agents get the bill fields directly. BillReader is measured on its own, below.

**The baselines.** (a) "It was the weather": the whole change goes to weather. (b) Nemotron 3 Ultra 550B through Nightshift with the bill's text and no tools, asked for the same four-part split and whether it suspects a billing error, 3 repetitions per household at temperature 0.6, with one retry when the reply is not the JSON asked for (the same treatment BillReader gets).

**Results.** Mean error per household in USD, summed over price, days, weather, usage and unexplained, and how often the biggest cause is the right one. 24 households (the 6 billing errors are scored apart); bill-only answers are pooled over the 3 repetitions.

| Households | Agents | It was the weather | Nemotron, bill only |
|---|---|---|---|
| All 24 | 5.89 USD, 23/24 | 57.82 USD, 11/24 | 69.52 USD, 21/72 |
| Price change (6) | 3.83 USD, 6/6 | 26.10 USD, 3/6 | 31.12 USD, 3/18 |
| Longer period (6) | 5.38 USD, 5/6 | 84.73 USD, 2/6 | 115.05 USD, 0/18 |
| Season change (6) | 6.14 USD, 6/6 | 13.21 USD, 4/6 | 59.17 USD, 6/18 |
| Use jump or drop (6) | 8.20 USD, 6/6 | 107.22 USD, 2/6 | 72.76 USD, 12/18 |

The 4 households that heat with electricity come out at 3.93 USD and 4/4, the 20 with gas heat at 6.28 USD and 19/20. In all 24 the critic accepted a fit on the household's own bills.

Billing errors, all 30 households: the agents flag 5 of the 6 with the exact amount and flag none of the other 24 (precision 1.00, recall 0.83). The one missed is the 1% error, under the critic's 2% tolerance on purpose. Nemotron with the bill only suspected a billing error in none of its 90 answers.

The agents give the same result in 3 runs per household. The critic closed 22 of the 24 changes. The other two are bills across the tariff change, where the agents report 2.04 and 1.44 USD as not explained instead of hiding them. The first closure check, before calibrating to the previous bill, passed 5 times out of 24.

**BillReader.** `npm run eval:billreader` reads the last bill of each of the 30 households as an image (`eval/bills/png/`, rendered from `eval/bills/<id>.html` by `scripts/render-bills.py`) with Nemotron 3.5 Super VL through Nightshift, and compares every printed field with what the generator printed: both period dates, days, kWh, total, last month's kWh, days and total, and whether the line items add up to the total. There is no text layer next to these images, so a vision failure would count as a failure. In the live run of 25 Oct 2026 (03:36 UTC, trace in `eval/results/billreader-live.trace.jsonl`) it read 30 of 30 bills with every field right, each on the first attempt, with a median of 4.3 s per bill. With no `.env` the command replays that run and gives the same result (`eval/results/billreader.json`). These are clean renders of one synthetic layout, not phone photos of real AEP Ohio bills, so the result says the model reads this layout reliably and nothing yet about a crumpled photo or AEP's own bill design.

**Limits of this evaluation.**

- The synthetic bills are priced with the same tariff engine the agents use, so a correct bill always recomputes exactly; billing error detection here only tests how large an error must be to be caught.
- Homes that heat with electricity get a heating slope of 0.7 to 1.6 kWh per heating degree day, around EIA's figure: RECS 2020 table CE4.3 gives 28 billion kWh a year of space heating for 5.20 million Midwest homes heated with electricity, about 5,400 kWh each, which over Columbus's 4,244 (2024) to 5,204 (2025) heating degree days is 1.0 to 1.3. A first run used 2.3 to 3.2 with no source; check 3 rejected those fits as above 4 times the Ohio slope and the agents fell back to the low-confidence Ohio prior. With the sourced range no fit is rejected, so this evaluation no longer exercises that fallback; unit tests do.
- 30 households, one utility, one weather station. The noise level and the size of each injected cause are choices of the generator, stated in `eval/generate.ts`.

## Sponsor technology

- **Zetaris** is where the data meets. Every run asks Zetaris, in Lightning SQL, for the household's bills in Postgres joined with NOAA's daily weather for Columbus in one federated query (WeatherAnalyst), and for AEP Ohio's published tariff versions from OpenEI URDB (RateAnalyst). Nothing is copied into the app first. EIA's Ohio retail sales are registered as a fourth source; the statewide weather prior was fitted once from them and lives as a constant in `src/agents/weatherAnalyst.ts`, so EIA is not queried on each run. Sources are registered by `npm run setup:sources` (`src/zetaris/sources.ts`), queries are in `src/zetaris/queries.ts`, and every query is logged with the agent that asked for it.
- **Meterless** runs the models and keeps the memory. Every model call goes through Nightshift (`src/llm/nightshift.ts`), and the trace records both the model requested and the model Nightshift says served it. H-MEM keeps what happened and what the household told us, and World Model keeps the household graph with provenance; both are the Meterless reference engines, vendored unchanged in `engines/` and passing their conformance suites. The memory changes the outcome: Linda's October bill reads differently with and without her September note, and a program she already applied for is not suggested again.
- **NVIDIA Nemotron** reads the bill. BillReader sends the bill image to Nemotron 3.5 Super VL and, when the vision call fails, the bill's text layer to Nemotron 3.5 Lightning. Nemotron 3 Ultra 550B is the bill-only baseline in the evaluation, which is how we know the agents add something over the largest model reading the bill alone.
- **Cursor** was not used. The organizers' HackOS FAQ lists it as optional; the code was written with Claude Code (see AI and model usage).

What is particular to this build: the models do one job, reading a document a person photographed, and everything after that is arithmetic that a critic can check against public data. Zetaris lets that check reach the household's private bills and three public sources in the same query, and the Meterless memory is what turns one diagnosis into a household history.

## AI and model usage

- Models: `nvidia/nemotron-3.5-super-vl-120b-a12b` (BillReader, bill image), `nvidia/nemotron-3.5-lightning-30b-a3b` (BillReader, text-layer fallback), `nvidia/nemotron-3-ultra-550b-a55b` (evaluation baseline only), all through Meterless Nightshift.
- Agent framework: none. The orchestrator is plain TypeScript; the analysts, the critic and the planner are deterministic code, so the same bill fields always give the same diagnosis and every number can be traced to a query or a tariff line.
- Libraries: none at runtime beyond Node 22's standard library. TypeScript runs through tsx; Vite builds the page and Vitest runs the tests.
- Development: the code, tests and documentation were written with Claude Code (Anthropic) and reviewed and run by the author. Cursor was not used.
- Sample mode: with no `.env`, `SAMPLE_MODE=true` runs the same agent code on model and SQL responses recorded from a live run (`samples/cache/`), with no network access. A new request with bill fields runs too: its weather join is computed from the saved NOAA copy in `data/snapshot/`, and the trace says so. A bill image that was never recorded needs the live stack.
- `metadata.json` lists the agents, models, sources and evaluation figures in one place.

## Data and licensing

| Source | Used for | Terms |
|---|---|---|
| NOAA NCEI daily summaries, station USW00014821 (Columbus) | Degree days per bill period | U.S. government data |
| OpenEI Utility Rate Database | AEP Ohio residential tariff versions | CC0 |
| EIA retail sales API | Ohio residential sales per customer, Jan 2025 to Jul 2026, fitted into the statewide prior | U.S. government data |
| EIA RECS 2020, table CE4.3 | Heating slope of electric-heat homes in the evaluation | U.S. government data |
| ODJFS, PUCO and AEP Ohio program pages, read 22 Oct 2026 | Program amounts, income limits and dates, each cited in `src/actions/programs.ts` | Public program information |
| Linda's household and bills | Demo | Synthetic, made from the published tariff by `scripts/make-sample-bill.ts` |
| 30 evaluation households | Evaluation | Synthetic, made by `eval/generate.ts` |

No real customer data is used anywhere.

## Limitations

- One utility and one city: AEP Ohio residential customers, weather from the Columbus airport station.
- Not yet tried on real AEP Ohio bills. The recomputation uses the tariff as URDB publishes it; a charge that URDB does not list would make a real bill look like a possible billing error.
- BillReader is measured on 30 clean renders of one synthetic bill layout (30 of 30 correct), not on photos of real bills.
- Sample mode cannot read a new bill image without Nightshift; a new bill given as fields works, with weather from the saved NOAA copy, which ends on 18 Oct 2026.
- With fewer than 6 earlier bills, the split between weather and usage rests on the statewide prior and is marked low confidence.
- Billing errors under the critic's 2% tolerance are not flagged.
- Program rules were read on 22 Oct 2026; the income table covers Jul 2026 to May 2027 and households of 1 to 7 people.
- A memory note cannot be withdrawn yet, and a program rejected for a missing fact is stored the same way as one the household is not eligible for.
- The server is for local use: no accounts, no authentication, bound to 127.0.0.1 unless `HOST` says otherwise.

## Pre-existing components

The Meterless H-MEM and World Model reference engines (Apache-2.0), vendored unchanged from github.com/Meterless/Meterless at commit `1742dec` and listed in `engines/VENDORED.md`. Everything else was written during the event, from 22 Oct 2026.

## Tests

```bash
npm test
npm run typecheck
npm run conformance:hmem
npm run conformance:world-model
```

Sample bills are synthetic and labelled SAMPLE. The household in `samples/linda.json` is illustrative.

## License

Apache-2.0, see `LICENSE`. The vendored engines keep their own Apache-2.0 license files in `engines/`.
