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
- **Depends on**: Fragment Kit v0.4.4 carrying SDK v0.6.0 and immutable kit workflow `@v4` (both published and verified)
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
- sandbox → parent: `ready`, `rendered {slides, errors[]}`, `position {slide, click}`, `error {slide, message, line}`, and bounded `drag {patch}` updates

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
- `isDefault` is true when `css` is empty and there are no extension fields.
  Default documents encode as a source string.
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
| Phase 0 (discovered prerequisite) | DONE: SDK v0.6.0 deployed and kit v0.4.4 published with explicit approval; integrity verified |
| Phase 1 | DONE: owner approved immutable workflow `@v4`, published at `3de01b1`; existing `@v3` was preserved |
| Phase 1 | DONE: Pages already uses Actions; live recovery deployment verified |
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
| 0 | Feasibility spikes | DONE — released-byte S1–S3 and prototype S4 pass; recheck the complete runtime budget in Phase 2 |
| 1 | Skeleton, CI, deploy (+ kit `@v4`) | DONE — published kit/workflow pins verified; live welcome deck and offline reload pass Chromium/WebKit |
| 2 | Slidev runtime | IN PROGRESS — five themes, HTTPS images, native/CSS transitions and lazy math deployed; 187 exact SFC matches + 14 fallbacks, 84-slide DOM gate and 109 gallery/fixture visual comparisons pass CI; 162 visual cases cover both demos in CI and local Chromium/WebKit, including explicit fallbacks; the visual job now blocks deployment; build-time UnoCSS token extraction shrinks the initial runtime to 875,439 bytes gzip; the 2 s phone timing target remains open |
| 3 | Editor app (share, QR, HashBin, mobile) | DONE — workspace, links/CIDs, drafts, sharing/QR, registration-gated HashBin controls, ZIP, kit contracts, overview/touch and source diagnostics deployed and verified live in Chromium/WebKit; client registration remains an owner action |
| 4 | Docs and gallery | DONE — Markdown docs, 15 example decks, kit gallery and opaque-rendered covers deployed; all three CI browsers, 109 visual comparisons and live Chromium/WebKit gallery/offline checks pass |
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

### Published kit and live scaffold (2026-11-13)

- Owner explicitly approved kit v0.4.4 publication. PR #5 merged at
  `c410d289dd36040a527d0b64a7c1f23a915765b9`; immutable tag `v0.4.4` is there.
  [The release workflow passed](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments/actions/runs/43437233993),
  including Chromium/Firefox/WebKit, artifact upload and independent demo-pin
  verification. Downloaded archive/manifest checksums pass. An independent
  download through the old vendor-sync tool verifies all published bytes and
  matches Slidev's prepared pin without editing it. Release status was recorded
  in the tools repository at `b5bc9d9`.
- [Online workflow 43436413635](https://github.com/curtcox/slidev/actions/runs/43436413635)
  now passes every job, including the rerun publication gate. All root tests,
  lint and the full package smoke matrix also pass. Continuous Releases alone
  still fails because pkg-pr-new lacks access to this fork; its workflow is
  unchanged.
- PR #1 merged at `419517292229d3d9d273b3c1dd68daf1e4367608`.
  [Pages deployment 43438041972 passed](https://github.com/curtcox/slidev/actions/runs/43438041972),
  gated on unit, Chromium/Firefox/WebKit and independent publication verification.
  The live [recovery site](https://curtcox.github.io/slidev/) contains the marker
  and `release.json` reports that exact commit with `dirty:false`.
- Actual live Chromium and WebKit both pass welcome rendering, `allow-scripts`
  only, origin `null`, blocked parent-document access and a complete offline
  reload. No authoring/AI/Publish acceptance is implied by this fixed welcome
  deck. Those remain later-phase requirements.
- Phase 0's throwaway-prototype gates are complete with published dependencies.
  Its recorded payload/timing scope stays explicit; the complete product's
  payload and first-render budgets must be checked again during Phase 2.

### Phase 2 compiler continuation (2026-11-18)

- Continued on `main`, preserving the existing runtime work. The upstreamable
  layout wrapper seam is committed separately with characterization tests.
- Browser compilation reuses the CLI Markdown plugin chain and layout wrapping,
  then Vue's browser SFC compiler and TypeScript stripping. Syntax-aware module
  rewriting rejects nonliteral dynamic imports and delegates allowed modules to
  a bundled registry. No author code is compiled or evaluated on the editor origin.
- Unsupported file imports fail visibly; Monaco is static with a notice,
  Twoslash is disabled with a notice, and PlantUML stays off unless explicitly
  enabled. Shiki currently bundles JavaScript, TypeScript and YAML; other
  languages fall back to text with a notice. The cache is bounded by bytes/count
  and invalidated by headmatter/config changes.
- Actually ran locally: Chromium and WebKit each match seven generated SFCs
  against the CLI (Markdown, script/style, slots/clicks, highlighting, drag/
  Mermaid markup, magic-move). Negative input, UTF-8 byte-limit, fallback and
  incremental-cache probes pass. Three online unit tests, runtime typecheck/build,
  static/vendor/offline integrity checks and targeted ESLint pass.
- This verifies compilation, not full client execution or visual parity. The
  starter/composable corpus, module registry, bridge, styles/themes, virtual
  coverage and full-runtime performance/fidelity gates remain Phase 2 work.

### Phase 2 rendering bridge (2026-11-18)

- The welcome deck now takes the actual browser-compiler path. A bundled module
  registry supplies Vue, Slidev context/constants, built-in layouts and an initial
  set of built-in components. Author modules import from Blob URLs only inside
  the opaque SDK frame. Unknown imports fail visibly; missing components and
  directives get text notices even with production Vue's warnings disabled.
- The versioned bridge validates bounded document bytes, command fields and
  integer positions. Replacing a document terminates the previous SDK sandbox;
  revision guards discard stale events. Timeouts/errors destroy failed frames.
  Rendering and navigation are serialized inside the frame.
- Real SlideWrapper/click contexts implement slide navigation and click steps.
  UnoCSS utilities/directives, Vue scoped styles and document CSS are generated
  inside the sandbox. The parent fetch proxy delivers emitted component CSS
  through the same offline path as the runtime bundle.
- Actual local Chromium and WebKit integration suites pass script-setup button
  interaction, TypeScript, scoped/utility/document CSS, style isolation between
  slides, two-column slots, next/previous clicks, parent DOM/storage/cookie
  denial, teardown of old author intervals, and visible missing-module/component
  errors. Welcome rendering and fully offline reload pass in both engines.
  The schema/packaging units and targeted runtime typecheck/lint pass too.
- This remains an initial rendering subset: official theme selection, more
  components/directives/virtual modules, icons, lazy grammars/diagrams, the full
  characterization corpus, visual fidelity and full-runtime phone timing are
  still open. The current local bundle is about 981 KB gzip plus emitted CSS;
  that is a size observation, not completion of the final S4 gate.
- Repository-wide verification for this continuation: refreshed package builds,
  all 392 Vitest tests and root typecheck pass. The initial stale-build/local-port
  failures were resolved by rebuilding and running the HMR tests with local ports.
  Root typecheck also caught the earlier seam test missing Vue's required style
  filename; that small correction was committed separately.

### Phase 2 official themes (2026-11-18)

- Bundled `default` and `seriph` at exactly 0.25.0, using all six theme
  layouts, theme styles and published config defaults. Built-in layouts remain
  available. Unknown themes fall back to default with a visible notice.
- Builds enforce the reviewed version, MIT license, source size and absence of
  unintegrated setup/component files; stage unchanged licenses and a machine-
  readable audit record into the verified offline artifact. Source sizes for
  layouts/styles are 3,572 and 3,841 bytes, respectively.
- Local Chromium and WebKit pass cover/background, section/fact layout sizing,
  seriph color, theme replacement and visible fallback checks, alongside the
  existing script/CSS/click/isolation suite. Runtime build/typecheck, root build/
  typecheck, five online units, static/vendor/offline checks and targeted lint pass.
- Remote fonts currently use local/system fallbacks. Other proposed themes,
  visual comparisons for the actual product runtime, remaining client features
  and the complete-runtime performance gate remain open.

### Phase 2 product-runtime visual comparison (2026-11-18)

- Added a CLI comparison harness for the **actual staged runtime and preview
  bridge**, separate from the Phase 0 prototype. Ten deterministic fixtures
  across both official themes exercise all six theme layouts, Markdown tables/
  lists, two-column slots, scoped styles, TypeScript highlighting and initial
  click states. CLI references run on a separate local origin; author modules
  run only in `allow-scripts`, origin-null frames.
- The first comparison caught an extra online text color. Removing it gives
  **zero exact differing pixels in all twenty cases in both Chromium and
  WebKit**, at 980 × 552. Both use local fonts, a fixed cover background and
  disabled nonvisual services. Compiler characterization still matches all
  seven CLI SFCs. Welcome/offline reload passes in both engines.
- `online-test.yml` now uploads CLI/online/diff PNGs and a machine-readable
  Chromium report in a nonblocking fidelity job, as planned while CI platform
  coverage stabilizes. This is local verification, not a claim that the new
  CI job or deployment has passed. The full example corpus, remote assets/fonts
  and full-runtime phone performance remain open.

### Theme continuation verification (2026-11-18)

- Implementation pushed on `main` as `fc65ae5e` (themes), `e7cd8dfe`
  (product fidelity and default text-color correction) and `b9482b54`
  (preserve reviewed theme pins through the pre-commit catalog formatter).
  The final manifest and lockfile pass pinned pnpm's frozen install.
- [CI fidelity job](https://github.com/curtcox/slidev/actions/runs/44342959061/job/134937615314)
  passed its actual comparison step and uploaded all PNGs plus the report.
  The downloaded report has twenty exact matches, no errors, and the same
  runtime SHA-256 as the local Chromium 156.0.8078.4 and WebKit 27.2 runs:
  `930af87236d9cf2f5f81e703776f80274554f95904e256b6eb2f8eba1249b5d9`.
  Current JavaScript + CSS is **979,892 bytes gzip**; complete-runtime timing
  and physical-phone acceptance remain unverified.
- Local build, lint, typecheck and all **392** repository tests pass. Five
  online units, static/vendor/offline checks, both browser integration/offline
  suites, and both browser compiler characterizations pass.
  [Repository CI](https://github.com/curtcox/slidev/actions/runs/44342957694)
  passes Ubuntu/Windows/macOS, typecheck and Cypress. The separate Continuous
  Releases job still cannot publish because pkg-pr-new lacks access to this fork.

### Phase 2 navigation and client continuation (2026-11-18)

- Continued on `main` with four separately pushed implementation commits:
  `f0e326d6` (navigation and built-ins), `1096ed66` (TOC and virtual coverage),
  `3eb021f9` (motion/markers and expanded visual checks), and `ef8e1ecb`
  (real-corpus regressions and compiler fixes).
- The bundled adapter supports slide aliases, navigation APIs, slide counters,
  upstream Link/RenderWhen/LightOrDark/Transform/AutoFitText/CodeGroup components,
  slide-enter/leave hooks, Shiki magic-move, and upstream motion/marker directives.
  Navigation and dark state stay in memory inside the opaque frame. Browser
  integration checks cover code-tab switching, fitted text, click animations,
  TOC hierarchy/hidden entries/active state, aliases, and directive cleanup.
- TOC titles use the CLI's actual virtual-title template and Markdown pipeline.
  One manifest supplies Vite aliases for all **18** current client virtual
  imports. Builds and static checks parse TS/Vue imports and fail when upstream
  adds an unimplemented virtual module; tests verify that failure. Empty setup
  lists represent the single-document format's lack of setup directories,
  while Monaco remains an explicit static-code fallback.
- Characterization now includes the actual starter, composable-vue and every
  online example. Local Chromium 156.0.8078.4 and WebKit 27.2 each pass **50 exact
  slide/title SFC comparisons** and **21 explicit corpus fallback/error cases**.
  Unsupported languages, Monaco, PlantUML and file imports are not counted as
  exact matches. Per-browser JSON reports record those distinctions. This is
  compilation evidence, not full rendering or fidelity for those source decks.
- The corpus caught two runtime defects: hidden/disabled slides were retained,
  and Vue's static-tree optimization tried to use `Function()` under the frame
  CSP. Filtering/renumbering now matches the CLI while preserving source ranges
  and document headmatter; disabling that optimization preserves the existing
  CSP and keeps all author execution inside the SDK's opaque frame.
- The product fidelity suite now includes **24 cases**, adding built-in
  components and TOC in both themes. Local Chromium and WebKit both have zero
  exact differing pixels. Screenshots are separated by browser so one run cannot
  overwrite another's evidence. Final JS/CSS is **1,023,062 bytes gzip**, runtime
  SHA-256 `a1348bfbf0166fc28af195d11468d5e3e02fe8ac72d9837e457a11483c3e5203`.
  Complete-runtime phone timing and physical-phone acceptance remain unverified.
- Local runtime build/typecheck, frozen offline install, all seven online units,
  static/vendor/offline integrity, both integration/offline browser suites,
  repository build/typecheck/lint and all **392** repository tests pass. Stale
  local Turbo artifacts were refreshed before the final repository test run.
- [Navigation deployment](https://github.com/curtcox/slidev/actions/runs/44347840037),
  [TOC deployment](https://github.com/curtcox/slidev/actions/runs/44348533963) and
  [motion deployment](https://github.com/curtcox/slidev/actions/runs/44349402402)
  passed their actual test/publication/deploy gates. The recovery site's release
  metadata was initially verified at `3eb021f9` with `dirty:false`.
- Final compiler-fix [deployment 44351136683](https://github.com/curtcox/slidev/actions/runs/44351136683)
  subsequently passed unit, Chromium/Firefox/WebKit, publication verification,
  visual report and deployment. The downloaded CI report has 24 exact matches,
  no errors, and the same runtime hash/payload as the local reports above.
  Live recovery metadata reports `ef8e1ecb` with `dirty:false`. Actual live
  Chromium and WebKit both pass the complete runtime integration suite and
  welcome/sandbox-isolation/offline-reload suite. The later evidence-layout
  commit `7cf6a826` changes screenshot paths and documentation; its workflow
  was still running at this follow-up checkpoint.
- Phase 2 remains open for icons, additional/lazy grammars and diagrams/fonts,
  drag writeback, additional theme audits, remaining client features, full
  source-corpus rendering/fidelity, and complete-runtime phone performance.

### Phase 2 bundled icons and offline theme regression (2026-11-18)

- Integrated newer `main` work before continuing. The additional seriph fact
  regression after a fully offline reload passes local Chromium and WebKit and
  was pushed separately as `86c2beeb`.
- Carbon, ph, mdi, logos, simple-icons, twemoji and svg-spinners are emitted as
  separate, unchanged JSON assets from `@iconify/json` 2.2.553. Builds require
  that reviewed version, per-collection size bounds and original attribution/
  license metadata; the staging manifest hashes every collection. The sandbox
  requests only recognized bundled collections and caches each once per frame.
  No icon data enters the initial JavaScript bundle or requires a remote CDN.
- Template tags and `~icons/...` imports resolve through the bundled registry.
  Iconify's SVG helpers preserve aliases, transforms and aspect ratios; repeated
  gradients/masks get unique IDs. TOC heading icons share the same loader.
  Missing icons render a placeholder plus a visible notice, and an unbundled
  collection cannot request a new URL.
- Actual local Chromium and WebKit pass all seven collections, kebab/colon tags,
  imports, aliases, repeated SVG IDs, TOC titles, cache reuse, missing-icon
  notices and rendering all seven collections after a fully offline reload.
  Existing runtime integration suites pass in both engines. All **26** product
  fidelity cases match the CLI with zero exact differing pixels in each engine,
  including a new icon fixture in each official theme. The icon fixture also
  asserts that all eight expected SVGs exist in both renderers; visual review
  caught and corrected a Markdown-escaped colon tag before that assertion landed.
- Runtime build/typecheck, root typecheck, targeted lint, eight online units and
  static/vendor/offline integrity pass. Initial JS/CSS is **1,027,805 bytes gzip**
  with Node's gzip measurement. The separate collections total **33,398,204 bytes**
  (**8,740,165 gzip**) and are all cached for offline use. Complete-runtime phone
  timing, the remaining grammars/diagrams/fonts, drag writeback, additional theme
  audits and full source-corpus rendering/fidelity remain open. This evidence
  is local; the new CI/deployment result has not yet been checked. Both local
  reports record runtime SHA-256
  `1d31e64510992254cb0ec2e81bc0192adefb66fa3d265ec1ac9c652068907f95`.

### Phase 2 lazy syntax grammars (2026-11-18)

- Added forty curated Shiki 4.6.0 languages and their published aliases as
  separate JSON data assets. Build audits pin the package version, alias lists,
  size bounds, embedded dependencies and original MIT license. Offline staging
  hashes all bundles and ships the audit/license unchanged. Unknown names never
  form fetch URLs; unavailable assets produce readable code and a visible notice.
- Removed the initial JavaScript/TypeScript/YAML grammar payload. Grammar assets
  load on demand through the opaque SDK frame's offline proxy, once per canonical
  language per frame. TextMate registries are isolated by root language so Vue
  injections cannot alter later Markdown or invalidate cached compiler output.
  Markdown explicitly includes its optional `html-derivative` dependency.
- Local Chromium and WebKit pass lazy requests, aliases, embedded Vue languages,
  cache reuse, unknown-language notices, a real missing-asset fallback with the
  service worker blocked, and highlighting after a complete offline reload.
  Existing runtime integration passes both engines; Chromium welcome/isolation/
  offline/theme checks pass. No new execution permission or vendor change.
- Characterization exercises all forty languages without fallback. Chromium and
  WebKit each have **139 exact SFC comparisons**. Expanded runs caught Shiki's
  default 500 ms line budget truncating C++/magic-move output under concurrent
  load. Both test compilers now disable that elapsed-time cutoff so assertions
  compare complete tokenization, with no browser exceptions. Product renders
  retain the default 500 ms line budget. The corpus now has **14**
  explicit unsupported-feature cases instead of 21. These are compiler checks,
  not claims of full rendering parity for starter/composable-vue.
- Added Python/Rust/Vue to product visual fidelity, with assertions that code
  contains highlighted tokens. All **28** cases have zero exact differing pixels
  in both local engines. Initial JS/CSS is **993,580 bytes gzip**; forty separate
  grammar bundles total **8,719,550 bytes** (**1,070,900 gzip**). Both visual
  reports record runtime SHA-256
  `e85665b4b8d1a0b2dd3c5fd7a244c035ba5dee3bedc3dfab151314d0a12883f0`.
- Runtime build/typecheck, root lint/typecheck, all **392** repository tests,
  nine online units and static/vendor/offline integrity pass. Local stale Turbo
  artifacts were refreshed before the final repository tests. Implementation
  and visual verification were pushed to `main` as `3c951890` and `bbc301fc`.
  The latter [deployment run](https://github.com/curtcox/slidev/actions/runs/44367241326)
  passed unit, Chromium, Firefox, vendor publication and visual-report jobs at
  this checkpoint; WebKit and deployment were still pending. The follow-up
  removes elapsed-time truncation from compiler comparisons; its final CI and
  live deployment are not yet verified. Diagrams/fonts, drag writeback,
  additional theme audits, full source-corpus rendering and complete-runtime
  phone timing remain open.

### Phase 2 offline math styles and fonts (2026-11-18)

- KaTeX 0.19.1 styles and all twenty unchanged WOFF2 fonts ship as a separate,
  self-contained stylesheet, loaded only for math slides through the SDK proxy.
  Builds audit the MIT license, version, font list, hashes and byte budget;
  offline staging covers styles, license and audit metadata. The page CSP adds
  data fonts without changing script permissions or opaque-frame isolation.
- Actual local Chromium and WebKit pass inline/display equations, loaded fonts,
  click-based equation highlighting, reuse on later slides, visible missing-
  asset notices and complete offline reload. Ten online units and static/vendor/
  offline checks pass; runtime build/typecheck and targeted lint pass.
- Chromium visual comparison passes all thirty CLI/online cases with zero exact
  differing pixels, including equations in both official themes. This is local
  evidence; CI/deployment and the new WebKit visual run are not yet verified.
  Mermaid delivery, remote theme fonts, drag writeback, further theme audits,
  full corpus rendering and complete-runtime phone timing remain open.

### Phase 2 lazy Mermaid rendering (2026-11-18)

- Bundled Mermaid 12.3.0 as a standalone module fetched through the SDK's
  opaque-frame import/offline proxy only for diagrams. Builds pin the reviewed
  version and MIT license, bound the output size, and parse emitted JavaScript
  to reject any unresolved module imports. Offline staging verifies the module,
  original license and audit record. The initial runtime excludes the diagram
  engine; its separate payload is 1,696,335 bytes gzip using Node compression.
- Reused the upstream Mermaid Vue component for shadow styles, scale, themes,
  dark mode and text-rendered errors. Serial rendering prevents Mermaid's global
  configuration crossing between concurrent diagrams; SVG caching is bounded.
  Local Chromium and WebKit pass multiple concurrent diagrams, separate themes,
  scale, flowcharts, sequence and pie diagrams, invalid-source recovery, a real
  missing-bundle error, dark mode and complete offline reload.
- Both local engines pass all **34** CLI/online visual cases with zero exact
  differing pixels. Diagram fixtures caught an undefined theme option overriding
  the CLI default; matching the CLI's undefined-option filtering fixes it.
  All eleven online units pass. This does not establish full diagram-catalog or
  source-corpus fidelity. Remote theme fonts, drag writeback, more theme audits,
  remaining client features and complete-runtime phone timing remain open.
  New Mermaid CI/deployment results have not yet been verified.

- Final local runtime build/typecheck, all eleven online units, static/vendor/
  offline integrity, root typecheck/lint and all **392** repository tests pass.
  Stale Turbo build artifacts were refreshed before the successful test run.
  Initial JS/CSS is **994,693 bytes gzip**; lazy math styles/fonts are **265,884
  bytes gzip**. These are payload observations, not phone performance acceptance.

### Math and Mermaid continuation verification (2026-11-18)

- Both implementation commits are pushed on `main`: `b3d54d76` (math styles/
  fonts) and `68b39002` (lazy Mermaid). Clean release staging at `68b39002`
  reports `dirty:false`. No upstream package or immutable vendor bytes changed.
- Final local Chromium 156.0.8078.4 and WebKit 27.2 pass the runtime integration,
  welcome/isolation/offline, math and diagram suites. Compiler characterization
  still passes **139** exact slide/title SFC matches plus **14** explicit corpus
  fallbacks in each engine. Both local visual reports have **34** exact matches,
  no errors, and runtime SHA-256
  `4d6d48655ba13a96acd94c87e2b1f15e798c087e81399e431ac0e4af1df3bb78`.
- [Repository CI](https://github.com/curtcox/slidev/actions/runs/44381703117)
  passes typecheck, Cypress and Linux/Windows/macOS tests. The separate Continuous
  Releases workflow still fails on this fork's existing pkg-pr-new access issue.
- [Mermaid CI/deployment](https://github.com/curtcox/slidev/actions/runs/44381703728)
  passes units, independent kit verification, Firefox, WebKit and the visual
  report at this checkpoint. Downloaded CI evidence contains **34** exact visual
  matches with the same runtime hash as local reports. CI's Node gzip measurement
  is **993,314 bytes**, versus **994,693** locally; the source bytes are identical.
  Actual WebKit job logs confirm all integration/offline suites and the full
  compiler comparisons ran. Chromium dependency installation and deployment
  remain pending; a live deployment is not yet claimed for these commits.
- The earlier math-only run's WebKit setup timed out after ten minutes downloading
  Ubuntu packages, before product tests started. Its deployment was skipped.
  The newer run has already passed those WebKit tests. Phase 2 remains open for
  remote theme fonts, drag writeback, more theme audits, remaining client features,
  full source-corpus fidelity and complete-runtime phone timing.

### Browser runner mirror repair (2026-11-18)

- The Mermaid run's Chromium setup also timed out downloading Ubuntu packages
  before product tests started. Retrying that job alone preserves all passing
  results, but the underlying workflow only normalizes Azure mirrors while
  failing runners use `us-east-2.ec2.archive.ubuntu.com`.
- The local pre-test now normalizes EC2 archive URLs in the runner's apt source
  and mirror files before browser installation. Unit jobs are unaffected; the
  immutable shared workflow and vendored bytes stay unchanged. Actionlint and
  fixtures for regional/bare EC2, official archive and security URLs pass.
  CI and deployment for this infrastructure repair are not yet verified.

### Deployed math and diagrams (2026-11-18)

- Runner mirror repair is pushed as `a8b7f152`. Its
  [deployment run 44383980419](https://github.com/curtcox/slidev/actions/runs/44383980419)
  passes unit, Chromium/Firefox/WebKit, independent publication verification,
  visual comparison and deployment. All three browser jobs completed dependency
  installation and ran the actual product suites after the mirror normalization.
- The live [recovery site](https://curtcox.github.io/slidev/) reports `a8b7f152`
  with `dirty:false`. Actual live Chromium and WebKit each pass the math suite,
  Mermaid suite and welcome/isolation/offline-reload suite, including offline
  seriph rendering. No physical-phone performance acceptance is implied.
- The older `68b39002` Chromium-only retry remains active at this checkpoint.
  Automatic approval review rejected its cancellation because workflow
  cancellation was not explicitly authorized. It was left running; its runtime
  source is identical to the deployed repair, which only changes CI setup.
  The evidence-only follow-up changes this plan and its index.

### Phase 2 drag controls and source-writeback bridge (2026-11-18)

- The owner explicitly authorized canceling the superseded workflow. Run
  `44381703728` was canceled and its final state verified as `cancelled`.
- Continued on `main`. Two upstream fixes were committed and pushed separately:
  `45b21e84` preserves PascalCase drag metadata; `d389a30c` preserves distinct
  source offsets for repeated/nested components/directives and single-quoted
  directive values. All seven upstream drag-transform regressions pass.
- Reused upstream drag components, directive and controls. A guarded local Vite
  adapter replaces server writeback with bounded reports and retains geometry
  in memory across navigation. Storage access is shimmed; builds reject client
  storage-state modules without an opaque adapter. No immutable vendor changes.
- The parent bridge exposes source-change, source-read and error callbacks.
  Its separate parse-only bundle never compiles or executes author text. Numeric
  patches are schema/range checked, rebuilt against the original render snapshot,
  limited to 1,024 elements and bounded by the total 5 MiB document allowance.
  Stale Markdown edits reject writeback visibly. Tests preserve notes, scripts,
  comments, CRLF/BOM, hidden-slide numbering, repeated element offsets, and
  existing/empty/missing/fenced YAML. The Phase 3 editor UI is still unimplemented;
  this verification uses the bridge API with a textarea host.
- Actual local Chromium and WebKit pass move/resize/rotation, keyboard movement
  without slide navigation, arrows, named/auto-height positions, repeated inline
  elements, scaled/zoomed previews, navigation retention, cumulative writeback,
  no author-code rerun during writeback, stale-source rejection and offline reload.
  Existing runtime and welcome/isolation/offline suites pass both engines.
- Both engines pass **141** exact compiler SFC comparisons plus **14** explicit
  corpus fallbacks. All **36** visual cases match the CLI with zero exact differing
  pixels. The new fixture caught missing drag-component utility CSS; including
  the upstream component sources in utility generation fixes padding and arrow
  placement. Reports record runtime SHA-256
  `89d2cb8185f3b1355735c20bc894721f1034b929902d91c070b1e7d73b3f8e05`.
- Runtime build/typecheck, targeted lint, actionlint, all **21** online units,
  static/vendor/offline integrity, refreshed root builds/typecheck/lint and all
  **396** repository tests pass. Current initial sandbox JS/CSS is **1,005,916
  bytes gzip**; the separate parent parser/writeback module is **39,217 bytes
  gzip**. These are payload observations, not phone performance acceptance.
  CI and live deployment for the new drag adapter have not yet been checked.
  Remote theme fonts, further theme audits, remaining client features, full
  source-corpus rendering/fidelity and complete-runtime phone timing stay open.

### Drag CI follow-up (2026-11-18)

- Implementation is pushed as `9d4171fc`. CI passed units, Chromium, WebKit,
  independent kit verification and the visual report. Firefox reached the final
  stale-source test, then attempted to select an element beneath an already-
  active drag overlay. The test now explicitly deselects before changing source
  so it tests the same user interaction across engines. Local Firefox itself
  cannot launch its temporary profile on this Mac, so successful Firefox
  acceptance will be reported from actual CI execution only.
- The downloaded CI visual report has the same runtime hash as local evidence:
  **33** cases match exactly; three have one differing pixel each, with channel
  deltas at or below eight. None exceeds the configured tolerance. This is not
  a claim of 36 exact CI matches; both local engines still have 36 exact matches.
- Final source review also caught YAML treating numeric IDs differently from
  string keys. Writeback now updates the existing scalar key, preserving its
  inline comment instead of adding a second quoted key. A shipped-bundle
  regression covers the numeric directive form. All **22** online units and
  runtime typecheck pass. CI/deployment for this follow-up remain pending.

### Deployed drag and writeback acceptance (2026-11-18)

- Follow-up `4eca7bfe` is pushed on `main`. Its
  [deployment run 44391662693](https://github.com/curtcox/slidev/actions/runs/44391662693)
  passes units, Chromium/Firefox/WebKit, independent publication verification,
  visual comparison and deployment. Actual Firefox job logs confirm the complete
  drag/offline suite and **141** exact SFC comparisons plus **14** corpus fallback
  cases ran successfully after explicit test deselection.
- [Repository CI](https://github.com/curtcox/slidev/actions/runs/44391661099)
  passes typecheck, Cypress and Linux/Windows/macOS. Local verification has all
  **396** repository tests and **22** online units passing. The separate Continuous
  Releases job still lacks pkg-pr-new access to this fork.
- Downloaded final CI evidence contains **36 exact visual matches**, no errors,
  and the same runtime SHA-256 as both local reports:
  `89d2cb8185f3b1355735c20bc894721f1034b929902d91c070b1e7d73b3f8e05`.
  CI measures initial JS/CSS at **1,005,960 bytes gzip**, versus **1,005,916**
  locally with identical source bytes. The final parent parser/writeback module
  is **147,159 bytes** (**39,271 gzip**) locally.
- Live recovery metadata reports `4eca7bfe` with `dirty:false`. Actual live
  Chromium and WebKit each pass the full drag/writeback suite and welcome/
  isolation/offline suite. This includes scale/zoom, rotation, repeated source
  targets, no author-code rerun while writing back, stale-source rejection and
  geometry retention across navigation and offline reload. Tests use the bridge
  API with a textarea host; the Phase 3 editor UI remains unimplemented.
- The superseded retry `44381703728` is confirmed canceled under the owner's
  explicit authorization. Phase 2 stays open for theme fonts, more theme audits,
  remaining client features, full source-corpus fidelity and phone performance.

### Phase 2 PlantUML consent (2026-11-18)

- Implementation `fdbc69c2` is pushed on `main`. PlantUML blocks show source and
  a consent button before any diagram request. One trusted click enables all
  diagrams in the current preview without running author code again. Navigation
  retains permission. A new render or frame resets it. No permission enters
  documents, links or storage. Direct and imported built-in components use the
  same control.
- Only the default `https://www.plantuml.com/plantuml` server is supported.
  Custom servers produce a visible notice. The page permits images from that
  server's SVG path. Script, connection and frame permissions stay unchanged.
  Scale and alternate text match the upstream component. Requests omit the
  referrer. WebKit acceptance caught an attribute-order issue, fixed by setting
  the policy before the image URL.
- Failed requests and the 15-second deadline show source with a retry button.
  Actual local Chromium and WebKit pass consent, synthetic-click rejection,
  navigation, replacement, no author-code rerun, options, custom-server rejection,
  direct/imported components, retry and offline fallback. Tests mock the remote
  service. This does not establish external service availability or offline
  PlantUML rendering.
- Chromium and WebKit each pass all **38** visual cases with zero exact differing
  pixels. The new fixture compares enabled diagrams in both official themes.
  Visual review caught a test interception gap. The final harness intercepts all
  requests, blocks external traffic, and asserts the mock image dimensions in both
  renderers. It permits local Blob modules required by WebKit. Earlier visual
  runs that contacted the real service are excluded from final mock evidence.
- Both engines retain **141** exact compiler comparisons and **14** corpus
  fallback cases. PlantUML compilation now emits the consent component instead
  of a static notice. The corpus still counts it as an intentional CLI deviation.
  All **396** repository tests and **22** online units pass. Root typecheck/lint,
  runtime build/typecheck, actionlint and static/vendor/offline integrity pass.
- CI and deployment for this change remain pending. Theme fonts, further theme
  audits, remaining client features, full source-corpus fidelity and complete
  runtime phone timing remain open. Phase 3 is still unimplemented.

- First CI passed Chromium, WebKit, units, publication verification and visuals.
  Firefox passed the online PlantUML checks, then failed during offline navigation
  with request interception active. The follow-up removes the remote mock before
  switching offline and checks actual image request failures. Firefox acceptance
  and deployment remain pending until that follow-up runs.

- Follow-up `d2bf099d` passes all three browser jobs, units, publication checks
  and visuals. Its repository CI also passes typecheck, Cypress and tests on
  Linux, Windows and macOS. Downloaded visual evidence has **32** exact matches
  and six within tolerance, with no errors. Deployment was still running at
  this checkpoint. The separate release workflow still lacks `pkg-pr-new` access.
- Final source review adds a guard against late events from a removed diagram
  overwriting its replacement's retry state. A browser regression dispatches a
  delayed error on the removed image after a successful retry. Chromium and
  WebKit pass this regression and all **38** visual cases on the rebuilt runtime.
  CI and live acceptance for this final guard remain pending.

### Deployed PlantUML acceptance (2026-11-18)

- Final guard `31aef5ad` is pushed on `main`. Its
  [deployment run 44409021140](https://github.com/curtcox/slidev/actions/runs/44409021140)
  passes units, Chromium/Firefox/WebKit, independent publication verification,
  visual comparison and deployment. Actual job logs confirm the full runtime,
  icon, grammar, math, Mermaid, PlantUML and drag suites ran in all three engines.
  Each engine also passes **141** exact SFC comparisons and **14** corpus
  fallback cases. Removing interception before offline navigation resolves the
  Firefox failure without changing product code or reducing coverage.
- Final local Chromium 156.0.8078.4 and WebKit 27.2 each pass all **38** visual
  cases with zero exact differing pixels. Downloaded CI evidence has **34** exact
  matches and four within tolerance, with no errors. All three reports share
  runtime SHA-256
  `38820f8a368807e593b7a2dd2a2582dd0e068bd7de64cf79b8ccecfa7728fc4d`.
  Initial JS/CSS is **1,006,810 bytes gzip** locally and **1,006,898** in CI with
  identical source bytes. These are payload observations, not phone acceptance.
- The live [recovery site](https://curtcox.github.io/slidev/) reports `31aef5ad`
  with `dirty:false`. Actual live Chromium and WebKit pass the complete PlantUML
  suite and welcome/isolation/offline suite, including offline seriph rendering.
  This covers the final stale-image guard. Online diagram responses are mocked.
  The offline section removes the mock and checks real failed image requests.
  External PlantUML availability and offline diagram rendering are not claimed.
- [Repository CI](https://github.com/curtcox/slidev/actions/runs/44409022742)
  passes typecheck, Cypress and Linux/Windows/macOS tests. Local acceptance has
  **396** repository tests and **22** online units passing, plus runtime build,
  root typecheck/lint, actionlint and static/vendor/offline integrity. The separate
  Continuous Releases workflow still lacks `pkg-pr-new` access to this fork.
- Phase 2 remains open for theme fonts, further theme audits, remaining client
  features, full source-corpus fidelity and complete runtime phone timing.
  The Phase 3 editor remains unimplemented. This final follow-up changes only
  the plan and its index.

### Phase 2 theme and headmatter fonts (2026-11-18)

- Implementation `f54aa0df` is pushed on `main`. The official themes now load
  Nunito Sans, Fira Code, PT Serif and PT Mono from pinned Fontsource 5.3.0
  packages (OFL-1.1). Four separate self-contained stylesheets contain all 37
  available faces/subsets. Original WOFF2 bytes, attribution and licenses are
  audited and hashed during builds and included in verified offline staging.
  No upstream packages or immutable vendor bytes changed.
- Font selection follows the existing parser's theme/headmatter resolution.
  The SDK delivers bundled styles into the opaque frame. Navigation reuses
  them. New renders replace the font set. Local lists, explicit webfont lists,
  disabled providers, weights and italics are respected. Additional Google fonts
  use native stylesheet loading inside the frame with no page referrer.
  Only Google style/font hosts are added to CSP; script, connection and frame
  permissions stay unchanged. Coollabs is visibly unsupported. Font failures
  and bounded loading deadlines preserve readable local/system fallbacks.
- Actual local Chromium and WebKit pass bundled-font loading, non-Latin subsets,
  full offline reload, navigation reuse, Google CSS/font loading, local/disabled
  overrides, unsupported providers, invalid settings, stylesheet/font failures,
  retry and opaque isolation. Remote-font responses are mocked. External Google
  service availability and offline custom Google fonts are not claimed.
- The existing runtime, icons, grammars, math, Mermaid, PlantUML, drag/writeback
  and welcome/isolation/offline suites pass both local engines. Each engine
  retains **141** exact compiler SFC matches plus **14** explicit corpus
  fallbacks. All **396** repository tests and **23** online units pass, with
  runtime build/typecheck, root build/typecheck/lint, actionlint and static/vendor/
  offline integrity checks. Stale Turbo artifacts were refreshed; four test
  workers avoid a syntax-test timeout under simultaneous browser load.
- The visual harness adds two actual theme-font cases to the original 38
  system-font fixtures. The CLI receives the same pinned font bytes, without
  external traffic. Both clients must report loaded fonts before screenshots.
  Chromium and WebKit pass all **40** cases with zero exact differing pixels.
  CI for these new visual fixtures remains pending.
- Local runtime SHA-256 is
  `2968d24e99a99a2df1de0209657070b2c951a3532bad5c0a212eb2a92640eb1e`.
  Initial JS/CSS is **1,007,975 bytes gzip**, plus **337,956** for the default
  theme's fonts or **507,059** for seriph. These are payload observations,
  not complete-runtime phone performance acceptance.
- First implementation CI has passed units, independent publication checks,
  Chromium, WebKit and the original 38-case visual report. Firefox and deployment
  are still running at this checkpoint. Further theme audits, remaining client
  features, full source-corpus fidelity and complete-runtime phone timing remain
  open. Phase 3 stays unimplemented.


### Deployed font acceptance (2026-11-18)

- Implementation `f54aa0df` and expanded visual gate `d8adffab` are pushed on
  `main`. The final [deployment run 44413051970](https://github.com/curtcox/slidev/actions/runs/44413051970)
  passes units, Chromium/Firefox/WebKit, independent publication verification,
  all 40 visual comparisons and deployment. Actual Firefox logs confirm font
  loading, offline subsets, Google mock responses, failures/retry, isolation,
  **141** exact compiler SFC comparisons and **14** corpus fallbacks ran.
- Both local visual reports have **40 exact matches** and no errors. Downloaded
  final CI evidence contains **34** exact matches and six within tolerance,
  with no errors. Both new font cases match exactly in CI. All three reports
  share runtime SHA-256
  `2968d24e99a99a2df1de0209657070b2c951a3532bad5c0a212eb2a92640eb1e`.
  CI measures initial JS/CSS at **1,008,073 bytes gzip**, versus **1,007,975**
  locally with identical source bytes. Compression sizes differ by Node version.
- The live [recovery site](https://curtcox.github.io/slidev/) reports `d8adffab`
  with `dirty:false`. Actual live Chromium and WebKit pass the complete font
  suite and welcome/isolation/offline suite, including bundled non-Latin subsets,
  fully offline seriph rendering and readable custom-font failures. The live font
  audit matches all locally reviewed versions, hashes, byte counts and licenses.
  Google service responses remain mocked in online acceptance. Custom Google
  fonts are not included in offline caching.
- [Repository CI](https://github.com/curtcox/slidev/actions/runs/44413051162)
  passes typecheck, Cypress and Linux/Windows/macOS tests. Final local checks
  retain all **396** repository tests and **23** online units, plus lint,
  typechecks, runtime builds, actionlint and static/vendor/offline integrity.
  Local Firefox cannot open its temporary profile in either the default directory
  or `/private/tmp`; Firefox acceptance comes from the actual Linux CI run.
- The first implementation deployment uploaded its Pages artifact, then failed
  to find it. Retrying only that job produced two same-named artifacts and also
  failed. The newer commit's fresh run deployed successfully. No artifact was
  deleted, workflow pin changed or immutable vendor file edited.
- Phase 2 stays open for further theme audits, remaining client features,
  full source-corpus rendering/fidelity and complete-runtime phone timing.
  Phase 3 remains unimplemented. This follow-up changes only the plan and index.


### Phase 2 remaining official themes (2026-11-18)

- Added pinned `apple-basic` 0.25.1, `bricks` 0.25.0 and `shibainu` 0.25.0
  after reviewing their published archives, MIT licenses, declared Slidev
  `>=0.47.0` compatibility and source sizes. Their integrated sources total
  **7,363**, **30,665** and **230,895** bytes respectively. None is dropped.
  Builds enforce reviewed versions, layout/component/artwork counts and size
  limits. The offline audit hashes each source file and preserves original
  licenses. No published theme or vendor bytes are edited.
- All **45** layouts across the five planned themes, the eleven Bricks polygon
  components, ten Bricks SVG assets and fifteen Shibainu Vue assets are bundled.
  A local Vite adapter gates global layout styles by active theme using a
  zero-specificity selector. Static font utilities read the current deck's
  font stacks. No theme CSS leaks into other decks. Theme components are
  available only in their own theme.
- Pinned Fontsource 5.3.0 packages add Signika Negative, Sigmar One and
  Titillium Web with all selected weights, italics and Unicode subsets. The
  font audit now covers **77** faces across seven families, preserving original
  WOFF2 bytes and OFL-1.1 licenses. Apple Basic retains its local Helvetica Neue
  preference and system fallbacks. Default themes need no font-service request.
- Actual local Chromium and WebKit pass every theme layout, artwork delivery,
  package-name aliases, color defaults, fonts, component visibility and a full
  offline reload. Existing runtime/fonts/welcome/isolation and Chromium compiler
  checks pass; all **23** online units and **396** repository tests pass, with
  runtime/root builds, typechecks, lint and offline/vendor integrity checks.
  Root tests required refreshing stale Turbo build artifacts after installation.
- Expanded visual comparisons, CI and deployment are being verified. The
  complete source-corpus fidelity and phone-performance gates remain open.
  Phase 2 stays in progress and Phase 3 is still unimplemented.


### Deployed official-theme acceptance (2026-11-18)

- Implementation `e46b6545` and the fidelity follow-up `fc2716dc` are pushed on
  `main`. The [final deployment run 44418217672](https://github.com/curtcox/slidev/actions/runs/44418217672)
  passes all jobs: units, independent publication verification,
  Chromium/Firefox/WebKit, the expanded visual report and Pages deployment.
  Actual Firefox logs confirm all five themes, artwork/fonts, aliases,
  components, isolation, offline reload, **141** exact compiler SFC comparisons
  and **14** corpus fallbacks ran. No local Firefox run is claimed.
- The visual harness now covers **76** cases: the original 38 system-font
  fixtures, two bundled-font fixtures, every one of the 33 added theme layouts
  and three additional font fixtures. Apple Basic keeps its local/system font
  stack. Both renderers receive identical offline font bytes. Color-only image
  props disable the CLI's image preload service; external traffic stays mocked
  or blocked. This remains a deterministic subset of the full corpus.
- The expanded gate found and fixed an Apple Basic layout mismatch. Unlike the
  other four themes, Apple Basic does not import `layouts-base.css`; applying
  it globally made its introduction/image text fill the slide height. The
  runtime now follows each theme's actual style entry. A browser regression
  checks the resulting centered text layout. Published theme bytes are unchanged.
- Local Chromium passes **75 exact** comparisons and one within tolerance;
  WebKit passes **76 exact** comparisons. Downloaded final CI evidence has
  **72 exact** matches and four within tolerance, with no errors. Every new
  theme case matches exactly in CI. All three reports have runtime SHA-256
  `dc6f96b0b13b599c70f144f718fa2928972c81377d8d18c36345ce42efad43e0`.
  Initial JS/CSS measures **1,070,841 bytes gzip** locally and **1,070,295**
  in CI. Lazy font payloads remain separate; this is not phone-timing acceptance.
- The live [recovery site](https://curtcox.github.io/slidev/) reports `fc2716dc`
  with `dirty:false`. Live runtime bytes match that hash. Theme and font audits
  match the locally reviewed source hashes, sizes, counts, versions and licenses.
  Actual live Chromium and WebKit pass all five theme layouts/artwork/fonts,
  aliases, component visibility, style isolation and full offline reload, plus
  existing font-failure/retry and welcome/isolation suites. Custom Google service
  responses remain mocked; their external availability is not claimed.
- [Repository CI](https://github.com/curtcox/slidev/actions/runs/44418216726)
  passes typecheck, Cypress and Linux/Windows/macOS tests. Local checks retain
  **396** repository tests, **23** online units, runtime/root builds and
  typechecks, lint, actionlint and offline/vendor integrity. Icons, grammars,
  math, Mermaid, PlantUML and drag suites pass both local engines.
- All five planned theme audits and integrations are complete. Phase 2 remains
  open for remaining client features, full source-corpus rendering/fidelity and
  complete-runtime phone timing. Phase 3 stays unimplemented. This acceptance
  follow-up changes documentation only.

### Phase 2 source-corpus rendering and HTTPS images (2026-11-18)

- Added a browser gate for the unchanged starter, composable-vue and all online
  example sources. It covers all **52 visible slides** from **55 source slides**.
  Fifty slides mount. The two slides with file imports report their exact
  documented errors, terminate their frames and allow recovery on the next
  slide. Three hidden slides remain excluded from navigation.
- The gate checks initial, final and restored click states, highlighted code,
  all three starter Mermaid diagrams, five rendered math expressions and
  equation click ranges. It also checks static Monaco notices and PlantUML
  consent without any request to that service. Missing demo-only components,
  the unavailable Tweet widget and unbundled icons have explicit expectations.
  Unexpected errors or notices fail the gate.
- Checking decoded images exposed a product bug: the inherited page policy
  blocked ordinary HTTPS deck images. The page now permits HTTPS images and
  sets a default no-referrer policy. Scripts, connections, frames and opaque
  sandbox permissions remain unchanged. Actual local Chromium and WebKit
  receive the mock image bytes and omit the referrer on remote image requests.
- Both local engines pass the corpus gate. The harness uses the staged bridge,
  checks origin `null` and `sandbox="allow-scripts"`, mocks external images and
  blocks other external traffic. It does not establish external image-service
  availability, offline custom images or full source-corpus visual fidelity.
  Reports record browser versions, source/runtime hashes and per-slide results.
  Failed reports enter the shared workflow's existing test artifact directory.
- The gate is wired into all three CI browser jobs. CI and deployment remain
  pending. All **23** online units, static/vendor/offline integrity, lint and
  actionlint pass. Existing runtime, isolation, PlantUML consent and offline
  suites pass Chromium and WebKit. Phase 2 remains open for the remaining
  client features, full
  source-corpus visual fidelity and complete-runtime phone timing. Phase 3
  stays unimplemented.
- Implementation `f6075e72` is pushed on `main`. A harness follow-up accepts
  a deployment URL and hashes its served runtime, rather than assuming local
  bytes. Both local engines pass this mode and decode all **18** remote image
  elements. Root lint passes. The new CI unit and independent publication jobs
  pass. Browser, visual and deployment acceptance remain pending.

### Deployed source-corpus and image acceptance (2026-11-18)

- Implementation `f6075e72` and the deployment-harness follow-up `365752f1`
  are pushed on `main`. The final
  [deployment run 44421741572](https://github.com/curtcox/slidev/actions/runs/44421741572)
  passes every job, including units, independent publication verification,
  Chromium/Firefox/WebKit, visual comparisons and Pages deployment. Actual
  Firefox logs confirm **141 exact SFC comparisons**, **14 corpus fallbacks**
  and the complete **52-slide corpus gate** ran successfully.
- The live [recovery site](https://curtcox.github.io/slidev/) reports
  `365752f1` with `dirty:false`. Actual final live Chromium 156.0.8078.4 and
  WebKit 27.2 each pass all **52 visible corpus cases**. Fifty slides mount,
  two report their expected file-import errors and three hidden source slides
  remain excluded. Both engines decode all **18** remote image elements.
  Initial, final and restored click states, diagrams, equations, highlighting,
  static Monaco notices, missing-widget notices and error recovery pass.
- Before deployment, the gate reproduced the image failure on the old recovery
  page. After deployment, remote image requests receive the mock SVG bytes and
  omit the referrer. No PlantUML request occurs without consent. Opaque origin
  and sandbox checks pass. External images remain mocked, so these results do
  not establish image-host availability or offline custom-image support.
- Downloaded final CI visual evidence has **76 passing cases**, comprising
  **70 exact matches** and six within tolerance, with no errors. Both final
  local corpus reports, both live reports, the Firefox job and the visual
  report share runtime SHA-256
  `dc6f96b0b13b599c70f144f718fa2928972c81377d8d18c36345ce42efad43e0`.
  This change fixes the inherited page policy. Runtime bundle bytes are
  unchanged from the deployed official-theme acceptance.
- [Repository CI](https://github.com/curtcox/slidev/actions/runs/44421740744)
  passes typecheck, Cypress and Linux/Windows/macOS tests. Local checks pass
  all **23 online units**, root lint, actionlint and static/vendor/offline
  integrity. Existing runtime, isolation, PlantUML consent and offline suites
  pass local Chromium and WebKit. The separate Continuous Releases workflow
  still fails because `pkg-pr-new` lacks access to this fork.
- Phase 2 remains open for remaining client features, full source-corpus visual
  fidelity and complete-runtime phone timing. Phase 3 stays unimplemented.
  This final acceptance follow-up changes only the plan and its index.

### Phase 2 CSS slide transitions (2026-11-18)

- Navigation previously remounted the Vue app and omitted the upstream
  transition stylesheet. Slide changes now keep the app mounted and use
  Slidev's direction resolver with Vue transitions. Deck and per-slide
  configuration support fade, fade-out, directional slides, paired names,
  object options and custom CSS. An explicit `none` disables animation.
  The first render does not animate. Native `view-transition` requests
  show a visible notice and fall back to fade. Native view transitions
  remain unimplemented.
- Styles remain attached until the departing DOM finishes its animation.
  Rapid reversals remove old nodes and their styles. Click changes preserve
  author state and do not rerun the slide's script. Document replacement
  still destroys the old opaque frame. Icons discovered during navigation
  register with the persistent app before the new slide mounts.
- Added a browser regression to all three CI engine jobs. It checks actual
  computed animation effects, forward/backward names, overrides, style lifetime,
  click state, rapid reversals, frame replacement, fallback notices and offline
  rendering. Existing runtime assertions now target the active slide where
  departing and incoming slides briefly coexist.
- Implementation `07e1d9c1` is pushed on `main`. Actual local Chromium
  156.0.8078.4 and WebKit 27.2 pass the new transition suite, including native
  fallback notices and offline rendering. Both engines retain **141 exact SFC
  matches**, **14 corpus fallbacks** and all **52 visible corpus cases**.
  Runtime, icons and drag regressions also pass both engines.
- Final local visual reports pass all **76 cases**. Chromium has **74 exact
  matches** and two within tolerance. WebKit has **76 exact matches**.
  Both visual and corpus reports use runtime SHA-256
  `fe0961350615c8e70c4f103981b05c0d5b3f0f0ce7ac79c3a18aeeb2690c612e`.
  Initial JS/CSS measures **1,071,342 bytes gzip** locally. This measurement
  does not establish phone performance.
- All **396** repository tests and **23** online units pass locally.
  Runtime/root builds, typechecks, root lint, actionlint and static/vendor/offline
  integrity also pass. The HMR tests require local server access outside the
  restricted network sandbox. No local Firefox run is claimed.
- CI and deployment are being verified. Phase 2 remains open for native view
  transitions, other remaining client features, full source-corpus visual
  fidelity and phone performance. Phase 3 remains unimplemented.

### Deployed CSS-transition acceptance (2026-11-18)

- Implementation `07e1d9c1` and local acceptance `9d31511b` are pushed on
  `main`. The [deployment run 44424966947](https://github.com/curtcox/slidev/actions/runs/44424966947)
  passes every job, including online units, independent publication checks,
  Chromium/Firefox/WebKit, visual comparisons and Pages deployment. Actual
  Firefox logs confirm the transition suite, **141 exact SFC comparisons**,
  **14 corpus fallbacks** and all **52 visible corpus cases** ran.
- Downloaded CI visual evidence passes all **76 cases**, with **72 exact
  matches**, four within tolerance and no errors. Its runtime SHA-256 matches
  both local visual reports and both live corpus reports:
  `fe0961350615c8e70c4f103981b05c0d5b3f0f0ce7ac79c3a18aeeb2690c612e`.
  CI measures initial JS/CSS at **1,070,804 bytes gzip**. Local compression
  measures **1,071,342 bytes** for the same source bytes.
- The live [recovery site](https://curtcox.github.io/slidev/) reports
  `07e1d9c1` with `dirty:false`. Actual live Chromium 156.0.8078.4 and WebKit
  27.2 pass the complete transition suite. Both also pass all **52 visible
  corpus cases**, decode all **18** mocked image elements and pass the
  welcome/isolation/offline-reload suite. Transition checks include actual CSS
  effects, backward navigation, overrides, click-state preservation, style
  cleanup, rapid reversals, frame replacement and the native-transition notice.
- [Repository CI](https://github.com/curtcox/slidev/actions/runs/44424965146)
  passes typecheck, Cypress and Linux/Windows/macOS tests. Existing local
  runtime, icon, grammar, font, theme, math, Mermaid, PlantUML, drag and offline
  suites pass Chromium and WebKit. The separate Continuous Releases workflow
  still fails because `pkg-pr-new` lacks access to this fork. It remains outside
  this online deployment gate.
- Phase 2 remains open for native view transitions, remaining client features,
  full source-corpus visual fidelity and complete-runtime phone timing.
  Phase 3 remains unimplemented. This acceptance commit changes only the plan
  and its index.

### Phase 2 native transitions and phone baseline (2026-11-18)

- Native named-element transitions landed in `d01fdefd`. Local Chromium and
  WebKit pass the actual browser animation, click-only navigation, backward
  navigation, duplicate-name recovery, frame replacement and forced API-missing
  fade fallback. Runtime build/typecheck, all 23 online units, lint on the
  changed files and static/vendor/offline checks pass. Local Firefox cannot open
  its temporary profile. The [deployment run](https://github.com/curtcox/slidev/actions/runs/44442623689)
  is in progress.
- Added a repeatable cold-start report for the real welcome page. Five fresh
  Chromium 156.0.8078.4 mobile contexts used 390 × 844 at DPR 2, 4× CPU
  slowdown, 40 ms added latency and 1.5 MB/s download. The live gzip-served
  baseline at `07e1d9c1` took **3,131–3,629 ms** (median **3,264 ms**) from
  navigation to two animation frames after render acknowledgement. The runtime
  JS and CSS total **1,071,342 bytes gzip**, under the 3 MB payload budget.
  The 2 s timing target remains open. This measurement uses simulated Chromium
  on the development host.

### Deployed native transitions and startup tuning (2026-11-18)

- The [native transition deployment](https://github.com/curtcox/slidev/actions/runs/44442623689)
  passed all jobs, including Chromium, Firefox, WebKit and the visual report.
  GitHub Pages reported `d01fdefd` with `dirty:false`. The live transition suite
  passed in local Chromium and WebKit.
- The startup path now requests preview JavaScript and CSS together and overlaps
  font loading with first-slide compilation. The starter page fetches its
  configuration and Markdown concurrently and starts offline pre-caching after
  initial render. Full minification preserves the runtime's single ESM asset
  and reduces staged JS and CSS from **1,071,505** to **984,414 bytes gzip**.
- On the same compressed local server and phone profile, five measurements
  before tuning had a **3,248 ms** median. Five after tuning had a **2,694 ms**
  median, ranging from **2,424 to 3,071 ms**. The phone target remains open.

### Phase 2 lazy math and gallery fidelity (2026-11-18)

- The [startup deployment](https://github.com/curtcox/slidev/actions/runs/44443846503)
  passed all jobs, and the recovery site reported `b4c49eac` with
  `dirty:false`. Local Chromium and WebKit passed the startup, font, theme,
  transition, compiler and corpus checks.
- `4c03f799` fixes rapid CSS-to-native navigation. A departing CSS slide is
  excluded from the native snapshot so it cannot duplicate a shared element
  name. The new regression passes in local Chromium and WebKit.
- `3f33a1ed` adds every visible slide of each unmodified gallery example to
  the CLI screenshot comparison. The current welcome example matches
  pixel-for-pixel in Chromium and WebKit. Local reports passed **77 cases**
  in each engine, with 75 and 76 exact matches respectively. Full screenshots
  of the starter and composable-vue demos remain open. Their compiler and
  DOM checks still run separately.
- The trusted KaTeX ESM asset now loads on demand through the SDK. Offline
  delivery verifies the original module bytes alongside the existing CSS,
  fonts and MIT license. The first plain slide of a deck with math on later
  slides makes no math asset request. Both local engines pass lazy loading,
  shared assets on subsequent slides, renderer and stylesheet failure handling,
  and offline math. Both also retained **141 exact SFC matches**,
  **14 corpus fallbacks** and all **52 visible corpus cases**.
- The resulting staged initial JS and CSS total **907,713 bytes gzip**.
  Five compressed local navigations on the same simulated profile took
  **2,216–2,738 ms** (median **2,458 ms**). The 2 s timing target remains open.

### Phase 3 document format (2026-11-18)

- The buildless Slidev adapter validates the combined 5 MiB Markdown and CSS
  limit used by the preview. Fragment Kit round-trip tests cover compact v1
  source links, CSS, extension fields, start-slide settings, malformed links
  and unrelated document types. Extension fields keep the full envelope even
  when CSS is empty, which preserves them across older editors.
- The preview uses the same adapter for input validation. The editor UI, draft
  recovery, app-level link opening, sharing and HashBin remain pending.

### Deployed lazy math and visual acceptance (2026-11-18)

- The [deployment of `e2967cca`](https://github.com/curtcox/slidev/actions/runs/44444941233)
  passed units, independent publication verification, Chromium, Firefox,
  WebKit, the visual report and Pages deployment. The recovery site reported
  `e2967cca` with `dirty:false`. Live Chromium and WebKit passed lazy math,
  mixed CSS/native transitions and offline reload.
- Five cold loads of `e2967cca` from GitHub Pages on the recorded Chromium
  phone profile took **2,413–2,738 ms** (median **2,497 ms**, down from
  **3,264 ms** on the earlier live release). Each browser download matched
  the recorded runtime hash and used gzip. The 2 s target remains open.
- Final Chromium and WebKit visual reports each passed **77** cases, with
  74 and 76 exact matches. The CI report passed 77 cases with 72 exact
  matches. All three reports compare the welcome example pixel-for-pixel
  and agree on runtime SHA-256
  `524341344516c9779cda6be38dfa8bbc4892afe4d27b79230ecbdfb13384c641`.
- All **396** repository tests and **26** online units pass locally, with
  lint, typechecks and the static/vendor/offline checks. The drag regression
  now waits for the final coordinates after a multi-step pointer move.
  Chromium and WebKit both pass the updated test.


### Phase 3 editor workspace (2026-11-18)

- Pinned Ace 1.43.3 ships with unchanged BSD-3-Clause license and audited module
  hashes. Separate Markdown and CSS sessions keep independent undo histories.
  Slidev's parse-only bundle supplies visible slide boundaries and text notes.
  Hidden and disabled slides follow the runtime's numbering.
- The workspace adds mobile tabs, desktop Split view, a pointer/keyboard divider,
  slide navigation, dark slides and a fullscreen action. Cursor navigation keeps
  the selected editor position. Preview navigation reveals the slide source.
- Guarded link loading supports compact/envelope links, welcome examples, verified
  CIDs and the kit's Publish callback. Invalid and late loads cannot replace work.
  Reads enforce byte and time limits. Explicit links never restore browser drafts.
  Recovered drafts, file imports and `?run=0` links wait for Render.
- Share uses the kit dialog and is.gd proxy. QR uses a matching saved CID or the
  full document. HashBin controls use the kit store and registration message.
  No client ID or live paid Publish round trip is claimed. Downloads currently
  offer Markdown, CSS and a combined JSON document.
- Local Chromium and WebKit passed editor, CSS/extension preservation, Run-on-open,
  cursor/preview navigation, sharing with a mocked shortener, draft recovery,
  inline CID/QR, isolation and compact layouts. Local Firefox could not create
  its profile and exited before app code. The new browser check is wired into
  the existing CI engine matrix. A product deployment is not yet claimed.
- Phase 3 remains open for the full kit contract adapter/suite, ZIP download,
  overview/swipe controls and precise compiler error locations. Phase 2's demo
  screenshots and complete-runtime 2 s phone target also remain open.

### Editor caret and local verification (2026-11-18)

- Automatic preview replacement now preserves the typing caret. A new regression
  inserts text through Ace, waits for the new heading and compares the caret.
  Preview navigation still reveals the destination source. Explicit document
  opening positions the editor at the requested slide.
- Chromium and WebKit pass the final editor suite, including example-link
  normalization, forged CID rejection and file imports that wait for Render.
  Both engines also pass offline reload with the new Ace assets.
- All 36 online units and 396 repository tests pass. The HMR tests require local
  socket access. Root lint/typechecks, runtime typechecks, release staging and
  static/vendor/offline checks pass. The release build records a clean checkout.


### Deployed editor acceptance (2026-11-18)

- [The final editor deployment](https://github.com/curtcox/slidev/actions/runs/44449299336)
  passed all jobs for `e32d9c36`. CI passed Chromium, Firefox and WebKit,
  the visual fidelity report, units, independent kit verification and Pages.
- The recovery site reported `e32d9c36` with `dirty:false`. Local Chromium
  and WebKit against that production release passed the editor suite and
  offline reload, including the cached seriph theme. Editor coverage includes
  the typing caret, CSS/extensions, deferred rendering, preview navigation,
  draft protection/recovery, CID/QR, forged CID rejection, file imports,
  opaque isolation and compact layouts. The shortener response was mocked.
- No live paid Publish round trip ran. The registered client ID remains an
  owner action. Full kit contracts, ZIP download and preview polish remain
  Phase 3 work. The demo screenshot gate and 2 s phone target remain open.

### Phase 3 ZIP export (2026-11-18)

- Download now offers `slides.zip` containing the current `slides.md` and
  `style.css`. Files retain their UTF-8 bytes and line endings. The saved JSON
  option still preserves document extension fields. Archives use fixed filenames
  and the document adapter enforces the combined 5 MiB limit before export.
- All 38 online units pass, including byte-for-byte comparison with an archive
  made independently by Python's `zipfile`. Local Chromium and WebKit pass the
  editor suite with a real ZIP download. Lint and static/vendor/offline checks
  pass. Deployment verification follows the push.

### Phase 3 kit contracts (2026-11-18)

- Added the Ace adapter and `npm run test:contracts` for the unchanged kit's
  URL identity, sharing, QR round-trip, HashBin callback, draft recovery and
  mobile layout contracts. CI runs them in each existing browser job.
  App-owned cases also verify both Ace files, deferred rendering and cancelled
  QR saves. Two demo-only kit cases per engine intentionally skip consumers;
  Slidev's own editor suite checks its workspace views. Vendor bytes stay intact.
- The contracts exposed two bugs: a large-deck QR save did not reopen the QR
  dialog with its saved CID, and WebKit's paired navigation events could consume
  a Publish callback twice. Both flows now pass, including cancelling a QR save
  before a later ordinary save.
- Local Chromium and WebKit pass all 40 applicable tests (four demo-only skips
  across both engines). Lint and static/vendor/offline checks pass. Publish,
  camera frames and the shortener use the kit's mocks; no live paid Publish
  round trip is claimed. CI and deployment verification follow the push.

### Phase 3 overview and touch navigation (2026-11-18)

- The preview toolbar now opens a grid of visible slide titles. Titles render
  as text on the editor origin. Opening the grid does not execute author code.
  Selection follows runtime numbering, updates the source and URL, and restores
  focus to the toolbar when the dialog closes.
- Touch navigation uses the existing click steps. Swipe left or tap the right
  two-thirds to advance. Swipe right or tap the left third to go back. Controls,
  code selection, drag elements, vertical scrolling and cancelled gestures keep
  their own behavior. The touch listeners stay inside the opaque frame.
- Chromium and WebKit pass all 44 applicable contract tests, with four demo-only
  skips across both engines. The new tests cover inert titles, hidden slides,
  keyboard focus, real touch taps and pointer swipe/cancellation paths. Chromium
  also passes a native swipe through its browser input protocol. The mobile
  overview screenshot passed a visual layout check.
- Both engines pass the editor, runtime, drag and offline reload suites. All 38
  online units, runtime build/typecheck, lint and static/vendor/offline checks
  pass. Precise compiler error locations remain Phase 3 work.
- The ZIP deployment for `1af94976` passed all jobs, including all three browser
  engines, the visual report and Pages:
  [ZIP release workflow](https://github.com/curtcox/slidev/actions/runs/44450869083).
  The later contracts and overview releases still need deployment verification.

### Deployed Phase 3 downloads and navigation (2026-11-18)

- [The final product deployment](https://github.com/curtcox/slidev/actions/runs/44452119804)
  passed all jobs for `bb962fb6`. CI passed Chromium, Firefox, WebKit, the visual
  report, units, independent kit verification and Pages deployment. The recovery
  site served `bb962fb6` with `dirty:false`. The earlier contracts deployment
  for `a478368a` also passed.
- Local Chromium and WebKit against the production release passed all 44
  applicable contract checks, with four demo-only skips across both engines.
  Coverage includes both Ace files, URL identity, sharing, QR upload/camera,
  HashBin callbacks, draft recovery, compact layout, overview and touch navigation.
  Both engines also passed the deployed editor suite with a real ZIP download
  and fully offline reload, including the cached seriph theme.
- Publish, camera frames and the shortener used mocks. No live paid Publish
  round trip ran. Browser input supplied real taps in both local engines and a
  native Chromium swipe. No physical phone acceptance is claimed.
- All 38 online units, root lint/typechecks, runtime build/typecheck and
  static/vendor/offline checks passed locally. Release staging recorded a clean
  checkout. Root lint now excludes generated Playwright reports.
- Phase 3 remains open for precise compiler error locations. HashBin client
  registration remains an owner action. Phase 2 still needs full demo screenshot
  fidelity and the complete runtime's 2 s phone target.

### Phase 3 compiler diagnostics (2026-11-18)

- Compiler errors now carry document file, line and column through the bounded
  sandbox bridge into the appropriate Ace session and visible status. Markdown
  source spans are retained without changing the CLI's generated SFC. Hoisted
  scripts/styles and Vue macro code frames map back to the original document.
- Local Chromium and WebKit pass all **26** new diagnostic checks: script syntax
  and macros, template/inline/title expressions, HTML, scoped CSS and UnoCSS
  directives, global CSS, ordinary/fenced YAML, CRLF/BOM, hidden/disabled slides,
  failed destination navigation and correction. Errors destroy the failed frame;
  correcting a document clears annotations and creates a fresh opaque frame.
- Coordinates are checked against the rendered document. Edited snapshots and
  Markdown changed by drag patches cannot receive stale precise annotations.
  Generated-only errors and runtime exceptions fall back to the slide's source
  start when no reliable source span exists.
- All **39** online units and **396** repository tests pass. Root lint/typecheck,
  runtime build/typecheck and static/vendor/offline checks pass. Chromium compiler
  characterization retains **141 exact SFC matches**, all 40 grammars and
  **14 corpus fallbacks**. The earlier full Chromium/WebKit contracts passed
  **68** applicable checks (four demo-only skips); the final directive case adds
  one check per engine. Deployment acceptance follows the push.

### Deployed Phase 3 diagnostics acceptance (2026-11-18)

- [The corrected release workflow](https://github.com/curtcox/slidev/actions/runs/44455476664)
  passed all jobs for `61fc136b`: Chromium, Firefox, WebKit, units, independent
  kit verification, the visual report and Pages deployment. Each CI browser
  passed 35 applicable contracts, 141 exact SFC comparisons and all 52 visible
  corpus slides. The visual report passed all 77 comparisons, with 75 exact
  matches and a pixel-for-pixel welcome slide.
- The recovery site served `61fc136b` with `dirty:false`. Its runtime SHA-256
  `3fe0733fbe2fab34366665422a11e9a7b2467c3a727740c893449cae585ad09d`
  matches the local build and CI. Live Chromium and WebKit passed all **70**
  applicable contracts, with four demo-only skips across both engines. Both
  also passed the editor suite with a real ZIP download, opaque isolation and
  fully offline reload, including the cached seriph theme.
- Compiler messages now show the author's file and coordinates without generated
  filenames, injected code frames or conflicting relative YAML coordinates.
  Corpus expectations use the normalized message format. All 39 online units,
  396 repository tests, lint/typechecks, runtime build and static/vendor/offline
  checks pass locally; the repository's main CI also passes.
- Phase 3 implementation and its planned contract suite are complete. Publish,
  camera frames and shortening still use mocks in acceptance. HashBin client
  registration remains an owner action; no live paid Publish round trip or
  physical phone acceptance is claimed. Phase 2's full demo screenshot gate and
  complete-runtime 2 s phone target remain open, alongside Phases 4–8.


### Phase 4 docs and gallery (2026-11-18)

- User documentation now has Markdown sources and reproducible HTML, covering
  supported features, sharing/privacy, downloads, themes, fonts, PlantUML and
  the pending AI workflow. Static checks reject stale docs and catalogs.
- The unchanged kit gallery searches and filters 15 local example decks. Its
  links contain the exact document and stay on the served origin/subpath.
  Allowlists also support direct example query links without arbitrary fetches.
  Browsing the gallery never executes deck code.
- Committed covers render slide 1 through the actual opaque preview in Chromium.
  The kit fingerprints the catalog, renderer, bridge, SDK and every runtime
  asset. CI checks source and cover hashes. The example source uses Slidev's
  formatter so per-slide configuration retains its meaning.
- Local Chromium and WebKit pass gallery filtering, cover decoding, served-origin
  navigation, script interaction, deferred rendering, docs links and a 360 px
  layout. Both pass fully offline reload, cached gallery covers and interaction
  with a gallery deck. Chromium also passes the existing editor suite.
- Both local engines pass 187 exact SFC comparisons and 14 corpus fallbacks.
  Their final corpus reports verify 84 visible slides, including two expected
  file-import errors. All 40 online units, root lint/typecheck and static/vendor/
  offline checks pass. The visual harness now waits for gallery Mermaid output
  and JavaScript motion before capture. Final visual and deployment acceptance
  follow the push. Phase 2's demo screenshot and 2 s phone targets remain open.


### Deployed Phase 4 docs and gallery acceptance (2026-11-18)

- Implementation commits `de82c18a`, `05787ac9`, `775c92c8` and `e0e50c5f`
  are pushed on `main`. [The final deployment workflow](https://github.com/curtcox/slidev/actions/runs/44459364836)
  passed every job: units, independent kit verification, Chromium, Firefox,
  WebKit, the visual report and Pages. Repository CI and the production smoke
  workflow also passed. The separately documented Continuous Releases failure
  remains outside this deployment gate.
- The recovery site reported `e0e50c5f` with `dirty:false`. Its runtime,
  generated catalog and cover fingerprints match the staged bytes. Runtime
  SHA-256 is `3fe0733fbe2fab34366665422a11e9a7b2467c3a727740c893449cae585ad09d`,
  matching CI and both local visual reports.
- Local visual comparisons passed all 109 cases in each engine: 106 exact in
  Chromium and 109 exact in WebKit. The downloaded final CI artifact also
  passed all 109 cases, with 106 exact matches and no errors. Every report's
  example source hashes match the committed Markdown. The harness waits for
  Mermaid output and completed JavaScript motion in both renderers.
- Final local Chromium/WebKit compiler reports retain 187 exact SFC matches,
  all forty grammars and 14 corpus fallbacks. Their corpus reports pass all
  84 visible slides and match the final source hashes. Actual CI Firefox logs
  confirm these same compiler/corpus counts, its 35 applicable contracts, the
  gallery suite and fully offline gallery interaction. Local contracts pass
  all 70 applicable checks across Chromium/WebKit, with four demo-only skips.
- Live Chromium and WebKit pass gallery covers, search/tag filters, links on
  the recovery subpath, isolated script interaction, deferred rendering,
  documentation links and the 360 px layout. Both also pass fully offline
  reload, seriph rendering, cached gallery covers and gallery interaction.
  Covers load lazily, so acceptance scrolls each into view and waits for its
  dimensions before decoding. This fixes the Firefox acceptance failure without
  weakening its image checks.
- All 40 online units, root lint/typecheck, static/vendor/offline checks and
  clean release staging pass. Phase 4 is complete. HashBin client registration
  remains an owner action. Phase 2's full demo screenshot and 2 s phone targets
  remain open, as do Phases 5–8. No live paid Publish or physical phone test is
  claimed. This final update changes documentation only.


### Phase 2 built-in styles and TOC math (2026-11-19)

- Demo screenshots exposed missing UnoCSS utilities in bundled components.
  Runtime CSS now includes every registered built-in component source.
  `PoweredBySlidev` keeps its inline layout and its logo at 1.5 em.
- Math styles now load when the mounted slide contains equations. This also
  covers equations in TOC titles, which are absent from the slide's own SFC.
  Plain slides still defer math assets. Styles load before native transition
  snapshots and render acknowledgement.
- Chromium and WebKit pass the runtime and math suites, including the new
  branding and TOC cases, visible delivery failures and offline math.
  Runtime build/typecheck and all 40 online units pass. Gallery covers retain
  their image bytes. Their fingerprints now identify the updated runtime.
- The expanded demo comparison runs locally. Its harness and final visual
  acceptance follow separately. Deployment acceptance follows the push.


### Phase 2 full demo visual report (2026-11-19)

- The visual harness now covers both original demo decks and all gallery decks.
  CLI references retain local components, snippets and setup files. Each build
  runs in its own process because the CLI caches its first project root.
  Preloading HTML makes Markdown code colors independent of build order.
- Local Chromium passes all 162 cases. It captures 160 screenshot comparisons
  and checks two exact file-import errors. All 131 supported comparisons meet
  the existing 0.1% tolerance. Of those, 127 match every pixel.
- The remaining 29 screenshots identify known differences: filesystem
  components, unbundled icons, Monaco, PlantUML consent and an imported TOC title.
  They remain diagnostic comparisons and do not count as CLI pixel parity.
  Deck-level warning text is checked before capture. Inline fallbacks remain
  visible. Reports include source paths, hashes and separate case counts.
- Both local browsers retain all 84 corpus cases with the shared expectations.
  All 40 online units, root lint/typecheck, runtime build/typecheck and static,
  vendor, gallery and offline checks pass. The revised reference helper also
  passes an independent build from a different project root.
- The expanded WebKit run and CI acceptance follow. The CI visual job remains
  a nonblocking report while these cases stabilize. The initial runtime is
  922,087 bytes gzip. The complete runtime's 2 s phone target remains open.


### Phase 2 demo coverage and complete-editor timing (2026-11-19)

- Implementation commits `da423c13` and `424f898b` are pushed on `main`.
  [The runtime-fix deployment](https://github.com/curtcox/slidev/actions/runs/44532102959)
  passed every job, including all three browser engines and Pages.
- Chromium and WebKit each pass all 162 visual cases locally. The 131 supported
  comparisons meet the unchanged tolerance. Exact matches number 127 in Chromium
  and 129 in WebKit. The other cases remain 29 diagnostic fallback comparisons
  and two exact file-import errors.
- [The expanded CI visual report](https://github.com/curtcox/slidev/actions/runs/44533140036)
  also passes all 162 cases. Its downloaded artifact matches every local source
  hash and the runtime hash. It retains 127 exact supported comparisons.
  All three browser jobs, units, kit verification and Pages also pass in that
  workflow. Repository CI for `424f898b` passes. The visual job remains nonblocking.
- The recovery site served `da423c13` with `dirty:false` during live acceptance.
  Its runtime SHA-256 is
  `b930d19a87b71376037874cb2a81e29b60ffef310dffac326e4cd2ae3774511c`.
  This matches both local engines and CI. Live Chromium and WebKit pass the
  runtime and math suites, including branding, TOC equations, opaque isolation,
  visible delivery failures and fully offline math reload. The final deployment
  then served `424f898b` with `dirty:false` and the same verified runtime hash.
- Five fresh Chromium contexts measured the complete editor at clean commit
  `424f898b` on a local server with precompressed gzip assets. The profile uses
  390 × 844, DPR 2, 4× CPU slowdown, 40 ms latency and 1.5 MB/s downloads.
  Navigation to two frames after render acknowledgement takes 3,108–3,747 ms,
  with a median of 3,231 ms. The initial runtime is 922,087 bytes gzip.
  The 3 MB payload budget passes. The 2 s timing target remains open.
  These are simulated measurements on the development host.


### Phase 2 startup and visual deployment gate (2026-11-19)

- Commit `2e36515f` is pushed on `main`. Ace no longer blocks discovery of the
  editor module. QR tools load when the user opens QR. The editor shell remains
  native modules, and author code still runs only inside the opaque SDK frame.
- Five cold Chromium loads of the clean committed build measured 2,725–3,089 ms,
  with a median of 2,746 ms. The same-session baseline median was 3,083 ms.
  Both runs used gzip delivery on a local server and the existing simulated
  phone profile. These measurements describe the development host, not a
  physical phone. The 2 s target remains open.
- The initial runtime remains 922,087 bytes gzip. Its SHA-256 remains
  `b930d19a87b71376037874cb2a81e29b60ffef310dffac326e4cd2ae3774511c`.
  Loading changes do not change the runtime bytes or gallery fingerprints.
- Local Chromium and WebKit pass all 74 applicable contracts, with four
  demo-only skips across both engines. New cases cover deferred QR loading,
  dialog reuse and a visible optional-module failure that preserves the document.
  Both engines pass first-use QR after a fully offline reload, cached seriph
  rendering and gallery interaction. WebKit also passes the editor and runtime
  suites. All 40 online units, root lint and static/vendor/offline checks pass.
- The visual job now blocks deployment. Supported slides retain the existing
  0.1% pixel tolerance. Documented feature fallbacks remain diagnostic, and
  file imports must fail visibly. Deployed acceptance is recorded below.
  Phase 2 remains open for the phone timing target.


### Deployed startup and blocking visual acceptance (2026-11-19)

- Implementation commits `2e36515f` and `7d952677` are pushed on `main`.
  [The blocking deployment workflow](https://github.com/curtcox/slidev/actions/runs/44538990784)
  passed every job, including Chromium, Firefox, WebKit, visual fidelity and Pages.
  Repository tests and autofix also passed. The separate
  [Continuous Releases workflow](https://github.com/curtcox/slidev/actions/runs/44538989990)
  still fails because `pkg-pr-new` lacks access to this fork.
- Local Chromium and WebKit each pass all 162 visual cases. All 131 supported
  comparisons meet the unchanged tolerance. Exact matches number 127 in Chromium
  and 128 in WebKit. The other cases remain 29 diagnostic fallback comparisons
  and two exact file-import errors.
- The downloaded final CI visual artifact also passes all 162 cases. It retains
  125 exact supported comparisons. Every source hash and the runtime hash match
  the local reports. The actual Firefox log confirms 37 applicable contracts,
  first-use offline QR, 187 exact SFC comparisons, all 40 grammars and 84 visible
  corpus slides.
- The recovery site serves `7d952677` with `dirty:false`. Its HTML, app module,
  runtime and CSS match the staged bytes. Live Chromium and WebKit pass all
  74 applicable contracts, with four demo-only skips across both engines.
  Both also pass real ZIP downloads and fully offline reload, including first-use
  QR, cached seriph rendering and gallery interaction.
- Publish, camera frames and shortening use mocks. No live paid Publish or
  physical phone acceptance ran. HashBin registration remains an owner action.
  Phase 2 remains open for the 2 s phone target, and Phases 5–8 remain open.
  This final update changes documentation only.


### Phase 2 build-time utility extraction (2026-11-19)

- Builds now extract matched UnoCSS tokens from the pinned layouts, built-in
  components, directives and theme sources. The browser combines those tokens
  with the current slide and generates CSS using the deck's font settings.
  Author compilation remains inside the opaque frame.
- The initial runtime falls from 922,087 to 875,439 bytes gzip. Two new tests
  compare complete CSS for upstream components, attributify, variants, shortcuts
  and custom fonts. All 42 online units and static/vendor/gallery/offline checks
  pass. Gallery images retain their bytes; fingerprints identify the new runtime.
- Chromium and WebKit each pass all 162 visual cases at the unchanged tolerance.
  Both pass runtime behavior, sandbox isolation, all five themes and fully
  offline reload, including QR and gallery interaction. Root lint/typechecks pass.
  Repository tests pass all 396 cases: 394 under the filesystem sandbox and the
  two port-dependent HMR cases rerun with local-port access.
- Five cold loads of the staged build measure a 2,675 ms median versus a
  same-session 3,095 ms baseline, using the existing simulated phone profile
  and local gzip delivery. These diagnostic builds precede the implementation
  commit. Clean-release measurement and deployment acceptance follow the push.
  The 2 s target remains open.


### Phase 2 early runtime delivery (2026-11-19)

- Commit `9e986660` is pushed on `main`. Its clean committed build measures
  2,496–2,880 ms over five cold simulated-phone loads, with a 2,546 ms median.
  The initial runtime is 875,439 bytes gzip, SHA-256
  `9626b43048d0fcdb67b8b2c5288d91e42b7a6b4687df6f0ff750bc53d459ebc0`.
- A small native module now starts credential-free downloads of trusted runtime
  JavaScript and CSS while the editor loads. An in-memory response cache gives
  the SDK readable copies for each new opaque frame. It never imports runtime
  code on the editor origin. Failures remain retryable. Other requests retain
  the SDK's normal proxy path. `?run=0` defers these speculative downloads.
- Both local engines pass all 78 applicable contracts, with four demo-only skips.
  New cases verify one download per asset, fresh frame execution after edits,
  absence of author state on the editor origin and explicit Render deferral.
  Both engines also pass runtime behavior, the editor with real ZIP downloads,
  fully offline reload, first-use offline QR, seriph and gallery interaction.
- All 44 online units and static/vendor/gallery/offline checks pass. Gallery
  image bytes remain unchanged. Runtime bytes and the 162-case visual results
  from utility extraction remain unchanged. Root lint passes.
- Five cold loads of the early-delivery staging experiment measure
  2,011–2,435 ms, with a 2,062 ms median. The profile and local gzip server match
  the clean-build run above. This second measurement precedes its implementation
  commit. Clean-release measurement and deployed acceptance follow the push.
  The maximum remains above 2 s, so Phase 2 stays open.
