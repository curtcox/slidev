# Implementation Plans

Open implementation plans for this repository. Completed plans are removed when shipped (history lives in git).

Each plan is a **self-contained handoff**: read the plan fully before starting, run its drift check and verification commands, honor its STOP conditions, and remove the plan file and its row below when done.

Verification baseline for core Slidev packages:

```sh
pnpm verify      # build → typecheck → lint → test
pnpm size:check  # verify tracked files stay within size limits
```

For Slidev Online verification commands, see [`online/README.md`](../online/README.md).

## Open plans

Ordered by leverage and dependencies. You may cherry-pick — only the edges in **Dependency notes** are hard requirements.

| Plan | Title | Priority | Effort | Risk | Depends on | Status |
|------|-------|----------|--------|------|------------|--------|
| [005](./005-agents-md.md) | Add contributor `AGENTS.md` | P3 | S | LOW | — | TODO |
| [009](./009-parserangestring-bounds.md) | `parseRangeString` lower-bound / NaN validation | P2 | S | LOW | — | TODO |
| [010](./010-getslidepath-guard.md) | Harden `getSlidePath` against unknown slide | P2 | S | LOW-MED | — | TODO |
| [012](./012-hmr-utils-refresh.md) | Fix no-op HMR `utils` refresh (missing `await`) | P2 | S | LOW | — | TODO |
| [013](./013-build-temp-server-port.md) | Free port + cleanup for build's temp servers | P2 | S-M | MED | — | TODO |
| [016](./016-confine-export-output-path.md) | Confine export output path from deck `exportFilename` | P2 | S | LOW | — | TODO |
| [017](./017-ws-origin-validation.md) | Validate WebSocket Origin on privileged ws handlers | P2 | M | MED | — | TODO |
| [018](./018-server-side-remote-auth.md) | Enforce `--remote` auth server-side (not just client) | P3 | M-L | MED | — | TODO |
| [019](./019-getroots-cache-per-entry.md) | Key `getRoots()` cache by entry (multi-entry build/export) | P2 | M | MED | — | TODO |
| [020](./020-getslide-lookup-map.md) | O(1) slide lookup Map (fix O(n²) TOC) | P2 | S | LOW | — | TODO |
| [021](./021-consolidate-toc-tree.md) | Consolidate divergent `addToTree` TOC builders | P2 | M | MED | — | TODO |
| [022](./022-export-pipeline-tests.md) | Test the export pipeline (characterization tests) | P1 | M | LOW | — | TODO |
| [023](./023-decompose-god-functions.md) | Decompose god functions in `export.ts`/`cli.ts` | P3 | L | MED | 022 | TODO |
| [024](./024-incremental-hmr-parse-cache.md) | Incremental HMR parse cache | P3 | L | MED | — | TODO |
| [025](./025-skills-docs-drift-guard.md) | Guard `skills/`-vs-`docs/` drift in CI | P3 | S-M | LOW | — | TODO |
| [026](./026-slidev-online.md) | Slidev Online (browser editor on Fragment Kit) | P1 | XL | MED-HIGH | — | DEPLOYED — `slides.hashbin.page` live with registered HashBin client and `/slides-v0.4.4/` AI host; paid Publish round trip and Fragment Kit rollout-status receipts remain |

Status values: `TODO` | `IN PROGRESS` | `DEPLOYED` | `DONE` | `BLOCKED` (one-line reason) | `REJECTED` (one-line rationale).

> **Note on core audit plans (005–025):** These plans were originally authored against commit `c63cb120` (Slidev v52.16.0). Always run each plan's drift check first against current `main`.

## Dependency notes

- **023 requires 022:** Do not refactor `exportSlides`/serve handlers until the export characterization tests exist (023's safety net).
- **021 ↔ 022:** 021 moves `addToTree` into `@slidev/parser` as `buildTocTree`; 022 tests the export TOC path. They can land in either order; re-run the other's tests afterward.
- **018 subsumes the network-exposure parts of 017:** Still land 017 (Origin validation) as defense-in-depth regardless.
- **012 ↔ 024:** 012 makes the per-HMR `utils` refresh actually run (`await`); 024 reduces the parse cost that makes per-HMR work expensive. See 012's STOP condition if cost proves high before 024 lands.
- **010 ↔ 020:** Both touch `packages/client/logic/slides.ts` (`getSlide`/`getSlidePath`). Preserve both changes when landing the second one.

## Security cluster

Plans **016, 017, and 018** continue hardening the **dev-server + parser trust boundary** (building on `vite/importGuard.ts` and already-shipped read/write path confinement): confining `exportFilename` output paths (016), validating WebSocket Origins (017), and enforcing `--remote` authentication server-side (018).

## Findings considered and rejected (do not re-audit)

- **`export.ts` Playwright-resolution fallback chain** — deliberate 4-location fallback ending in a helpful `throw`, not swallowed errors.
- **`importGuard.ts` skipping dynamic imports with `${` template specifiers** — accepted limitation; defense-in-depth atop Vite's `server.fs.strict`, does not widen `fs.allow`.
- **`resolver.ts` `catch {}` blocks** — deliberate best-effort resolution fallbacks.
- **prettier v2 (`packages/vscode`) vs v3 (root)** — documented decision (`taze.config.ts`).
- **PlantUML default egress to `plantuml.com`** (`packages/parser/src/config.ts`) — by-design and documented.
- **Minor version drift** (`@types/katex` vs `katex`, `@hedgedoc/markdown-it-plugins` patch, `@lillallol/outline-pdf`) — low leverage; monitor rather than dedicating a plan.
- **Global-install E2E disabled in `smoke.yml`** — documented pnpm limitation, not a defect.

## Direction findings (unplanned ideas)

- **D1:** Agent deck-authoring LM tools (write side of `packages/vscode/src/lmTools.ts`, over `@slidev/parser`'s `stringify`/`parseSlide`).
- **D2:** A `skills/` generator (`scripts/gen-skills.ts`) behind plan 025's drift guard.
- **D3:** Backend-agnostic deck introspection (extract `lmTools.ts` into CLI subcommands or an MCP server).
- **D4:** Finish per-image snapshot export (`packages/slidev/node/integrations/snapshots.ts` TODO).
