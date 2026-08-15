// The contract suite talks to a gateway, not to the console, so it needs no
// build and no preview server. Its own config keeps `pnpm test:contract` down
// to the two HTTP calls it actually makes.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Both suites that talk to something outside this repo: the gateway, and
  // the documentation site. Neither belongs in the e2e run, which must stay
  // answerable to the code in the pull request.
  testMatch: /(contract|docs-links)\.spec\.ts/,
  forbidOnly: !!process.env.CI,
  // No retry. A contract either holds or it does not; retrying a shape
  // mismatch just takes longer to tell you the same thing.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
})
