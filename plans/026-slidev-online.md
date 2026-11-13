# Plan 026: Slidev Online — author and present Slidev decks in a web browser

> **Executor instructions**: This is a multi-phase master plan. Do the phases in
> order unless "Parallelism" says otherwise. Each phase ends with its own
> verification and STOP conditions. Update the status table at the bottom and
> the row in `plans/README.md` as phases land. Report only browsers and
> deployments that actually ran.

## Status

- **Priority**: P1 (new product surface)
- **Effort**: XL (8 phases)
- **Risk**: MED-HIGH (in-browser compilation of Slidev is new; Phase 0 de-risks it)
- **Depends on**: Fragment Kit v0.4.4 carrying SDK v0.6.0 (prepared), immutable kit workflow `@v4` (published)
- **Planned at**: commit `437f139c` (Slidev v53.1.0), 2026-11-12

## Goal

A static web app, served from GitHub Pages, where anyone can write a Slidev deck
in the browser, see it rendered live by the real Slidev client, present it, and
share it. This is to Slidev what [Python Online](https://curtcox.github.io/PythonOnline)
is to Python. It ships with the same enhancements the fleet carries over the original
GraphvizOnline:

1. Links to docs and a gallery of example decks
2. Mobile-friendly layout (phone tabs, ≥40 px targets, ≥16 px inputs)
3. Loading and saving through hashbin.org (CID links, HashBin Publish)
4. QR code of the current URL
5. Editing slides indirectly by asking AI for changes (opt-in, review before apply)

It is built on the shared [Fragment Kit](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments)
and deployed with its reusable GitHub Actions workflows, exactly as PythonOnline is.

## Decisions (confirmed with the owner, 2026-11-12)

| Topic | Decision |
|---|---|
| Rendering | **In-browser compiler.** Build Slidev's real Vue client once in CI. Parse `slides.md`, transform it with Slidev's markdown-it pipeline and compile each slide to Vue in the browser. |
| Hosting | **GitHub Pages first** (`https://curtcox.github.io/slidev/`, the recovery origin). A canonical `slides.hashbin.page` comes last (Phase 8). |
| Document | **`slides.md` + optional `style.css`.** Per-slide `<script setup>` and inline Vue/HTML are allowed. Images come from URLs. |
| Themes | **Bundled, pinned official set**, offline-capable. No npm-on-demand loading. |
| Location | **`online/` in this fork.** It builds from the workspace's `@slidev/*` source. The kit gets a new immutable workflow tag `@v4` that adds a `working-directory` input. |

## Constraints inherited from the fleet (do not violate)

From PythonOnline's `AGENTS.md` and the Fragment Kit `AGENTS.md` / `docs/contracts.md`:

- **No user code with the editor's origin.** Rendering a deck runs code the
  author wrote: Vue expressions, `<script setup>`, raw HTML. All of it runs only
  inside an opaque sandbox (`sandbox="allow-scripts"`, origin `null`) created
  with the HashBin SDK's `createSandbox()`, as PythonOnline does for Python.
  Incoming links, gallery examples and imported documents always start opaque.
- **Explicit URLs win over drafts.** An invalid link fails visibly and never
  silently replaces the stored document.
- **Bound untrusted bytes before decoding** (5 MiB default) and verify CIDs.
- **HashBin Publish starts synchronously in a click** through the SDK's
  `publish()`. Never hold OAuth tokens on the app origin. Never invent a
  client ID; until one is registered, saving shows the kit's "needs a
  registered client ID" message.
- **Prefix all storage and cache names** with `slidevonline`.
- **Vendor bytes are immutable.** Upgrade the kit by vendoring a new release with
  `vendor-sync.mjs`, never by editing it. Keep vendor and lineage licenses,
  including `LICENSE-graphvizonline`.
- **AI is opt-in.** Loading a link never calls a model. Keys never reach
  app-origin storage, URLs, documents or logs. Model output is text-rendered
  and applied only by explicit user action. **Accepting an AI change is not
  permission to execute it**: re-rendering after an AI apply needs a click.
- **Deployment and tests are separate workflows.** Never claim a deploy
  succeeded without checking the workflow run or the live page.

One deliberate deviation: the fleet apps are buildless, but this one is not.
The *editor shell* stays buildless native ES modules, like the fleet. The
*Slidev runtime* (Vue client, compiler, themes) is a Vite bundle built in CI from
`packages/*`. That bundle is never committed. It is derived output of this
monorepo, and committing it would churn every upstream merge.

## Architecture

```
online/                          npm package (own package.json + package-lock.json)
├── index.html                   editor page (CSP, verify marker, kit shell)
├── gallery.html                 kit gallery of example decks
├── docs/*.md → docs/*.html      Online-specific docs (what's supported, sharing, AI)
├── src/
│   ├── app.js                   wiring: shell, editors, URL state, drafts, preview bridge
│   ├── document-type.js         DocumentType "slidev" (normalize/isDefault/validate)
│   ├── editor.js                Ace (vendored, pinned): slides.md + style.css tabs
│   ├── preview-bridge.js        sandbox lifecycle + postMessage protocol
│   ├── ai.mjs                   kit AI mount (Ask, settings, compare models)
│   └── examples.js              generated catalog (from examples/*.md)
├── examples/*.md                gallery decks (source of truth)
├── runtime/                     pnpm workspace package `@slidev/online-runtime` (Vite build)
│   ├── src/compiler/            markdown → per-slide Vue SFC → JS module (browser)
│   ├── src/virtual/             runtime replacements for `#slidev/*` virtual modules
│   ├── src/shims/               fs/snippet/storage shims for the opaque sandbox
│   ├── src/sandbox-entry.ts     receives {src, css, slide} → compiles → mounts client
│   └── vite.config.ts           aliases into ../../packages/client, parser, slidev/node/syntax
├── vendor/fragment-kit-v0.4.3/  vendor-sync'd, immutable
├── vendor/ace-<ver>/            pinned Ace (markdown, css, yaml modes)
├── fragment-kit.config.json     slug, storagePrefix, origins, ai deployments
├── offline.config.json          ship list for the service worker
├── gallery.config.mjs           covers rendered from slide 1 of each example
├── ai-suite.json                model-comparison tasks
├── testing-contract.config.mjs  kit contract adapter
├── scripts/                     build.mjs, render-docs.mjs, gen-examples.mjs, check.mjs
└── tests/                       node --test units + tests/browser/*.cjs
```

### Two execution worlds

| Editor origin (`curtcox.github.io/slidev/`) | Opaque sandbox (origin `null`) |
|---|---|
| Kit shell, Ace, URL state, drafts, HashBin, QR, AI panel | The Slidev runtime bundle |
| `@slidev/parser` for slide boundaries, titles, notes (pure parsing, no eval) | Markdown→SFC compile, `@vue/compiler-sfc`, evaluation, Vue mount |
| Presenter notes are rendered as **text** only | UnoCSS generation, Shiki, KaTeX, Mermaid, theme layouts |
| Fullscreen of the iframe *element* (Present) | Keyboard and click navigation inside the deck |

The bridge protocol is versioned, with bounded, schema-checked messages:
- parent → sandbox: `render {src, css, slide, click, dark}`, `goto {slide, click}`, `print`
- sandbox → parent: `ready`, `rendered {slides, errors[]}`, `position {slide, click}`, `error {slide, message, line}`

Slidev's client uses `localStorage`, `BroadcastChannel` and similar APIs, which
throw in an opaque origin. `src/shims/` replaces them with in-memory versions. Dark
mode, drawings and the current position are reported to the parent and kept there.

### In-browser compile pipeline (inside the sandbox)

1. **Parse**: `@slidev/parser` core (`packages/parser/src/core.ts`, already
   browser-safe: `yaml` + `@antfu/utils`) plus `resolveConfig` from `config.ts`.
2. **Markdown → Vue SFC per slide**: reuse Slidev's markdown-it plugin chain
   `useMarkdownItPlugins` (`packages/slidev/node/syntax/index.ts`), with
   browser substitutes:
   - `snippet` (`<<<` file imports) and `src:` slide imports → visible
     "not available online" error on that slide
   - `shiki` → Shiki with the JavaScript regex engine. Grammars for the
     top ~40 languages are bundled and lazily loaded; unknown languages fall
     back to plain text with a notice.
   - `katex`, `magic-move`, `mermaid` (client-rendered), `drag`, `slot-sugar`,
     `scoped`, `link`, footnotes, task lists, GitHub alerts, comark → unchanged
   - `plant-uml` → **off by default**. It sends diagram text to plantuml.com
     (an existing upstream default; see the rejected finding in `plans/README.md`).
     A per-deck click enables it.
   - `monaco` / `monaco-run` → Phase 7. Until then they render as static
     Shiki blocks with a notice.
   - twoslash → unsupported (needs a TS language service). Renders as a plain code block.
   Then apply the code transforms the Vite plugins do: unplugin-vue-markdown's
   SFC wrapping, `setups/transformers`, `vite/layoutWrapper.ts` and
   `vite/contextInjection.ts`.
3. **Compile**: `@vue/compiler-sfc` (browser build) → `compileScript`,
   `compileTemplate`, `compileStyle` (scoped). Bare imports (`vue`,
   `@slidev/client/*`, layouts, built-in components, icons) are rewritten to
   a runtime module registry. Modules evaluate from `blob:` URLs, which the sandbox CSP allows.
4. **Virtual modules**: implement every `#slidev/*` module the client imports
   (`configs`, `slides`, `global-layers`, `title-renderer`, `setups/*`,
   `monaco-run-deps`, `custom-nav-controls`) in `runtime/src/virtual/` as
   reactive state the compiler updates. Templates live in
   `packages/slidev/node/virtual/`. **Guard**: `scripts/check.mjs` fails if the
   client imports a `#slidev/*` specifier with no runtime implementation, so
   upstream merges cannot break it silently.
5. **CSS**: UnoCSS `createGenerator` with Slidev's config
   (`packages/client/uno.config.ts`) merged with the active theme's config. It runs
   over the compiled slide source, which is deterministic and cheaper than
   `@unocss/runtime`'s DOM observer. Then the theme styles and the document's `style.css`.
6. **Icons**: `<carbon-*>`, `<ph-*>` and similar normally come from unplugin-icons at
   build time. Online, a curated set of Iconify collections is lazily loaded as
   separate chunks: carbon, ph, mdi, logos, simple-icons, twemoji, svg-spinners.
   Unknown icons render as a visible placeholder.
7. **Incremental**: cache compiled modules per slide, keyed by content hash
   plus config hash. Re-render after a 500 ms typing debounce. Re-compile only
   the slides that changed. Changing the headmatter invalidates everything.

**Upstream-merge hygiene**: Change `packages/*` only when a seam must be
exposed, for example to extract a browser-safe transform from
`vite/layoutWrapper.ts`. Make each such change a small, upstreamable commit
with its own tests. Prefer shims and Vite aliases in `online/runtime`
over edits to `packages/*`.

### Themes (bundled, pinned)

`@slidev/theme-default` and `@slidev/theme-seriph` (already in the `themes`
catalog), plus `apple-basic`, `bricks` and `shibainu`. Before adding each one, check its
license, that it works with Slidev 53, and its size. Drop any that fail, and record why. Theme
`layouts/*.vue`, `components/`, `styles/`, `uno.config`, `setup/*` and
`fonts` are compiled into the runtime at build time. Headmatter `theme:`
selects one. An unknown theme shows a visible notice and falls back to
`default`. Theme `fonts:` that pull from Google Fonts are allowed in
the sandbox CSP (`font-src`/`style-src` for `fonts.googleapis.com`/`fonts.gstatic.com`).

### Feature support matrix (shipped in `docs/supported.md`)

| Supported in Phase 2–3 | Later phase | Not supported online |
|---|---|---|
| Headmatter/frontmatter, built-in and theme layouts, `::slot::` sugar, notes, `v-click`/`v-clicks`/`v-after`/`v-motion`, code line highlighting with click steps, magic-move, KaTeX, Mermaid, scoped `<style>`, per-slide `<script setup>`, transitions, dark mode, `v-drag` (positions written back to the editor), built-in components (Toc, Arrow, Youtube, Link, RenderWhen, …), global `style.css` | Monaco editor / monaco-run (7), print-to-PDF (7), presenter view (7), PlantUML opt-in (2), addons (curated, post-launch) | `src:` / snippets (multi-file), custom `components/`, `layouts/`, `setup/` dirs, twoslash, recording/camera, remote-control sync, npm themes on demand |

### Document model and URLs

DocumentType `slidev` (envelope `format: hashbin-diagram`, `version: 1`, `type: slidev`):

```json
{ "src": "<slides.md>", "slidev": { "css": "<style.css>" } }
```

- `normalize` validates `src` (string, ≤5 MiB total) and `slidev.css` (string,
  default `""`), preserves unknown fields under `slidev` for forward
  compatibility, and rejects every other top-level field.
- `isDefault` is true when `css` is empty. Default documents encode as a bare source string.
- `fileName` `slides.md`; `contentType` `text/markdown`. "Download" offers
  `slides.md`, `style.css`, or a zip of both.
- Links: `#v1.<lz-string>` (kit default), `#<cid>`, `?example=<id>`,
  `?slide=<n>` (start position), `?view=edit|preview|present`, and `?run=0`
  (don't render until the user presses Render). This is a new app, so it has
  **no `legacyWriter` and no legacy readers**.

### UI

- Kit `createShell`: resources (**Slidev docs** → `https://sli.dev/guide/`,
  **Syntax** → `https://sli.dev/guide/syntax`, **Online docs** → `docs/`,
  **Gallery** → `gallery.html`), document actions (Render, Present, Share,
  QR, Save to HashBin, Open, Download, Ask AI), and status.
- Kit `mountMobileTabs` with panels **Slides** / **Markdown** / **CSS**, using
  `desktop:true` so desktop gets the Split view with a draggable divider. Phones
  (≤760 px wide or ≤500 px tall) get tabs, a More menu, ≥40 px buttons and
  ≥16 px editor text.
- Preview toolbar: prev/next, `n / total`, overview grid, dark toggle, Present.
  Swipe and tap navigation on phones.
- Editor↔preview sync: moving the cursor goes to that slide (the parser's
  per-slide line ranges), and navigating the preview reveals that slide's source.
  Compile errors become Ace annotations on the right line.
- Present: fullscreens the iframe element from the parent, forwards keys and
  keeps the shareable `?slide=` position up to date.

## Phases

### Phase 0 — Feasibility spikes (timeboxed: 3 days total)

On a throwaway branch, prove each one in a real browser:

- **S1** Compile and render `demo/starter/slides.md` slide 1 (and a `<script setup>` slide)
  with the real `@slidev/client` inside an opaque `createSandbox()` iframe.
- **S2** UnoCSS plus theme-default and seriph layouts match `slidev build` visually
  on 5 starter slides.
- **S3** Load the runtime bundle into the opaque sandbox from a service-worker-backed
  page while **offline**. The sandbox is not controlled by the service worker.
  Confirm the delivery path, either via `hashbinSandbox.import()` as PythonOnline
  does for Pyodide or by posting verified bytes as Blobs.
- **S4** Size budget: initial sandbox payload ≤ 3 MB gzip, excluding lazy
  Mermaid/KaTeX/grammar/icon chunks. First render ≤ 2 s on a mid-range phone
  profile.

**STOP** if S1 needs `allow-same-origin` or any app-origin execution, if S3
has no offline path, or if S4 is over budget by more than 2×. Report the options
to the owner instead of proceeding.

### Phase 1 — Skeleton, CI and deploy

1. **Kit `@v4`** (PR in the tools repo, owner approves the tag): add an
   optional `working-directory` input (default `.`) to `test.yml`. It applies to
   `npm ci`, `npm test`, `npm run check`, the gallery check, the Playwright
   contract run and `actions/setup-node`'s `cache-dependency-path`. `pages.yml`
   and `kit-check.yml` already work from this repo (`stage-command`/`path`,
   `kit-path`), so they stay at `@v2`. `@v4` is a new immutable tag; `@v2` is
   not touched.
2. `online/` scaffold: `package.json` (`node --test`, check, gallery, docs, offline,
   serve; pinned `playwright` and `@playwright/test`), `vendor-sync` kit v0.4.3,
   `fragment-kit.config.json` (slug `slidev`, `storagePrefix: slidevonline`,
   `recoveryOrigin: https://curtcox.github.io/slidev/`, `canonicalOrigin` left
   unset until Phase 8), and an `index.html` with CSP and the verify marker
   `slidev-fragment-kit-v0.4.3`.
3. `online/runtime` added to `pnpm-workspace.yaml`. The online files are excluded
   from the root ESLint, `vue-tsc` and vitest, or given matching configs. Vendored
   directories are always ignored.
4. Workflows, mirroring PythonOnline:
   - `.github/workflows/online-test.yml`: `pull_request`, `workflow_call` and
     `workflow_dispatch` run `curtcox/…/test.yml@v4` with
     `working-directory: online`, plus a `pre-test` of
     `corepack enable && pnpm install --frozen-lockfile && pnpm build && pnpm -C online/runtime build`.
     `kit-check.yml@v2` uses `kit-path: online/vendor/fragment-kit-v0.4.3`.
   - `.github/workflows/online-deploy.yml`: `push` to `main` and
     `workflow_dispatch` run the test workflow first, then `pages.yml@v2` with a
     `stage-command` that builds and assembles `online/dist`
     (shell + runtime + `release.json {commit, dirty:false}` + offline manifest)
     and `path: online/dist`.
5. **Owner action**: set this repo's Pages source to **GitHub Actions**.

**Verify**: a "hello" deck renders at `https://curtcox.github.io/slidev/`.
The deploy job's marker check passes. Upstream's own workflows (`test.yml`,
`release.yml`, Netlify docs) are unaffected.

### Phase 2 — Slidev runtime (`online/runtime`)

Build the compile pipeline, virtual modules, shims, themes, UnoCSS, Shiki,
KaTeX, Mermaid, icons, the incremental cache and the bridge protocol described
above. Include the `#slidev/*` coverage check in `check.mjs`.

**Tests** (vitest in `online/runtime`, run in `pre-test`):
- Transform characterization: for every slide in `demo/starter`,
  `demo/composable-vue` (minus multi-file features) and `online/examples`, the
  generated SFC matches the CLI's transform output. Compare against snapshots
  produced by the real Vite plugin chain on the same input.
- Every unsupported feature produces its documented, visible notice. Nothing
  fails silently.
- Opaque-origin shims: no `localStorage`/`BroadcastChannel` access escapes.

**Fidelity gate** (Playwright, non-blocking report at first, blocking once
stable): screenshot each example slide from `slidev build` and from the
online runtime, then diff with a pixel tolerance.

### Phase 3 — Editor app

Kit shell, Ace editors, DocumentType, `createUrlState` (v1 fragments, CID,
`?example`), local drafts with explicit recovery, preview bridge, mobile tabs,
resource links, editor↔preview sync, error annotations, Share (kit share
dialog plus the is.gd shortener, as the fleet does), **QR** (kit
`qr-dialog`: the saved-CID link when the editor still matches that save,
otherwise the full document, or a "save to HashBin first" message when
too long), and **HashBin** loading of `#<cid>`.

**HashBin Publish**: wire `HashBinStore` now. Saving stays disabled with the
kit's message until the **owner registers a HashBin client** with return URL
exactly `https://curtcox.github.io/slidev/`. The registered ID then goes into
`index.html`.

**Tests**: kit contracts (`url-identity`, `sharing`, `qr-roundtrip`,
`hashbin-callback`, `draft-recovery`, `mobile-layout`) through
`testing-contract.config.mjs`. Its `getDocument`/`edit` read and write the
Ace models for both files. App browser tests cover: render every example; navigation;
editor↔preview sync; `?slide`, `?view` and `?run=0`; invalid links keep the current
document; and **sandbox isolation**: a hostile deck cannot read the parent's
storage or cookies, navigate the top window, or reach the editor DOM.

### Phase 4 — Docs and gallery

- `online/docs/`: `index.md` (overview), `supported.md` (the matrix above),
  `sharing.md` (links, QR, HashBin, privacy of remote images and fonts),
  `ai.md`. `npm run docs` renders them to HTML, as PythonOnline does.
- `online/examples/*.md` (source of truth), turned into `src/examples.js` by
  `scripts/gen-examples.mjs`. Starting set: welcome/starter (adapted
  from `demo/starter`), a layouts tour, clicks and animations, code
  highlighting and magic-move, Mermaid and KaTeX, two-cols with slots,
  v-drag, `<script setup>` interactivity, one showcase per bundled theme,
  and a "conference talk" template.
- `gallery.html` with the kit gallery. `gallery.config.mjs` renders covers from
  slide 1 of each example with `render-gallery.mjs`. Covers and fingerprints
  are committed, and the `--check` mode runs in CI.

### Phase 5 — AI-assisted editing

Mount the kit AI like PythonOnline's `src/ai.mjs`:

- `type.ai = { describe, output: 'edits', paths: ['/src', '/slidev/css'], validate, checks: { compiles } }`
  - `describe`: "Slidev deck. `src` is Slidev Markdown: optional YAML
    headmatter, slides separated by `---` lines, per-slide frontmatter,
    `<!-- notes -->`. `slidev.css` is global CSS. Preserve unrelated slides,
    frontmatter keys and notes. Supported features are in docs/supported.md."
  - `validate`: parses with `@slidev/parser`, rejects zero slides, and checks
    that headmatter is valid YAML.
  - `checks.compiles`: compiles the proposal in a **fresh opaque sandbox**
    (never the live preview) and reports per-slide errors, the same pattern as
    `createPythonAiCheck`.
- `onApply` follows the ordinary edit path (drafts, revision guard, URL
  commit). It then **pauses the preview** with an "AI change applied —
  Render" button, because accepting a change does not authorize executing it.
- Ask panel in a dialog, AI settings in More, Compare models backed by
  `ai-suite.json`. Example tasks: add a summary slide, convert slide 3 to two-cols,
  switch the theme to seriph, add click reveals to a list, restyle headings via CSS,
  fix a broken frontmatter block.
- `fragment-kit.config.json` → `ai.deployments`: recovery origin and
  `127.0.0.1:8000` / `localhost` use `connection: 'direct'`. Routes and pinned model
  match PythonOnline's. Budgets start at 0, so users set their own.

**Tests**: the AI paste flow with a mocked provider (no network), the undo
guard, the render pause after apply, and that the AI check never touches the
live preview.

### Phase 6 — Offline / PWA

`manifest.webmanifest`, icons, `service-worker.js` built on the kit's
`sw-core`. `offline.config.json` covers the shell, the kit, Ace, the runtime
bundle, themes, Shiki grammars, icon chunks, KaTeX fonts and Mermaid. The stage
command generates `offline-assets.js` after the runtime build, and `npm run check`
verifies it. Caches use the prefix `slidevonline-`. Updates preserve editor work. Runtime delivery into
the opaque sandbox uses the path proven in S3. Run the kit's `offline.spec.js`
contract, plus a fully offline reload that renders the gallery.

### Phase 7 — Presenting and export

- Presenter view in a second editor-origin window. It has notes (text),
  a timer, and a next-slide preview in its own opaque sandbox. Position syncs between
  the parent windows; sandboxes never talk to each other.
- Print / PDF via a print-mode render. Needs a spike: whether opaque sandboxes may
  call `print()` depends on the SDK's sandbox flags. If they can't, use a
  "Download standalone HTML" export that the user prints from a normal tab.
- Monaco code blocks (`{monaco}`, `{monaco-run}`), loaded lazily. `monaco-run`
  executes only inside the deck sandbox. TypeScript ATA stays disabled
  (no CDN type fetches).

### Phase 8 — Canonical origin (owner actions required)

- A PR in `curtcox/hashbin.org` adds the app to the central publisher (manifest
  staging with the `slidevonline-` cache prefix) and serves `slides.hashbin.page`.
- Update the HashBin client registration with return URL
  `https://slides.hashbin.page/`. `canonicalOrigin` in config.
- AI: canonical deployment uses `connection: 'host'` via
  `https://ai.hashbin.page/v0.4.0/`. **Owner** adds the origin to the AI host
  allowlist.
- Live Chromium/WebKit acceptance on both origins: CID load, QR upload, 360 px
  layout, offline reload and repair, Publish round trip. Record the evidence in
  the tools repo's `todo/rollout-status.md`.

## Parallelism

- Phase 1 step 1 (kit `@v4`) is independent and can start right away.
- After Phase 2's bridge protocol is fixed, Phase 3 (editor) and the rest of
  Phase 2 (runtime) proceed in parallel against a stub sandbox.
- Phase 4 examples can be written during Phase 2. Covers need Phase 3.

## Owner actions (cannot be done by an agent)

| When | Action |
|---|---|
| Phase 0 (discovered prerequisite) | SDK v0.6.0 deployed with approval; review/approve the new Fragment Kit release carrying it |
| Phase 1 | DONE: owner approved immutable workflow `@v4`, published at `3de01b1`; existing `@v3` was preserved |
| Phase 1 | Set this repo's GitHub Pages source to "GitHub Actions" |
| Phase 3 | Register a HashBin client for Slidev Online (return URL = recovery origin); provide the client ID |
| Phase 8 | Approve the hashbin.org publisher PR and DNS for `slides.hashbin.page`; update the registration return URL; allowlist the origin on `ai.hashbin.page` |

## Risks

- **Coupling to client internals.** The runtime depends on `#slidev/*` virtual
  module shapes and the Vite transform order. Mitigations: the coverage check,
  transform snapshots against the real plugin chain, the fidelity gate, and
  online CI on every upstream merge.
- **Bundle size and phone performance.** Mitigations: the S4 budget, lazy
  chunks, per-slide incremental compile, and lazy creation of the sandbox on phones.
- **Opaque-origin API gaps** (storage, popups, print, fullscreen). Mitigations:
  shims plus parent-side features, proven in S1/S3 and the Phase 7 spike.
- **Shared links can embed remote media.** That's normal web behavior, but a
  privacy concern. Documented in `sharing.md`. PlantUML egress is opt-in.
- **Fork maintenance.** All online work lives under `online/`. Any `packages/*`
  seam is a small upstreamable commit.

## Phase status

| Phase | Title | Status |
|---|---|---|
| 0 | Feasibility spikes | IN PROGRESS — released SDK S1–S3 and prototype S4 pass; kit release and full-runtime budget pending |
| 1 | Skeleton, CI, deploy (+ kit `@v4`) | IN PROGRESS — @v4 published; welcome scaffold prepared and locally verified; kit publication/deploy pending |
| 2 | Slidev runtime | TODO |
| 3 | Editor app (share, QR, HashBin, mobile) | TODO |
| 4 | Docs and gallery | TODO |
| 5 | AI-assisted editing | TODO |
| 6 | Offline / PWA | TODO |
| 7 | Presenting and export | TODO |
| 8 | Canonical origin | TODO |

### Phase 0 evidence (2026-11-12)

Implemented a reproducible S1 blocker probe in
[`online/spikes/phase-0/`](../online/spikes/phase-0/README.md) on branch
`codex/026-slidev-online-feasibility`, based on
`f01ef1ef236b8b1d6f70dcb7672065f03bf50eff`.

- **Actually ran:** Chromium 156.0.8078.4, using Fragment Kit v0.4.3's
  unmodified HashBin SDK v0.4.0. The runner verifies the SDK's pinned SHA-256.
- **S1 blocked:** the starter's first slide and a `<script setup>` fixture both
  compile and import in the sandbox, then fail at Vue mount with
  `ReferenceError: document is not defined`. `createSandbox()` runs supplied
  code in a Worker inside a hidden iframe, not in the iframe's DOM world.
  The actual sandbox flags remain `allow-scripts`, with origin `null`.
- **S2–S4 not run.** No visual fidelity, offline runtime delivery, full bundle
  budget or phone performance claims. No deployment or other browser run.
- **Verification:** probe assertions reproduce the blocker (intentional exit
  code 2); ESLint on the spike and `git diff --check` pass.
- **Next decision:** release an SDK with an opaque DOM/frame execution API
  (recommended), or explicitly revise the plan to allow an application-owned
  opaque iframe bootstrap. Do not add `allow-same-origin`, execute deck code on
  the editor origin, patch pinned vendor bytes, or treat the worker import
  path as proof of DOM rendering/offline support.

The diagnostic subset is not the Phase 2 compiler. The later phases remain
unstarted except for the explicitly independent workflow prerequisite. Raw results
are recorded in
[`online/spikes/phase-0/evidence.json`](../online/spikes/phase-0/evidence.json).

### Continuation evidence (2026-11-12)

- Original feasibility work committed as `d030084b` and pushed; the remote
  branch SHA was verified.
- [HashBin SDK proposal #249](https://github.com/curtcox/hashbin.org/pull/249)
  adds explicit opaque DOM execution, preserving the worker default, old
  releases and `allow-scripts` isolation. SDK v0.6.0 files are prepared for
  review, **not deployed or published**. Current-main validation: 1,031 unit
  tests, zero lint errors, 14 DOM browser cases and 16 hosted-sandbox cases
  passing across Chromium/WebKit. The proposal merges current main without
  changing unrelated work. [GitHub run 43363883168](https://github.com/curtcox/hashbin.org/actions/runs/43363883168)
  passed all PR jobs, including local API/frontend and funded-download checks;
  production deployment jobs were skipped.
- **S1 passes against that candidate:** the real client wrapper mounts the
  starter's first slide and the script fixture; clicking increments its count.
- **Diagnostic S3 passes against that candidate in Chromium:** after a fully
  offline reload, the parent service worker supplies verified runtime bytes
  through the SDK proxy. Rendering and interaction match the online run; the
  opaque deck frame has no service-worker controller. The SDK's own offline
  module test also passes Chromium/WebKit with actual HTTP refusal.
- Candidate mode is explicit (`--sdk-candidate`), records its digest as
  unreleased, and does not replace the published SDK pin or original evidence.
  [Candidate results](../online/spikes/phase-0/candidate-evidence.json) measure
  only the diagnostic subset. **S2 and S4 remain unverified.**
- [Fragment Kit workflow proposal #4](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/pull/4)
  prepares optional `working-directory`, npm cache/artifact paths, and a nested
  consumer smoke workflow. Locally: 301 unit tests, kit/static/vendor/gallery
  checks, actionlint and a nested Chromium smoke pass. `pages.yml` and
  `kit-check.yml` are unchanged. **The owner-controlled `@v4` tag is not created.**
  [The reusable nested-app smoke also passed in Actions](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/actions/runs/43364019171).
  [Kit CI passed its unit/static and Chromium/Firefox/WebKit jobs](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/actions/runs/43364018975).

Review, SDK deployment and kit release remain prerequisites to replacing the
runtime pin. Candidate checks are not production deployment acceptance.

### Fidelity and performance evidence (2026-11-12)

- **S2 passes for the deterministic prototype:** starter slides 1, 2, 3, 8 and
  16 render in both pinned official themes (0.25.0, MIT). Ten comparisons against
  actual `slidev build` output have zero exact pixel differences at 980 × 552.
  Local fonts, fixed cover color and data-URL remote-image replacements are
  applied identically to both renderers. Reference decks use a separate local
  origin; author compilation/evaluation stays in the opaque SDK frame.
- The expanded bundle includes the browser compiler, client wrapper/layouts,
  code wrapper, UnoCSS, theme styles, YAML Shiki, icons and a built-in component.
  Frontmatter utility classes and Markdown typography now match the CLI.
  A browser-safe UnoCSS entry excludes Node/JSX parser dependencies.
- **Expanded S3 passes:** after a fully offline reload, the themed first slide
  still matches the CLI exactly. Assets are hash-verified by the parent worker;
  the opaque frame has no service-worker controller.
- **Prototype S4 passes:** about 744 KB gzip for JavaScript + CSS; five fresh
  Chromium phone-profile loads take about 1.4–1.5 s. The report specifies the
  4× CPU slowdown, viewport/DPR, network, cold caches and complete timing scope.
  This is neither physical-phone acceptance nor the complete product payload.
  Recheck the full-runtime budget as Phase 2 adds the remaining features.
- [SDK #249](https://github.com/curtcox/hashbin.org/pull/249) review regressions
  were reproduced in Chromium/WebKit and fixed in `9caf406`: readiness waits
  for top-level await, stalled evaluation keeps its timeout, and proxied
  204/205/304 responses retain null bodies. All 1,031 unit tests, 20 DOM browser
  cases and 16 hosted cases pass. [Updated CI](https://github.com/curtcox/hashbin.org/actions/runs/43367188879)
  is green. The still-unpublished v0.6.0 artifacts were regenerated from source;
  published versions are unchanged.
- `.github/workflows/online-feasibility.yml` pins both SDK inputs by commit,
  checks the original blocker, candidate interaction/offline behavior and S2,
  and uploads comparison artifacts. CI explicitly skips hardware-sensitive
  timing while enforcing the prototype byte budget. No deploy job is added.
- [The feasibility workflow passed in GitHub Actions](https://github.com/curtcox/slidev/actions/runs/43369639052):
  Chromium on Ubuntu reproduced all ten exact screenshot matches and the opaque
  offline reload. Its prototype payload was 743,423 bytes gzip; performance
  timing was explicitly not run on the shared runner. Reports/screenshots are
  attached to that run. Standard CI exposed unrelated mutable agent-skill
  downloads in `prepare`; skill syncing now runs only outside CI, preserving
  dependency lifecycle scripts and local developer setup.
- Full repository verification passes: build, typecheck, lint and 389 tests.
  Separate maintenance commits correct the existing HMR test's overloaded send
  capture, spell BOM regexes visibly, format existing fixtures and verify
  decoded PlantUML content independently of Node/zlib's compressed bytes.

Reproduction commands and scope are in
[`online/spikes/phase-0/README.md`](../online/spikes/phase-0/README.md);
[`fidelity-evidence.json`](../online/spikes/phase-0/fidelity-evidence.json)
records the measured results. Publication/tag approvals remain outstanding.

### Approved prerequisite publication (2026-11-13)

- Owner explicitly approved SDK deployment and the workflow tag. [SDK #249](https://github.com/curtcox/hashbin.org/pull/249)
  merged at `5b6eb035a552830f7db608376be16ac3b99ce0ad`.
  [The production deployment passed](https://github.com/curtcox/hashbin.org/actions/runs/43432577171),
  including both production origins. Strict production verification passed locally.
  Live SDK v0.6.0 and cache-helper bytes match both approved SHA-256 and SRI;
  responses carry immutable cache headers.
- [Workflow #4](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/pull/4)
  merged at `3de01b1e3ea6c2508a1831ada35c84e8e242925a`. The proposed `v3` name
  was already published on November 8 at `8807ee5` and lacks the new input.
  With separate explicit owner approval, immutable `v4` was published instead.
  Remote tag dereferencing matches the merged commit; `v2` and `v3` are unchanged.
  Future references in this plan now use `test.yml@v4`.
- The probes now accept `--sdk-release` with an exact published v0.6.0 hash gate.
  Released-byte mounting, script interaction, ten exact themed screenshots and
  offline reload pass in Chromium. The original worker-only reproduction and
  explicit development-candidate mode remain available. New timing is labeled
  not run; prior prototype measurements used identical SDK bytes.
- Kit v0.4.4 is being prepared with the new SDK alongside its unchanged old SDK
  and Publish default. Publication, consumer vendoring and the full-runtime
  budget remain open; no product deployment is claimed.

### Phase 1 scaffold preparation (2026-11-13)

- [Kit v0.4.4 PR #5](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/pull/5)
  is prepared at `06337a5`; [Kit CI](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/actions/runs/43434049843)
  passes unit/static/package and Chromium/Firefox/WebKit. The nested-app reusable
  workflow passes too. Local preparation passed 302 units and 128 Chromium/WebKit
  cases; local Firefox cannot create a profile before application code. Approval
  to merge/publish the new runtime was requested separately and remains pending.
- The scaffold vendors those exact candidate bytes with vendor-sync and records
  their manifest. **This is a prepared integration pin, not publication evidence.**
  The independent `kit-check.yml@v2` job must match the published manifest before
  the deployment workflow can proceed. No prior kit/vendor bytes were edited.
- `online/runtime` is a workspace package built from the real client wrapper and
  cover layout. It mounts only a fixed welcome deck in an opaque SDK DOM frame;
  the browser compiler and editing UI remain Phase 2/3 work.
- The native-module shell has Docs/Gallery links, startup/error status and a
  verified offline copy. Staging writes exact commit/dirty metadata, hashes all
  offline assets and excludes optional AI engines from automatic downloads.
  Release staging refuses an uncommitted checkout. Built bundles are ignored.
- Local Chromium and WebKit passed welcome rendering, `allow-scripts` only,
  origin `null`, blocked parent-document access and a complete offline reload.
  The artifact unit and full scaffold static checks pass. Full root verification
  passes build/typecheck/lint and all 389 tests after refreshing cached builds.
- Online tests use `test.yml@v4` with `working-directory: online`; Pages and
  independent kit verification stay at `@v2`. Workflows are separate and pass
  actionlint. The Pages API already reports `build_type: workflow` for the
  recovery URL. No Slidev Online product deployment has run yet.
