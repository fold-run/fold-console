// The console's belief about /api/federation, measured against a real gateway.
//
// Every other test in this repo runs against tests/gateway.ts, which is this
// repo's own fixture: it can only ever confirm that the console agrees with
// itself. This file is the one that can be wrong, because the thing it talks
// to is fold.
//
// It runs only when FOLD_GATEWAY_URL points at a live gateway, so a normal
// `pnpm test:e2e` on a laptop does not need Go. CI supplies it — see the
// `contract` job, which pins a released fold and bumps deliberately, the
// mirror image of fold pinning this repo by commit.
import { expect, test } from '@playwright/test'
import { checkAuthHint, checkFederation } from '../src/lib/contract'

const GATEWAY = process.env.FOLD_GATEWAY_URL

test.describe('gateway contract', () => {
  test.skip(!GATEWAY, 'set FOLD_GATEWAY_URL to run against a live fold gateway')

  test('/api/federation carries every field this console reads', async ({ request }) => {
    const res = await request.get(`${GATEWAY}/api/federation`)
    expect(res.status(), 'the gateway should serve the federation snapshot').toBe(200)

    const report = checkFederation(await res.json())

    // Fields fold has and the console does not are expected: fold adds
    // surfaces in minor releases and this repo is allowed to lag. Worth
    // printing, because each is something an operator can see in curl and not
    // in the console.
    if (report.unknown.length) {
      console.log(`gateway reports fields this console ignores:\n  ${report.unknown.join('\n  ')}`)
    }

    expect(report.breaks, breakMessage(report.breaks)).toEqual([])
  })

  test('/api/auth-hint carries every field the sign-in flow reads', async ({ request }) => {
    const res = await request.get(`${GATEWAY}/api/auth-hint`)
    expect(res.status()).toBe(200)

    const report = checkAuthHint(await res.json())
    if (report.unknown.length) {
      console.log(`auth-hint reports fields this console ignores:\n  ${report.unknown.join('\n  ')}`)
    }
    expect(report.breaks, breakMessage(report.breaks)).toEqual([])
  })

  test('the endpoints are where the console looks for them', async ({ request }) => {
    // The paths moved once already, at fold v1.9. Asserting them against a
    // live gateway is cheaper than discovering the next rename from a blank
    // dashboard, and it is the half of the check fold's own grep cannot do.
    for (const path of ['/api/federation', '/api/auth-hint']) {
      const res = await request.get(`${GATEWAY}${path}`)
      expect(res.status(), `${path} should exist on this gateway`).toBe(200)
    }
  })

  test('CI is testing the pinned release, not a build from source', async ({ request }) => {
    // A wiring assertion, not a version one, and only meaningful in CI: a
    // gateway built from source reports "dev", so reading that in CI means the
    // job is not testing the release it claims to. Locally, running against
    // `go run ./cmd/fold` is the normal case and must not be red.
    test.skip(!process.env.CI, 'only meaningful against the pinned release CI installs')

    const res = await request.get(`${GATEWAY}/api/federation`)
    const state = (await res.json()) as { version?: string }
    // goreleaser passes the git tag through verbatim, so this is "v1.10.0" and
    // not "1.10.0". The prefix is optional here because a gateway built any
    // other way may omit it, and src/lib/version.ts parses both.
    expect(state.version, 'the pinned release should report a real version').toMatch(/^v?\d+\.\d+/)
  })
})

function breakMessage(breaks: string[]): string {
  if (!breaks.length) return ''
  return [
    'The gateway no longer matches what this console reads.',
    '',
    ...breaks.map((b) => `  - ${b}`),
    '',
    'Fix src/lib/federation.ts and src/lib/contract.ts together, and check',
    'whether the surface that reads the field needs a version gate in',
    'src/lib/version.ts rather than an unconditional render.',
  ].join('\n')
}
