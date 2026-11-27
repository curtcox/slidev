# SDK DOM feasibility probe

Minimal regression harness run by [online-feasibility.yml](../../../.github/workflows/online-feasibility.yml) on PRs touching `online/**` or core workspace packages. Full product runtime, compiler, and visual fidelity tests live in [`online/README.md`](../../README.md).

## What it checks

- **Original SDK `v0.4.0` blocker (`--kit`):** Confirms that Fragment Kit `v0.4.3`'s unmodified Worker-only sandbox fails Vue mounting with `ReferenceError: document is not defined` (exit code `2`).
- **Released SDK `v0.6.0` opaque DOM sandbox (`--sdk-release`):** Verifies the published SDK SHA-256, compiles and mounts the starter cover slide and a `<script setup>` interaction fixture inside an opaque iframe (`sandbox="allow-scripts"`, origin `null`), verifies script interactivity, and confirms identical results after an offline reload through a verified parent service worker (while the opaque frame itself has no service-worker controller).
- **Two-theme visual comparison (`fidelity.mjs`):** Compares five starter slides (1, 2, 3, 8, and 16) in pinned `default` and `seriph` (`0.25.0`, MIT) against `slidev build` references on a separate loopback origin (0.1% pixel tolerance at 980 × 552, plus offline reload verification).

## Usage

From the repository root after `pnpm install --frozen-lockfile` and `pnpm build`:

```sh
# Verify released HashBin SDK v0.6.0 mounting, interaction, and offline reload
node online/spikes/phase-0/run.mjs \
  --sdk-release online/vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs

# Compare five starter slides in default and seriph against slidev build
node online/spikes/phase-0/fidelity.mjs \
  --sdk-release online/vendor/fragment-kit-v0.4.4/vendor/hashbin-sdk-v0.6.0.mjs \
  --skip-performance
```

Options:

- `--sdk-release <path>`: requires the exact SHA-256 of published HashBin SDK `v0.6.0`.
- `--kit <dir>`: checks an unmodified Fragment Kit `v0.4.3` directory to reproduce the `v0.4.0` blocker (expected exit code `2`).
- `--browser <path>`: selects an existing Chromium executable.
- `--skip-performance`: skips the local phone-throttling benchmark (used on shared CI runners).
- `--skip-reference-build`: reuses cached CLI reference builds during local iteration when fixtures and CLI are unchanged.

Exit codes for `run.mjs`:

- `0`: SDK `v0.6.0` mounting, interactivity, and offline reload passed.
- `2`: Original SDK `v0.4.0` Worker-only blocker reproduced.
- `1`: Setup, compilation, import, or assertion failure.

## Scope

This probe uses a minimal subset of `@slidev/parser`, `@slidev/client`, Vue's browser SFC compiler, and browser UnoCSS, with its own `slidevonline-phase0-` diagnostic service-worker cache. Reports and screenshots write to `online/spikes/phase-0/.cache/` (gitignored).
