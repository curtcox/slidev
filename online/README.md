# Slidev Online

Browser-based editor and presenter for Slidev decks, built on [Fragment Kit](https://github.com/curtcox/Tools-for-pages-with-state-in-URL-fragments) (`v0.4.4`) and the real Slidev Vue client.

- **Canonical origin:** [https://slides.hashbin.page/](https://slides.hashbin.page/) (HashBin saving and isolated AI host)
- **Recovery origin:** [https://curtcox.github.io/slidev/](https://curtcox.github.io/slidev/) (GitHub Pages mirror)
- **User guides:** [docs/index.md](docs/index.md) (rendered to `docs/*.html`)

## Architecture

Slidev Online separates the editor shell from untrusted deck execution:

- **Editor shell (`index.html`, `presenter.html`, `gallery.html`, `src/`)** — buildless native ES modules using vendored Fragment Kit (`vendor/fragment-kit-v0.4.4/`, including HashBin SDK `v0.6.0`) and Ace (`vendor/ace-1.43.3/`). Vendored kit bytes are immutable; upgrade only with `vendor-sync.mjs`. CI checks the vendor pin against the published release manifest via `kit-check.yml@v2`.
- **Slidev runtime (`runtime/`, workspace package `@slidev/online-runtime`)** — a Vite build from `packages/*` that runs strictly inside an opaque SDK iframe (`sandbox="allow-scripts"`, origin `null`) with no access to the editor document, storage, or cookies.
- **Editor parser bundle (`runtime/editor/document.js`)** — parse-only bundle used on the editor origin for slide boundaries, titles, speaker notes, and bounded drag-position patches without executing author code.

### Runtime compilation and isolation

- Reuses Slidev's Markdown plugin chain and layout wrapper inside the opaque frame. Vue's eval-dependent static-tree optimization is disabled so templates compile under the frame CSP.
- Hidden and disabled slides follow CLI numbering while headmatter and source line ranges remain attached to the original document.
- `src/runtime-assets.js` starts credential-free preloads of the runtime JavaScript and CSS while the editor loads (deferred on `?run=0` until **Render**).
- Vite compiles core and theme CSS at build time and pre-extracts UnoCSS tokens from bundled layouts, built-in components, directives, and themes. The sandbox combines those tokens with slide and frontmatter utilities using the active deck's font variables.
- Module URLs are created on demand when a slide imports them. Static and dynamic imports share the same module within a preview.
- `runtime/virtual-modules.json` is the single source of truth for `#slidev/*` virtual module aliases. Builds and static checks scan client TS/Vue imports and fail if a new `#slidev/*` module lacks a runtime implementation.
- Navigation, dark mode, and drag state stay in memory inside the opaque frame (no opaque-origin storage).

## Features

### Editor and workspace

- Pinned Ace editors for `slides.md` and `style.css` (5 MiB combined UTF-8 limit); preview updates after a 500 ms pause.
- Compiler diagnostics map errors back to editor file, line, and column when available.
- Phones and short viewports use **Slides**, **Markdown**, and **CSS** tabs; desktop adds **Split** view with a draggable and keyboard-accessible divider.
- Preview navigation follows the editor cursor, and slide navigation reveals the corresponding source.
- **Overview** lists visible slides by title with keyboard selection; touchscreens support left/right swipes and tap zones while preserving interactive controls.
- Speaker notes render as plain text. **Present** requests fullscreen on the preview iframe from a user click.

### Sharing, links, QR, and HashBin

- Share URLs encode `slides.md`, `style.css`, extension fields, `?slide=`, `?view=`, and `?run=0` in the URL fragment/query. Explicit links take priority over stored drafts, and failed links preserve current work.
- Drafts save locally in browser storage; recover via **More → Resume saved work**. Recovered drafts, imported files, and `?run=0` links wait for **Render**.
- The **Share** dialog supports optional link shortening via `is.gd` through Fragment Kit's AllOrigins proxy.
- The **QR** dialog (lazy-loaded scanner) encodes the current share URL or matching saved HashBin CID link.
- **Save to HashBin** uses the registered client (`app_e9546b2e-a415-4ec5-be14-611ea0692f56`) with return URL `https://slides.hashbin.page/`. CID downloads are verified against their content hash before opening.
- **Open** accepts Markdown, CSS, saved JSON documents, Slidev Online links, and HashBin CIDs. **Download** exports a ZIP (`slides.md` and `style.css`), individual files, a JSON document (preserving extension fields), or printable standalone HTML.

### Presenter view and printable HTML export

- **Presenter** (`presenter.html`) opens a second window on the editor origin with current and next slide previews in separate opaque sandboxes, text-only speaker notes, a presentation timer, and two-way sync over `BroadcastChannel('slidevonline:presenter')`.
- **Print / PDF** (also in **Download**) renders every visible slide in a disposable opaque sandbox into a self-contained, script-free HTML file (`slides.html` or `slides-with-notes.html`, `default-src 'none'` CSP, 32 MiB limit) with optional escaped speaker notes for browser printing or Save as PDF.

### Offline / PWA

- Ships `manifest.webmanifest`, icons, and a Fragment Kit service worker (`service-worker.js`) using the `slidevonline-` cache prefix.
- `src/offline.js` uses a 180 s offline install timeout (accommodating cold CDN caches across the full asset set) and mounts **More → Repair offline copy** and **More → Apply update**.
- Applying a waiting update flushes local drafts and updates the URL fragment before activating the new service worker so current edits are preserved when reloading.
- Every offline asset is hashed in `offline-assets.js`. Optional browser AI engines (`wllama-*`) are excluded from automatic offline downloads.

### AI editing

- **Ask AI**, **AI settings**, and **Compare models** load lazily on explicit user clicks.
- Supports paste handoff, provider connections (OpenAI, OpenRouter, Anthropic, Gemini), local loopback servers, optional browser models, spending caps, six-task model comparisons (`ai-suite.json`), and Undo.
- `https://slides.hashbin.page/` connects through the isolated AI host (`https://ai.hashbin.page/slides-v0.4.4/`). `https://curtcox.github.io/slidev/` and localhost servers use direct connections; unrecognized origins allow paste handoff only.
- **Check proposal** (`src/ai-check.js`) compiles every visible slide in a disposable opaque sandbox without executing author modules, reporting Vue/CSS errors before destroying the frame.
- Accepting a proposal pauses rendering, commits a `?run=0` URL, and leaves document extension fields outside prompts and unchanged. See [docs/ai.md](docs/ai.md).

### Bundled runtime capabilities

- **Themes (`runtime/theme-audit.json`):** `default`, `seriph`, `bricks`, and `shibainu` (`0.25.0`), plus `apple-basic` (`0.25.1`), all MIT-licensed. Includes all 45 theme layouts, artwork, and Bricks' `Polygon1`–`Polygon11` components. Unknown themes fall back to `default` with a notice. See [docs/themes.md](docs/themes.md).
- **Fonts (`runtime/fonts/audit.json`):** Nunito Sans, Fira Code, PT Serif, PT Mono, Signika Negative, Sigmar One, and Titillium Web (77 WOFF2 faces from Fontsource `5.3.0`, OFL-1.1) ship offline. Headmatter `fonts` options can load additional Google fonts inside the frame with `no-referrer` (not cached offline; 5 s timeout per stage; `coollabs` unavailable). See [docs/fonts.md](docs/fonts.md).
- **Icons (`runtime/icons/attribution.json`):** `carbon`, `ph`, `mdi`, `logos`, `simple-icons`, `twemoji`, and `svg-spinners` from pinned `@iconify/json` `2.2.553`, loaded on demand via the offline proxy and cached offline.
- **Syntax highlighting (`runtime/highlighting/`, `runtime/grammars/`):** Shiki `4.6.0` (MIT) loads lazily when slides contain code, with 40 bundled languages and aliases (`runtime/src/compiler/languages.json`), isolated TextMate registries per root language, ES2018 regex target, and a 500 ms line tokenization budget.
- **Math (`runtime/math/`):** KaTeX `0.19.1` (MIT) loads on demand with embedded WOFF2 font data URLs.
- **Diagrams (`runtime/diagrams/`):** Mermaid `12.3.0` (MIT) loads lazily with a serialized render queue and bounded SVG cache. PlantUML sends diagram text to `https://www.plantuml.com/plantuml` only after per-preview user consent (15 s timeout; see [docs/plantuml.md](docs/plantuml.md)).
- **Monaco (`runtime/monaco/`):** `monaco-editor` `0.57.0` (MIT) loads lazily for `{monaco}`, `{monaco-diff}`, and `{monaco-run}` with TypeScript ATA disabled (`monacoTypesSource = 'none'`). `{monaco-run}` transpiles TypeScript with `sucrase` and executes JS/TS (without module imports) via a `blob:` ESM import strictly inside the opaque sandbox. `{monaco-write}` is unavailable.
- **Transitions & drag:** Upstream CSS transitions (`fade`, `fade-out`, directional slides, custom `style.css` transitions) and native `transition: view-transition` (with fade fallback). `<VDrag>`, `<VDragArrow>`, and `v-drag` support move, resize, rotation, and keyboard controls with bounded Markdown writeback (`onSourceChange` / `getSource` / `onDragError`, up to 1,024 changed elements per render) without rerunning author code.

## Building and testing

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm -C online/runtime build
cd online
npm ci
npm run build
npm test
npm run check
npm run gallery:check
```

### Browser and runtime suites

Start the local static server in one terminal:

```sh
cd online
npm run serve
```

Run the Playwright contract suite and browser suites in another terminal (defaults to Chromium; pass `webkit` or `firefox`, or set `BROWSER=webkit` / `BROWSER=firefox` for compiler checks):

```sh
cd online
FRAGMENT_KIT_BASE_URL=http://127.0.0.1:8000/ npm run test:contracts
node tests/browser/all.cjs http://127.0.0.1:8000/ chromium
node tests/browser/gallery.cjs http://127.0.0.1:8000/ chromium
node tests/browser/editor.cjs http://127.0.0.1:8000/ chromium
node tests/browser/ai-check.cjs http://127.0.0.1:8000/ chromium
node tests/browser/ai.cjs http://127.0.0.1:8000/ chromium
node tests/browser/runtime.cjs http://127.0.0.1:8000/ chromium
node tests/browser/transitions.cjs http://127.0.0.1:8000/ chromium
node tests/browser/icons.cjs http://127.0.0.1:8000/ chromium
node tests/browser/languages.cjs http://127.0.0.1:8000/ chromium
node tests/browser/math.cjs http://127.0.0.1:8000/ chromium
node tests/browser/fonts.cjs http://127.0.0.1:8000/ chromium
node tests/browser/themes.cjs http://127.0.0.1:8000/ chromium
node tests/browser/diagrams.cjs http://127.0.0.1:8000/ chromium
node tests/browser/plant-uml.cjs http://127.0.0.1:8000/ chromium
node tests/browser/drag.cjs http://127.0.0.1:8000/ chromium
node runtime/tests/run.mjs
node runtime/tests/corpus.mjs
node runtime/tests/fidelity.mjs
```

- **Playwright contracts (`npm run test:contracts`):** Runs Fragment Kit contracts plus Slidev Online specs (`ai`, `diagnostics`, `document`, `export-html`, `monaco`, `navigation`, `offline-pwa`, `presenter`, `startup`). Publish, shortener, and AI provider checks use mocked services.
- **Characterization (`runtime/tests/run.mjs`):** Compares in-browser SFC transforms against CLI transforms across `demo/starter`, `demo/composable-vue`, all 15 online examples, 40 grammar probes, and Monaco blocks, plus documented fallback/error cases. Writes `runtime/.cache/characterization-<browser>.json`.
- **Corpus (`runtime/tests/corpus.mjs [url]`):** Mounts every visible slide from the real deck corpus through the staged preview bridge, checking click states, decoded HTTPS images (mocked SVGs), highlighting, diagrams, math, and expected file-import error recovery. Writes `runtime/.cache/corpus-<browser>.json`. Pass a deployed URL (e.g. `https://slides.hashbin.page/` or `https://curtcox.github.io/slidev/`) to verify a live origin.
- **Visual fidelity (`runtime/tests/fidelity.mjs`):** Blocking CI deployment gate comparing staged runtime renders against isolated `slidev build` references across all gallery examples, both demo decks, theme layouts, and font fixtures (0.1% pixel tolerance on supported slides; documented fallbacks recorded separately as diagnostic screenshots). Use `--demos-only` for a focused demo run and `--skip-reference-build` only when fixtures and CLI are unchanged. Reports go to `runtime/.cache/fidelity/`.
- **Startup performance (`runtime/tests/performance.mjs <url>`):** Measures five cold throttled phone-profile Chromium loads against a production URL with compressed delivery and writes `runtime/.cache/performance-chromium.json`.

## Docs and gallery

- **User docs:** Edit `docs/*.md`, then run `npm run docs` from `online/`. Generated `docs/*.html` files stay committed; `npm run check` rejects stale pages. Local links in Markdown rewrite to `.html`.
- **Gallery:** `examples/*.md` is the source of truth for the 15 example decks (headmatter supports `title`, `info`, and `onlineTags`). `?example=<id>` opens allowlisted local decks only. Browsing and filtering `gallery.html` never executes slide code.

After editing examples or changing any cover dependency listed in `gallery.config.mjs`, rebuild from `online/` (after `pnpm build`):

```sh
npm run docs
npm run examples
pnpm -C runtime build
npm run build
npm run gallery
npm run build
npm run check
npm run gallery:check
```

`npm run gallery` renders slide 1 of each example inside the real opaque preview in Chromium and updates `gallery/*.png` and `gallery/fingerprints.json`. Commit both alongside source changes.

## Release staging and deployment

- `node scripts/build.mjs --release` requires a clean committed checkout, stages `dist/`, writes `release.json` (`commit`, `dirty: false`), generates `offline-assets.js`, and adds `.nojekyll`.
- Pushing changes under `online/**` or `packages/**` to `main` triggers `.github/workflows/online-deploy.yml`, which runs all tests (`online-test.yml`, including the Chromium visual fidelity gate and `kit-check.yml@v2`) before deploying the GitHub Pages recovery origin.
- The canonical origin (`https://slides.hashbin.page/`) and its AI host (`https://ai.hashbin.page/slides-v0.4.4/`) are published from `curtcox/hashbin.org`.
