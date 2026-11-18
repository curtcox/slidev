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
# Repeat the compiler checks with BROWSER=webkit or BROWSER=firefox.
```

Release staging uses `node scripts/build.mjs --release`, which rejects a dirty
checkout and writes `release.json` with the exact commit and dirty state.
Every offline asset is hashed. Optional AI engines are excluded from automatic
offline downloads. The canonical host is unset; the shell uses the recovery URL
until a later phase registers and deploys the canonical origin.

The Phase 2 compiler reuses Slidev's Markdown plugin chain and pure layout
wrapper inside the opaque frame. Its browser characterization compares seven
generated SFCs with the real CLI transforms and checks unsupported features,
UTF-8 limits and incremental caching. The complete starter/composable fixture
matrix and full-runtime fidelity/budget gates remain open. The runtime browser
suite exercises author scripts, style isolation, slots, click navigation,
hostile-deck isolation, document replacement and visible unsupported features.

Official `default` and `seriph` themes are pinned at 0.25.0 (MIT), including all
six theme layouts, theme styles and config defaults. Unknown themes fall back
to default with a visible notice. Builds audit versions, license and source size,
and ship unchanged licenses plus `runtime/theme-audit.json` offline. Theme fonts
currently use local/system fallbacks; remote font loading remains open along
with the other proposed themes and the complete-runtime fidelity gate.
