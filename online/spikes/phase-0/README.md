# Phase 0: SDK DOM feasibility

**Pinned SDK blocked; candidate S1–S3 and prototype budgets pass.** On 2026-11-12, Chromium 156.0.8078.4 compiled and imported
the starter's first slide and a `<script setup>` fixture inside the unmodified
HashBin SDK sandbox. Both failed at `createApp().mount()` with
`ReferenceError: document is not defined`.

Fragment Kit v0.4.3 ships HashBin SDK v0.4.0. Its `createSandbox()` bootstraps
a **Worker inside a hidden iframe**. The supplied source runs in the Worker,
which has neither `document` nor `window`. `sandbox.frame` exposes the iframe
element to its parent, but opaque-origin isolation prevents the parent from
accessing its DOM. The bootstrap forwards messages to the Worker; it does not
offer a DOM execution mode. `hashbinSandbox.import()` also runs in the Worker.
Storage shims and a different module delivery path cannot supply the missing DOM.

This is a missing SDK capability, not evidence that Vue cannot run in an
opaque iframe. No same-origin permission or editor-origin execution was added.
No deployment was attempted. A separate, unreleased
[SDK proposal](https://github.com/curtcox/hashbin.org/pull/249) now adds opt-in
opaque DOM execution. Against that candidate, the starter and script fixture
mount successfully, the button increments, and the same results survive a fully
offline reload through a verified parent service worker. The deck frame itself
is not controlled by that worker. [candidate-evidence.json](./candidate-evidence.json)
records the S1/S3 probe; [fidelity-evidence.json](./fidelity-evidence.json) separately
records the themed S2 comparison and prototype S4 measurements.

## Reproduce

From the repository root, install the locked dependencies and Chromium:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec playwright install chromium
```

Use an existing unmodified Fragment Kit v0.4.3 release directory with `--kit`,
or prepare one from the published release (the `.cache` directory is ignored):

```sh
mkdir -p online/spikes/phase-0/.cache/release
curl --fail --location \
  https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/releases/download/v0.4.3/fragment-kit-v0.4.3.tgz \
  --output online/spikes/phase-0/.cache/release/kit.tgz
tar -xzf online/spikes/phase-0/.cache/release/kit.tgz \
  -C online/spikes/phase-0/.cache/release
node online/spikes/phase-0/.cache/release/fragment-kit/tools/vendor-sync.mjs \
  --source online/spikes/phase-0/.cache/release/fragment-kit \
  --target online/spikes/phase-0/.cache --to v0.4.3 --without-browser-engine
node online/spikes/phase-0/run.mjs \
  --kit online/spikes/phase-0/.cache/vendor/fragment-kit-v0.4.3
```

The runner checks the SDK's exact SHA-256 before using it, builds a diagnostic
runtime from this checkout, starts a temporary loopback server, and runs Chromium.
It uses the SDK's parent-side fetch proxy to import the bundle into the Worker.
It closes the browser and server after the probe. `--browser /path/to/chromium`
can select an already installed executable.

Exit codes:

- `0`: explicit candidate mode passes S1 and the diagnostic S3 offline delivery test.
- `2`: the documented S1 blocker was reproduced; the feasibility gate is blocked.
- `1`: setup, compilation, import, or an assertion failed unexpectedly.

The generated report is `.cache/report.json`. [evidence.json](./evidence.json)
records the actual browser run, SDK digest, fixture digests and mount errors.
The recorded bundle size measures this diagnostic subset only; it does **not**
meet or fail S4's complete-runtime size or phone-performance budgets.

## Test the SDK proposal

Candidate mode is an explicit development option; it never replaces a release
pin automatically. It verifies the candidate's bootstrap hash, records its SDK
digest as **UNRELEASED**, and writes `.cache/candidate-report.json` separately.
All user compilation and execution stays in the opaque frame. The original
`--kit` mode still verifies the old SDK digest and reproduces its blocker.

```sh
git clone --depth 1 --branch codex/opaque-dom-sandbox \
  https://github.com/curtcox/hashbin.org.git \
  online/spikes/phase-0/.cache/sdk-candidate
node online/spikes/phase-0/run.mjs \
  --sdk-candidate online/spikes/phase-0/.cache/sdk-candidate/frontend/sdk/hashbin.js
```

The candidate test builds and mounts online, installs a service worker with
hashes of the exact diagnostic assets, reloads under worker control, disables
the browser context's network, and reloads again. Rendering and script interaction
must match the online run, while the deck reports no service-worker controller.
The diagnostic worker uses only `slidevonline-phase0-` cache names and verifies
bytes when storing and serving them. It is not the product's Phase 6 service worker.

The SDK proposal separately passes 1,031 unit tests, 20 DOM browser checks and
16 hosted-sandbox regression checks across Chromium/WebKit. Its offline test
refuses real HTTP connections, including for WebKit. Those SDK checks do not
establish Slidev visual fidelity or complete-runtime performance. Its
[GitHub verification run](https://github.com/curtcox/hashbin.org/actions/runs/43367188879)
also passed unit, lint, DOM/hosted browser, funded-download, local API and frontend
checks; production deployment jobs were skipped for the PR.

## Theme fidelity and prototype performance

```sh
pnpm build
node online/spikes/phase-0/fidelity.mjs \
  --sdk-candidate online/spikes/phase-0/.cache/sdk-candidate/frontend/sdk/hashbin.js
```

The harness builds two reference decks through the real `slidev build` pipeline,
then compares starter slides **1, 2, 3, 8 and 16** against browser-compiled slides
inside the opaque SDK frame. References run on a separate loopback origin from
the editor harness. Both themes are pinned at **0.25.0**, licensed MIT, and pass
the compatibility build. Reports record their license hashes and source sizes.

Fixtures use local Arial/Georgia/monospace fonts, a fixed cover color, and identical
data-URL replacements for remote images. These deterministic adaptations apply
to both renderers; remote fonts/media and other themes are not covered. Selected
cases cover cover/default/center layouts, frontmatter classes, scoped styles,
Markdown typography, code highlighting, click directives and a built-in component.

All ten local comparisons have **zero exact differing pixels** at 980 × 552.
The gate allows at most 0.1% of pixels to differ by more than 8/255 in any channel;
the report also records exact differences and maximum channel deltas. After a
fully offline reload, the expanded themed runtime's first slide also matches
the CLI exactly, while its opaque frame has no service-worker controller.

The prototype is approximately **744 KB gzip** for runtime JavaScript plus CSS.
Five cold loads take approximately **1.4–1.5 seconds** on the recorded Chromium
simulation: 390 × 844, DPR 2, 4× CPU slowdown, 40 ms latency and 1.5 MB/s download.
Each sample uses a fresh context with browser cache disabled. Timing includes
SDK/runtime transfer, compilation, fonts becoming ready and two animation frames.
These are prototype measurements, not full-product or physical-phone acceptance.
The full-runtime S4 gate remains open as the remaining client features are added.

Screenshots and the generated report live under `.cache/fidelity/`. Use
`--skip-reference-build` only during development with unchanged fixtures/CLI.
CI uses `--skip-performance` explicitly: shared-runner timing does not establish
the recorded phone profile. That mode still enforces visual fidelity, offline
rendering and the prototype payload budget, and labels timing as not run.

[online-feasibility.yml](../../../.github/workflows/online-feasibility.yml) pins
the SDK proposal by commit and checks the original SDK blocker, candidate S1/S3,
and the two-theme screenshot comparison. It uploads reports and screenshots;
it does not deploy the app or silently replace the published runtime pin.

```sh
pnpm exec eslint online/spikes/phase-0 --no-warn-ignored
git diff --check
```

## Probe scope

The bundle uses the workspace's parser, real client `SlideWrapper`, click
context and cover layout, Vue's browser SFC compiler, and the Vue component
Markdown plugin used by `unplugin-vue-markdown`. Markdown compilation, script
evaluation and mounting are attempted only in the opaque execution world.
The parent renders diagnostics using `textContent`.

The S1 reproduction and the expanded fidelity prototype do not implement the
complete Slidev plugin chain, theme set, virtual modules, editor, product offline
support or product message validation. Their virtual-module stubs support only
the selected client components. Browser UnoCSS uses the client's configuration
through a narrow entry that excludes Node/JSX transformers. No built bundles or
modified published vendor bytes are committed.

## Decision needed before continuing

Review and deploy [HashBin SDK proposal #249](https://github.com/curtcox/hashbin.org/pull/249),
then publish and vendor a new Fragment Kit release carrying it. The candidate
retains the opaque `allow-scripts` boundary, provides a visible render surface
and a private message channel, and delivers runtime assets from the parent.
Rerun the gates against the released pin and validate the complete runtime's
size/performance before considering product acceptance complete.

The independent [workflow proposal #4](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/pull/4)
prepares `test.yml`'s `working-directory` input. Its
[nested-app smoke passed in Actions](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/actions/runs/43364019171),
and [Kit CI passed unit/static checks and Chromium/Firefox/WebKit](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/actions/runs/43364018975). The
owner must approve the immutable `@v3` tag after CI passes. No tags were created.

Alternatively, revise the plan to permit an application-owned opaque iframe
bootstrap, retaining the same isolation and offline requirements. That changes
the confirmed SDK architecture and needs the owner's decision. Replacing the
SDK iframe's `srcdoc` locally would bypass its bootstrap rather than use its API.
