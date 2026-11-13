# Slidev Online scaffold

Phase 1 mounts a fixed welcome deck using the real Slidev client inside the
published SDK's opaque DOM frame. Authoring and the full browser compiler are
tracked in Plan 026; this scaffold does not expose editing or sharing yet.

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
```

Release staging uses `node scripts/build.mjs --release`, which rejects a dirty
checkout and writes `release.json` with the exact commit and dirty state.
Every offline asset is hashed. Optional AI engines are excluded from automatic
offline downloads. The canonical host is unset; the shell uses the recovery URL
until a later phase registers and deploys the canonical origin.
