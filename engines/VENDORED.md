# Vendored Meterless engines

Pre-existing open-source components, declared as such in the submission.

| Folder | Source | Commit | License |
|---|---|---|---|
| `hmem/` | github.com/Meterless/Meterless, `engines/hmem` | `1742dec56a66e58eef9dda2d2b865823758ca8cd` | Apache-2.0 |
| `world-model/` | github.com/Meterless/Meterless, `engines/world-model` | `1742dec56a66e58eef9dda2d2b865823758ca8cd` | Apache-2.0 |

Fetched with `npx degit meterless/meterless/engines/<name>` on 22 Oct 2026.
Kept: the spec (`AGENTS.md`), `README.md`, `LICENSE`, the reference
implementation and the conformance runner. Removed: images, workshops, demos
and docs, which the app does not use. The reference code is unchanged.

Check them with `npm test` (reference smoke tests) and
`npm run conformance:hmem` / `npm run conformance:world-model`.
