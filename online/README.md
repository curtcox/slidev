# Slidev Online scaffold

The welcome deck is compiled in the browser and mounted using the real Slidev
client inside the published SDK's opaque DOM frame. Phase 2 adds the rendering
bridge, bundled module registry, click navigation, scoped styles and UnoCSS.
The shell does not expose editing or sharing yet.

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
node tests/browser/all.cjs http://127.0.0.1:8000/ chromium
node tests/browser/runtime.cjs http://127.0.0.1:8000/ chromium
node runtime/tests/run.mjs
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
composable-vue and all online example decks: 50 slide/title SFCs match CLI
transforms exactly, and 21 corpus cases assert documented errors or fallbacks
for file imports, Monaco, PlantUML and unavailable grammars. These fallback
cases are not exact-match claims. Reports go to
`runtime/.cache/characterization-<browser>.json`. Hidden/disabled slides follow
CLI numbering, while headmatter and source line ranges remain attached to the
original document. Vue's eval-dependent static-tree optimization is disabled
so large templates compile under the unchanged SDK frame CSP.

The runtime browser suite exercises author scripts, style isolation, slots,
click navigation, hostile-deck isolation, document replacement, built-ins,
TOC navigation, motion, markers and visible unsupported features. Full source-
corpus rendering, visual fidelity and phone performance gates remain open.

Official `default` and `seriph` themes are pinned at 0.25.0 (MIT), including all
six theme layouts, theme styles and config defaults. Unknown themes fall back
to default with a visible notice. Builds audit versions, license and source size,
and ship unchanged licenses plus `runtime/theme-audit.json` offline. Theme fonts
currently use local/system fallbacks; remote font loading remains open along
with the other proposed themes and the complete-runtime fidelity gate.
The offline browser suite also renders a seriph fact slide after a fully
offline reload, checking that theme-specific styles survive cached delivery.

The runtime fidelity harness compares the actual staged bundle through the
editor bridge with `slidev build` on a separate origin. Twelve deterministic
fixtures in both themes cover the six theme layouts, Markdown, columns, scoped
styles, code, built-in components, TOC and initial click states. Reports and CLI/online/diff PNGs go to
`runtime/.cache/fidelity/`, with screenshots separated by browser. Use `--skip-reference-build` only when the fixtures
and CLI are unchanged; `BROWSER=webkit` selects WebKit. CI uploads a nonblocking
Chromium report while platform/font coverage stabilizes. This is a subset of
the eventual full example-corpus gate and does not measure phone performance.

The bundled navigation adapter provides slide aliases, counters, links, the
upstream table of contents, slide-enter/leave hooks, conditional rendering,
in-memory dark mode, magic-move click steps, motion and inline markers. No navigation or color state
uses opaque-origin storage. `runtime/virtual-modules.json` is the single source
for Vite aliases; both runtime builds and static checks scan all client TS/Vue
imports and fail if a new `#slidev/*` module lacks an implementation. Empty setup
lists reflect the online format's lack of filesystem setup directories; Monaco
remains a static-code fallback until Phase 7.
