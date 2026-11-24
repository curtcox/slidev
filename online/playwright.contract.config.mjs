import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

process.env.FRAGMENT_KIT_CONTRACT_CONFIG = fileURLToPath(new URL('./testing-contract.config.mjs', import.meta.url))
process.env.BROWSERS ??= process.env.BROWSER ?? 'chromium,firefox,webkit'
process.env.MOBILE ??= 'false'
const { default: kit } = await import('./vendor/fragment-kit-v0.4.4/testing/playwright.config.js')
const external = process.env.FRAGMENT_KIT_BASE_URL
export default defineConfig({
  ...kit,
  testDir: '.',
  testIgnore: ['**/dist/**', '**/node_modules/**'],
  testMatch: [
    '**/testing/contract/{url-identity,sharing,qr-roundtrip,hashbin-callback,draft-recovery,mobile-layout,offline}.spec.js',
    '**/tests/contracts/*.spec.js',
  ],
  use: { ...kit.use, baseURL: external ?? 'http://127.0.0.1:8000/' },
  webServer: external
    ? undefined
    : {
        command: 'npm run serve',
        url: 'http://127.0.0.1:8000/',
        reuseExistingServer: !process.env.CI,
      },
})
