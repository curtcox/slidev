# Slidev Online

Write `slides.md` and `style.css` in the browser with the pinned Ace editors.
The preview uses the real Slidev client in an isolated frame with no access
to the editor page. Changes update the preview after a 500 ms pause.

Share links preserve Markdown, CSS, extension fields and the current slide.
The Share dialog can shorten links through is.gd using the kit's AllOrigins proxy.
QR codes use a saved CID when it still matches the editor. A CID is a
content identifier that the kit verifies against the saved bytes.
HashBin saving displays the registration message until the owner supplies a client ID.

Links take priority over browser drafts. Failed links keep the current work.
Use **More → Resume saved work** to recover a draft. Recovered drafts and file
imports wait for Render. A `?run=0` link also waits for Render, even after edits.
The Open dialog accepts Markdown, CSS, saved JSON documents and Slidev Online links.
Download offers a ZIP with `slides.md` and `style.css`, the two files separately,
or one JSON document that also preserves extension fields.
The Phase 3 kit contracts run against the Ace adapter with `npm run test:contracts`.
They cover links, sharing, QR upload/camera, HashBin callbacks, drafts and layout.
Publish and shortener checks use mocked services.

Phones and short windows use Slides, Markdown and CSS tabs. Desktop also has a
Split view with a divider that supports dragging and keyboard arrows.
Preview navigation follows the editor cursor. Slide navigation reveals its source.
Speaker notes appear as text. Present requests fullscreen from a click.
Overview lists the visible slides by title and supports keyboard selection.
On touchscreens, swipe left to advance or right to go back through click reveals.
Tap the left third of a slide to go back, or the rest to advance.
Buttons, links, inputs, code blocks and drag controls keep their own touch actions.

The shell uses native modules. Only `runtime/` is built with Vite. Vendored kit
bytes are immutable; use its vendor-sync tool to upgrade an exact release.
Deployment also requires the independent kit-check workflow to match the pin
against the published release manifest. A locally prepared copy alone cannot
pass that publication gate.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm -C online/runtime build
cd online
npm ci
npm run build
npm test
npm run check
npm run serve
# In another terminal; selects the kit's three browser engines by default.
npm run test:contracts
node tests/browser/all.cjs http://127.0.0.1:8000/ chromium
node tests/browser/editor.cjs http://127.0.0.1:8000/ chromium
node tests/browser/runtime.cjs http://127.0.0.1:8000/ chromium
node tests/browser/transitions.cjs http://127.0.0.1:8000/ chromium
node tests/browser/icons.cjs http://127.0.0.1:8000/ chromium
node tests/browser/languages.cjs http://127.0.0.1:8000/ chromium
node tests/browser/themes.cjs http://127.0.0.1:8000/ chromium
node tests/browser/math.cjs http://127.0.0.1:8000/ chromium
node tests/browser/diagrams.cjs http://127.0.0.1:8000/ chromium
node tests/browser/drag.cjs http://127.0.0.1:8000/ chromium
node runtime/tests/run.mjs
node runtime/tests/corpus.mjs
node runtime/tests/fidelity.mjs
# Repeat the compiler checks with BROWSER=webkit or BROWSER=firefox.
```

Release staging uses `node scripts/build.mjs --release`, which rejects a dirty
checkout and writes `release.json` with the exact commit and dirty state.
Every offline asset is hashed. Optional AI engines are excluded from automatic
offline downloads. The canonical host is unset; the shell uses the recovery URL
until a later phase registers and deploys the canonical origin.

The Phase 2 compiler reuses Slidev's Markdown plugin chain and pure layout
wrapper inside the opaque frame. Characterization includes the real starter,
composable-vue and all online example decks: 187 slide/title SFCs match CLI transforms exactly in both Chromium and WebKit,
including forty grammar probes, and 14 corpus cases assert documented errors or fallbacks
for file imports, Monaco, PlantUML and unavailable grammars. These fallback
cases are not exact-match claims. Reports go to
`runtime/.cache/characterization-<browser>.json`. Hidden/disabled slides follow
CLI numbering, while headmatter and source line ranges remain attached to the
original document. Vue's eval-dependent static-tree optimization is disabled
so large templates compile under the unchanged SDK frame CSP.

The corpus gate mounts every visible slide from the unchanged starter,
composable-vue and online example sources through the staged preview bridge.
It checks initial, final and restored click states, decoded HTTPS images,
highlighting, lazy diagrams, equations and visible fallbacks. The current corpus
has 84 visible slides. Eighty-two mount, and two report the expected file-import
errors. The gate checks recovery after each error. Three hidden slides stay
excluded. Demo-only components, unbundled icons and the unavailable Tweet widget
have explicit notice expectations. External images receive mock SVG bytes.
Other external traffic is blocked. Remote image requests send no referrer,
and PlantUML receives no request without consent. Reports go to
`runtime/.cache/corpus-<browser>.json`. CI runs the gate in all three engines
and attaches a report to its test artifact when the gate fails. This gate does
not compare screenshots. To test a deployment, pass its URL:

```sh
node runtime/tests/corpus.mjs https://curtcox.github.io/slidev/
```

The report hashes the runtime bytes served by that URL and records the browser
version, source hashes, per-slide outcomes and image counts.

To measure the welcome deck's cold startup against the Phase 2 phone profile:

```sh
node runtime/tests/performance.mjs https://curtcox.github.io/slidev/
```

The performance report records five throttled Chromium samples, the served
release and runtime hash, response encoding and size, and both budget results
in `runtime/.cache/performance-chromium.json`. Use a production URL for a
measurement with compressed delivery.

The runtime browser suite exercises author scripts, style isolation, slots,
click navigation, hostile-deck isolation, document replacement, built-ins,
TOC navigation, motion, markers and visible unsupported features. Full source-
corpus screenshots record known feature fallbacks separately. The visual job is
a blocking deployment gate: supported slides must meet the existing 0.1% pixel
tolerance, and file imports must fail visibly. The phone performance target
remains open.

The official `default`, `seriph`, `bricks` and `shibainu` themes are pinned at
0.25.0; `apple-basic` is pinned at 0.25.1. All five use the MIT license.
All 45 theme layouts, styles, config defaults, artwork and the eleven Bricks
polygon components are bundled. Layout CSS is activated only for its theme,
without changing selector specificity. Font utilities follow the active deck
configuration. Artwork stays self-contained inside the opaque frame. Unknown themes fall back
to default with a visible notice. Builds audit versions, license and source size,
and ship unchanged licenses plus `runtime/theme-audit.json` offline. Nunito Sans,
Fira Code, PT Serif, PT Mono, Signika Negative, Sigmar One and Titillium Web ship as separate self-contained stylesheets from
pinned Fontsource 5.3.0 packages (OFL-1.1). All 77 faces retain their original
WOFF2 bytes and available Unicode subsets. Builds audit versions, licenses,
hashes and size. Original licenses and attribution ship at `runtime/fonts/`.
The SDK delivers these styles into the opaque frame through its offline proxy.
Navigation reuses the styles. Replacing the document discards its font set.

Headmatter font configuration follows the parser's resolution of `sans`, `serif`,
`mono`, `custom`, `local`, `webfonts`, weights, italics and disabled providers.
Additional Google fonts load in the frame through a stylesheet link with no
referrer. Only Google stylesheet and font hosts are added to the page CSP.
No script, connection or frame permissions change. Custom remote fonts are not
cached by the app for offline use. Unavailable fonts, invalid configurations and
the unsupported coollabs provider produce visible notices with local/system
fallbacks. Each font-loading stage has a five-second deadline.
See [fonts and privacy](docs/fonts.html). The phone performance target remains open.
See [bundled themes](docs/themes.html).
The offline browser suite also renders a seriph fact slide after a fully
offline reload, checking that theme-specific styles survive cached delivery.

The runtime fidelity harness compares the staged bundle through the editor
bridge with `slidev build` on a separate origin. It checks the unmodified
gallery examples, both demo decks, twenty fixtures in default and seriph, all 33 additional
theme layouts and five font fixtures. Coverage includes Markdown, columns,
scoped styles, code, built-in components, TOC, icons, lazy syntax languages,
math, Mermaid, positioned drag
elements, named slots, theme artwork and initial click states. Font fixtures
supply identical pinned bytes to both clients and require the used webfonts to
load; Apple Basic retains its local/system font stack. Color-only image props
disable CLI image preloading. Reports and CLI/online/diff PNGs go to
`runtime/.cache/fidelity/`, separated by browser. Use `--skip-reference-build`
only when the fixtures and CLI are unchanged; `BROWSER=webkit` selects WebKit.
CI uploads a nonblocking Chromium report while the expanded coverage stabilizes.

The starter and composable-vue references build from their original entries.
Each reference runs in a separate process because the CLI caches its project
root. Their components, snippets and setup files remain available to the CLI.
Online receives the exact original Markdown. Both clients receive identical
mock SVGs for remote images. The CLI preloads the optional HTML grammar for
Markdown code fences. This prevents build order from changing their colors.
Its tokenization cutoff is disabled for repeatable comparisons.

The report captures every renderable demo slide, including known fallbacks.
It names differences for filesystem components, unbundled icons, Monaco,
PlantUML consent and the TOC title from an imported slide. These screenshots
are diagnostic comparisons. They do not count as CLI pixel parity.
Every other slide retains the 0.1% pixel tolerance. The two unsupported file
imports must produce their exact documented errors and terminate the frame.
The harness then checks that rendering recovers on the following slide.
Deck-level warnings outside the slide are verified before capture and hidden
from slide-only screenshots. Inline fallback content stays visible.
Reports include source paths, source hashes, counts and the runtime hash.

For a focused demo run, use `node runtime/tests/fidelity.mjs --demos-only`.
Add `--skip-reference-build` only when those reference inputs remain unchanged.

The bundled navigation adapter provides slide aliases, counters, links, the
upstream table of contents, slide-enter/leave hooks, conditional rendering,
in-memory dark mode, magic-move click steps, motion and inline markers. No navigation or color state
uses opaque-origin storage. `runtime/virtual-modules.json` is the single source
for Vite aliases; both runtime builds and static checks scan all client TS/Vue
imports and fail if a new `#slidev/*` module lacks an implementation. Empty setup
lists reflect the online format's lack of filesystem setup directories; Monaco
remains a static-code fallback until Phase 7.

Slide changes use the upstream CSS transitions and direction resolver. Deck and
per-slide configuration support fade, fade-out, directional slides, paired names,
object options and custom transitions from `style.css`. An explicit `none`
disables animation. The first render does not animate. Departing slides retain
their styles until their animation ends. Click changes on the current slide
preserve author state and do not rerun its script. A new document still gets a
fresh opaque frame. `transition: view-transition` uses the browser's View
Transition API inside that frame. Set the same `view-transition-name` on one
element in each slide to animate between them. Browsers without the API show
a notice and use fade.

Icons from carbon, ph, mdi, logos, simple-icons, twemoji and svg-spinners are
bundled as separate JSON assets from pinned `@iconify/json` 2.2.553. Collections
load on demand through the SDK's offline fetch proxy, once per frame. Kebab
tags such as `<carbon-arrow-right />`, colon tags inside HTML blocks, and
`~icons/carbon/arrow-right` imports work, including aliases and TOC titles.
Missing icons show a placeholder and a text notice; unknown collections never
trigger network requests. Original collection attribution/license metadata is
shipped at `runtime/icons/attribution.json` and in each unchanged collection.
All seven collections total about 33.4 MB before compression (8.74 MB gzip),
separate from the initial runtime payload. They are included in offline caching.

Forty syntax languages and their upstream aliases are listed in
`runtime/src/compiler/languages.json`. Grammar data from Shiki 4.6.0 loads only
when code is highlighted, through the SDK's verified offline proxy. Bundles
include embedded dependencies (including Markdown's optional HTML grammar).
Each root language has an isolated TextMate registry so Vue injections cannot
change previously compiled Markdown. The registry cache is bounded by the
curated catalog. The unchanged package license, version, dependency lists,
byte counts and hashes ship at `runtime/grammars/` and are cached offline.
Unknown or unavailable languages show readable plain code and a visible notice.
The runtime pins the JavaScript regex target to ES2018 for consistent browser
support; characterization disables Shiki's elapsed-time cutoff in both test compilers to
compare complete output under CI load. Product renders retain the CLI's default
500 ms line budget.

The pinned KaTeX 0.19.1 module loads when compiling a slide or slide title that
may contain math. Rendered equations load a stylesheet with all twenty WOFF2
fonts embedded as data URLs for the opaque frame. The original module and font
bytes, MIT license and build audit ship under `runtime/math/` and are cached
offline. Equation click ranges use the upstream wrapper and highlighting
rules. Failed delivery produces a visible error or notice.

Mermaid 12.3.0 is a separate standalone module, imported through the SDK only
when the upstream Mermaid component renders a diagram. The build rejects
external module imports and audits the version, MIT license and payload size.
The module, unchanged license and hash metadata ship under `runtime/diagrams/`
and are cached offline. A serial queue keeps Mermaid's global configuration
from crossing between diagrams. Its SVG cache is bounded by count and bytes.
The upstream component retains scale, per-diagram themes, dark mode, shadow
styles and visible errors. Missing module bytes fail visibly and a later
render can retry. Flowcharts, sequence diagrams and pie charts pass integration
checks in Chromium and WebKit; the full diagram catalog is not yet verified.

The runtime supports `<VDrag>`, `<VDragArrow>` and `v-drag` with the upstream
move, resize, rotation and keyboard controls. Drag state stays in memory;
positions survive slide navigation and account for frame scale and slide zoom.
Initial layout does not modify source, and writeback does not rerun author code.
Named positions use up to 128 letters, numbers, underscores or hyphens.

The parent bridge accepts `onSourceChange(src, patch)`, `getSource()` and
`onDragError(message)` callbacks for the future editor. A separate parse-only
bundle at `runtime/editor/document.js` validates bounded position messages and
rebuilds edits against the original render snapshot. This preserves repeated
inline element offsets, notes, scripts, frontmatter comments and CRLF/BOM.
Named positions update YAML, including empty, missing and fenced blocks.
Manual Markdown changes require Render before further writeback. A render can
retain up to 1,024 changed elements. The editor uses these callbacks to update Markdown after a drag without rerunning
author code. Separate browser tests also exercise the bridge with a textarea host.

The local Vite drag adapter checks its upstream transformation anchors at build
time. Builds also reject client storage-state modules without an opaque-origin
adapter. The two upstream Markdown fixes for PascalCase and repeated/nested
drag sources have their own separately committed regression tests.

## Docs and gallery

Edit `docs/*.md`, then run `npm run docs` from `online/`. Generated HTML stays
committed. Static checks reject stale pages. Local documentation links point
to the generated HTML.

The gallery uses the unchanged Fragment Kit gallery and 15 local example decks.
`examples/*.md` is the source of truth. Each deck can set `title`, `info` and
`onlineTags` in its headmatter. The generated catalog contains the exact source
bytes, so a gallery link carries its own document. `?example=<id>` also opens
an allowlisted local deck. Unknown IDs cannot turn into arbitrary fetches.
Browsing and filtering the gallery does not execute any slide code.

After editing examples or changing a cover dependency, run these commands from
`online/` after building the workspace packages:

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

Cover generation starts a temporary local server and renders each deck's first
slide through the real opaque preview in Chromium. Commit `gallery/*.png` and
`gallery/fingerprints.json` with the sources. The fingerprints include the
catalog, renderer, bridge, SDK and every built runtime asset. CI checks these
hashes without comparing screenshots from different operating systems. The
separate visual suite compares every visible example slide with the CLI and
waits for its Mermaid diagrams before capture.

`tests/browser/gallery.cjs` checks covers, filters, served-origin links, sandbox
isolation, script interaction, deferred rendering, documentation links and a
360 px layout. The offline suite opens the cached gallery and interacts with
an example after disconnecting.
