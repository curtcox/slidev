# Plan 026: Slidev Online

## Status

- **Priority:** P1
- **State:** Phase 8 deployed; two post-launch closure items remain (see below)
- **Implementation docs:** [`online/README.md`](../online/README.md) and [`online/docs/index.md`](../online/docs/index.md)

Phases 0–7 and the Phase 8 canonical deployment are complete and live. Phase-by-phase build history and acceptance logs live in git history.

## Remaining work to close this plan

1. **Paid HashBin Publish round trip (owner action):** Execute and verify a real paid Publish save/reload round trip on `https://slides.hashbin.page/` with an owner-approved amount.
2. **Fleet rollout receipt:** Record the rollout receipts in `curtcox/Tools-for-pages-with-state-in-URL-fragments`'s `todo/rollout-status.md`.

When both items are complete, remove this plan file and its row in [`plans/README.md`](./README.md).

## Deployment topology

| Surface | URL / identifier | Notes |
| --- | --- | --- |
| Canonical origin | `https://slides.hashbin.page/` | Published from `curtcox/hashbin.org` (`slides` in `OWNED_APPS`) |
| Recovery origin | `https://curtcox.github.io/slidev/` | Deployed via `.github/workflows/online-deploy.yml` |
| HashBin client ID | `app_e9546b2e-a415-4ec5-be14-611ea0692f56` | Sole redirect URI: `https://slides.hashbin.page/` |
| Isolated AI host | `https://ai.hashbin.page/slides-v0.4.4/` | Immutable Fragment Kit `v0.4.4` host allowlisting `https://slides.hashbin.page` |
| Recovery / local AI | Direct browser connections | Used on `curtcox.github.io/slidev/` and `localhost`/`127.0.0.1`; other origins allow paste handoff only |

## Fleet constraints (do not violate)

- **No user code on the editor origin.** Deck compilation, Vue expressions, `<script setup>`, Monaco execution, and raw HTML run strictly inside opaque iframes (`sandbox="allow-scripts"`, origin `null`) created with HashBin SDK `v0.6.0`'s `createSandbox()`. Speaker notes on the editor/presenter origins render as plain text only.
- **Explicit URLs win over drafts.** An invalid link fails visibly and preserves current work and stored drafts.
- **Bound untrusted input.** Enforce the 5 MiB combined UTF-8 document limit (32 MiB on exported printable HTML) and verify CID bytes before opening.
- **HashBin Publish starts synchronously in a click** via the SDK's `publish()`. Never store OAuth tokens on the app origin.
- **Prefix all storage and cache names** with `slidevonline` (service-worker caches use `slidevonline-`).
- **Vendor bytes are immutable.** Upgrade `online/vendor/fragment-kit-v0.4.4/` only via `vendor-sync.mjs` against a published release; keep vendor and lineage licenses intact.
- **AI is opt-in and paused on apply.** Opening a deck never calls a model or loads the AI UI. Keys never reach app-origin storage, URLs, documents, or logs. Applying an AI proposal pauses rendering (`?run=0`) until explicit **Render**.
- **Keep editor shell buildless; build runtime in CI.** `online/src/` uses native ES modules; only `online/runtime` (`@slidev/online-runtime`) is Vite-built from workspace `packages/*` and never committed.
- **Keep fork changes isolated.** All Slidev Online code lives under `online/` so upstream Slidev merges stay clean.

## Ongoing risks and mitigations

- **Coupling to Slidev client internals:** Guarded by `online/runtime/virtual-modules.json` import checks, characterization tests (`runtime/tests/run.mjs`), corpus tests (`runtime/tests/corpus.mjs`), and the blocking Chromium visual fidelity gate (`runtime/tests/fidelity.mjs`).
- **Startup size and phone latency:** Guarded by lazy loading for Shiki, grammars, KaTeX, Mermaid, Monaco, QR scanner, and AI UI; build-time UnoCSS token extraction; runtime preloading; and `runtime/tests/performance.mjs`.
- **Cold-cache offline install:** The ~300-file offline asset set uses a 180 s install timeout in `online/src/offline.js` and excludes optional browser AI engines (`wllama-*`).
- **Remote media and egress privacy:** Documented in [`online/docs/sharing.md`](../online/docs/sharing.md), [`online/docs/fonts.md`](../online/docs/fonts.md), and [`online/docs/plantuml.md`](../online/docs/plantuml.md); image requests default to `no-referrer` and PlantUML requires per-preview consent.
