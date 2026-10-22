# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite for the page and a minimal Node server that runs the same agent pipeline the CLI runs (confirmed by Kevin, 22 Oct 2026). TypeScript ESM, Node 22. No UI framework decided beyond that.

## Users

Primary: Linda, 71, retired, lives alone in Columbus, Ohio, an AEP Ohio residential customer. Her bill jumped and she wants to know why and what she can do this month. She reads on a laptop or a phone, unhurried, often with the paper bill next to her. The persona is illustrative and synthetic; every number on screen comes from data.

Second audience: hackathon judges (Open Agent Hackathon 2026, Track 03 Reasoning Architecture). They skim the first screen, want to see distinct agents, a critic that can reject work, the SQL that federates the data, and memory that changes a decision.

## Product Purpose

Snap your electricity bill. Why So High tells you why it went up and what you can do about it this month. Success: the household understands the dollar change cause by cause, trusts it because every dollar traces to a tariff computation or a SQL query, and knows the next concrete step.

## Positioning

Each cause of the change (price, extra days, weather, usage, a one-off last month) is estimated on its own from public data, and a critic agent recomputes the bill from AEP Ohio's published tariff and rejects numbers that do not close. What is left unexplained is shown, never hidden. Memory of earlier bills and of what the household said changes the next diagnosis.

## Operating Context

- Input: a photo or image of the bill, plus the household's own history and notes.
- Data: OpenEI URDB tariffs, NOAA daily weather (station USW00014821), EIA prices and the household's bills, federated in Zetaris with Lightning SQL; Nemotron through Meterless Nightshift reads the bill.
- Agents with names: BillReader, WeatherAnalyst, RateAnalyst, UsageAnalyst, ReconciliationCritic, Orchestrator; memory through HouseholdMemory (H-MEM) and WorldModel.
- Output today: a JSON result per run (`out/`) and a JSONL trace per run (`logs/`). The two-month demo writes `out/demo/month1.json`, `month2.json` and `month2-without-memory.json`.

## Capabilities and Constraints

- Scope: one utility (AEP Ohio residential RS tariff) in Columbus, Ohio. Anything else is "not supported yet" with the reason.
- The change is split into price, one-off from the previous bill (when the household marked it), days, weather, usage and unexplained, in dollars and kWh.
- Critic checks visible in the trace: bill recompute within 2%, closure under 5% of the change, weather model credibility, freshness of tariff and weather data. A rejection sends work back with a reason.
- Confidence is low while the household has fewer than 6 earlier bills; the screen must say so.
- Actions with dollar amounts (HEAP, PIPP Plus, AEP budget billing, PUCO complaint) are not built yet (block 7). Program amounts come only from docs/11-ohio-y-piezas.md and must be rechecked before showing.
- SAMPLE_MODE replays recorded responses; the page must work in it with no credentials.

## Brand Commitments

- Name: Why So High.
- Team image chosen by Kevin: a receipt with the total circled (brand/team-image.png). Schibsted Grotesk and IBM Plex Mono were used there as references, not as a UI decision.
- No emojis anywhere. Plain words for a retiree; jargon explained on first use (HEAP, PIPP Plus, PUCO, kWh).

## Evidence on Hand

- Real runs: out/demo/*.json, logs/*.jsonl, evidencias/2026-10-22-bloque5/live-demo.jsonl.
- Sample bills: samples/linda-2026-09.png and samples/linda-2026-10.png, synthetic and labelled SAMPLE.
- Public figures with sources: docs/11-ohio-y-piezas.md.
- No real users, testimonials or customer data exist. Do not fabricate them.

## Product Principles

1. Every dollar on screen traces to a tariff computation or a SQL query.
2. Show what is not explained and what the critic rejected; never smooth it over.
3. Plain words first, evidence one step away.
4. Memory must change the answer, not decorate it.

## Accessibility & Inclusion

Primary user is 71: large readable type, strong contrast, no meaning carried by color alone, numbers with units, full keyboard access, reduced motion respected.
