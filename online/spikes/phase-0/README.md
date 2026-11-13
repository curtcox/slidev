# Phase 0: SDK DOM feasibility

**Blocked at S1.** On 2026-11-12, Chromium 156.0.8078.4 compiled and imported
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
No deployment was attempted. S2, S3 and S4 have not run.

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

- `2`: the documented S1 blocker was reproduced; the feasibility gate is blocked.
- `1`: setup, compilation, import, or an assertion failed unexpectedly.

The generated report is `.cache/report.json`. [evidence.json](./evidence.json)
records the actual browser run, SDK digest, fixture digests and mount errors.
The recorded bundle size measures this diagnostic subset only; it does **not**
meet or fail S4's complete-runtime size or phone-performance budgets.

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

This is a minimal S1 blocker reproduction. It does not implement the complete
Slidev Markdown plugin chain, themes, virtual modules, CSS generation, editor,
offline support, or the product's message validation. The two virtual-module
stubs exist only to bundle `SlideWrapper` for this probe. No built bundles or
modified vendor bytes are committed.

## Decision needed before continuing

Recommended: add an explicitly supported **DOM/frame execution mode** to the
HashBin SDK, release it, and vendor the new kit release. It must retain the
opaque `allow-scripts` boundary, provide a visible render surface and a private
message channel, and deliver verified runtime assets from the parent for offline
use. Then rerun S1–S4 before implementing the later phases.

Alternatively, revise the plan to permit an application-owned opaque iframe
bootstrap, retaining the same isolation and offline requirements. That changes
the confirmed SDK architecture and needs the owner's decision. Replacing the
SDK iframe's `srcdoc` locally would bypass its bootstrap rather than use its API.
