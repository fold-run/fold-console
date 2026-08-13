// End-to-end tests run against the BUILT bundle, served by `pnpm preview`.
//
// That server is the one that replays fold's exact response headers — the same
// CSP gateway/console.go sends — and mounts the app at /console/ so the
// "../api/…" resolution these tests depend on is the real one. Running against
// `pnpm dev` instead would test a page with hot-reload machinery in it and a
// policy nobody ships.
//
// The gateway itself is mocked per-test (tests/gateway.ts). What that trades
// away, and why, is documented there.
import { defineConfig, devices } from '@playwright/test'

// Kept in step with vite.config.ts via the same variable: 5173 is contended
// on any machine running more than one Vite project.
const PORT = Number(process.env.FOLD_CONSOLE_PORT ?? 5173)
const BASE = `http://localhost:${PORT}/console/`

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // A stray .only would silently shrink the suite to one test and still go
  // green, which is worse than a red build.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Chromium only. These assets are held to one policy and one rendering path;
  // a browser matrix would multiply CI time to re-test Preact's rendering
  // rather than anything this repo owns.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // Build first: the point is to test what fold would vendor, and a stale
    // dist/ would quietly test the previous commit.
    command: 'pnpm build && pnpm preview',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
