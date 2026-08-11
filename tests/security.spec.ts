// The invariants this console is actually held to.
//
// CI's greps approximate these from the source side: no `dangerouslySetInnerHTML`,
// no inline <script>, no `style={{}}`. None of that proves the running page is
// safe — only that the two shapes we thought of are absent. These tests
// exercise the real thing, against the real bundle, under fold's real CSP
// (`pnpm preview` replays it byte-for-byte from gateway/console.go).
import { expect, test } from '@playwright/test'
import { collectCspViolations, federation, mockGateway } from './gateway'

test.describe('untrusted upstream strings', () => {
  // Tool names, descriptions, errors and labels arrive from federated servers
  // that fold does not control. They are rendered next to a page holding a
  // live Bearer token, on the gateway's own origin, so a rendering bug here is
  // token theft rather than a cosmetic glitch.
  const XSS = '<img src=x onerror="window.__pwned=1">'

  test('a hostile tool name and description render as text', async ({ page }) => {
    await mockGateway(page, {
      mcp: {
        tools: [
          { name: `github__${XSS}`, description: `describes ${XSS}` },
          { name: 'github__safe', description: 'ordinary' },
        ],
      },
    })
    await page.goto('#/catalog')
    await page.getByRole('button', { name: 'Connect & list' }).click()

    await expect(page.getByText(XSS, { exact: false }).first()).toBeVisible()
    // The payload must be inert: no element parsed out of it, no side effect.
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  })

  test('a hostile upstream id, error and label render as text', async ({ page }) => {
    await mockGateway(page, {
      federation: federation({
        upstreams: [
          {
            id: XSS,
            namespace: 'evil',
            connected: false,
            breaker: 'open',
            error: `failed: ${XSS}`,
            labels: { [XSS]: XSS },
            owner: { org: XSS },
          },
        ],
      }),
    })
    await page.goto('#/upstreams')

    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()

    // And again on the detail route, which renders the same strings through
    // different components, including the raw-record pane.
    await page.goto(`#/upstreams/${encodeURIComponent(XSS)}`)
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  })

  test('a hostile tool result renders as text', async ({ page }) => {
    await mockGateway(page, { mcp: { callResult: { content: [{ type: 'text', text: XSS }] } } })
    await page.goto('#/test')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByLabel('Tool')).toBeEnabled()
    await page.getByRole('button', { name: 'Call tool' }).click()

    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  })
})

test.describe('the token', () => {
  test('never reaches storage, and a reload signs you out', async ({ page }) => {
    // The trade this console makes deliberately: no persistence, because a
    // credential that opens the whole federation must not sit somewhere every
    // script on the origin can read.
    await mockGateway(page, { federation: federation({ authRequired: true }) })
    await page.goto('./')

    const secret = 'tok_deadbeefcafe'
    await page.getByLabel('Bearer token').fill(secret)
    await page.getByLabel('Bearer token').press('Enter')

    const stored = await page.evaluate(() => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      cookie: document.cookie,
    }))
    expect(stored.local).not.toContain(secret)
    expect(stored.session).not.toContain(secret)
    expect(stored.cookie).not.toContain(secret)

    await page.reload()
    await expect(page.getByLabel('Bearer token')).toHaveValue('')
  })

  test('is sent as a Bearer header once given, to the API and to /mcp', async ({ page }) => {
    const received = await mockGateway(page, { federation: federation({ authRequired: true }) })
    await page.goto('./')
    // The anonymous read happens first and must carry no credential.
    await expect.poll(() => received.federationAuth.length).toBeGreaterThan(0)
    expect(received.federationAuth[0]).toBe('')

    await page.getByLabel('Bearer token').fill('tok_abc')
    await page.getByLabel('Bearer token').press('Enter')
    await expect.poll(() => received.federationAuth).toContain('Bearer tok_abc')

    // And the MCP client shares the same credential — it is one identity, not
    // two.
    await page.goto('#/catalog')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect.poll(() => received.mcpAuth).toContain('Bearer tok_abc')
  })
})

test.describe('gateway refusals', () => {
  test('401 explains the remedy and stops polling', async ({ page }) => {
    // Retrying an unauthorized read every 15 s only mints 401 audit events.
    await mockGateway(page, { federationStatus: 401, federation: federation({ authRequired: true }) })

    let calls = 0
    page.on('request', (r) => {
      if (r.url().includes('/api/federation')) calls++
    })

    await page.goto('./')
    await expect(page.getByRole('alert')).toContainText('Unauthorized')
    await expect(page.getByText('No federation snapshot')).toBeVisible()

    const afterFirst = calls
    await page.waitForTimeout(4000)
    // TanStack Query retries a transient failure once; what must not happen is
    // an unbounded poll against a terminal answer.
    expect(calls - afterFirst).toBeLessThanOrEqual(1)
  })

  test('403 names the config key that actually exists', async ({ page }) => {
    // fold parses config with DisallowUnknownFields, so an operator who
    // follows a stale hint writes a config that refuses to start.
    await mockGateway(page, { federationStatus: 403, federation: federation({ authRequired: true }) })
    await page.goto('./')

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('server.introspection.groups')
    await expect(alert).not.toContainText('server.console.groups')
  })
})

test.describe('version skew', () => {
  test('a gateway older than the minimum says so', async ({ page }) => {
    await mockGateway(page, { federation: federation({ version: 'v1.8.2', consoleSource: undefined }) })
    await page.goto('./')
    await expect(page.getByRole('alert')).toContainText('needs fold 1.9.0 or newer')
  })

  test('a current gateway says nothing', async ({ page }) => {
    await mockGateway(page, { federation: federation({ version: 'v1.9.0' }) })
    await page.goto('./')
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('a version without the v prefix parses the same', async ({ page }) => {
    // Released gateways carry the tag verbatim, so the prefix is always there
    // in practice; a gateway built another way may not have it, and the gate
    // must not silently pass everything just because the string looks odd.
    await mockGateway(page, { federation: federation({ version: '1.8.2', consoleSource: undefined }) })
    await page.goto('./')
    await expect(page.getByRole('alert')).toContainText('needs fold 1.9.0 or newer')
  })

  test('a development build is not treated as stale', async ({ page }) => {
    // Someone running a build off main is the person who most needs to see new
    // surfaces; hiding them would make every local session look like a
    // regression.
    await mockGateway(page, { federation: federation({ version: 'dev' }) })
    await page.goto('./')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('console build')).toBeVisible()
  })
})

test('a full walk of the app raises no CSP violation', async ({ page }) => {
  // The preview server sends fold's exact policy, so a violation here is a
  // violation in a shipped binary. This is the only check that exercises the
  // CSP rather than reasoning about it: an inline style injected by a
  // dependency at runtime is invisible to every grep in CI.
  const violations = await collectCspViolations(page)
  await mockGateway(page)

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()

  await page.goto('#/upstreams')
  await page.locator('tbody').getByRole('link', { name: 'github', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Endpoints' })).toBeVisible()

  await page.goto('#/catalog')
  await page.getByRole('button', { name: 'Connect & list' }).click()
  await expect(page.getByRole('link', { name: 'create_issue' })).toBeVisible()

  // Already connected from the catalog — the session is held above the router,
  // so this route offers "Reconnect" rather than "Connect & list".
  await page.goto('#/test')
  await expect(page.getByLabel('Tool')).toBeEnabled()
  await page.getByRole('button', { name: 'Call tool' }).click()
  await expect(page.getByRole('region', { name: 'Result' })).toContainText('called github__create_issue')

  expect(violations).toEqual([])
})

test('every asset the page loads is same-origin', async ({ page }) => {
  // A CDN font or script fails silently inside a shipped binary, where it is
  // expensive to discover. CI greps the bundle for external URLs; this checks
  // what the browser actually requested, which also covers anything assembled
  // at runtime.
  await mockGateway(page)
  // A literal origin, not page.url(): before the first navigation that is
  // about:blank, whose origin is "null", and every request then looks foreign.
  const ORIGIN = 'http://localhost:5173'
  const foreign: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.protocol !== 'data:' && u.origin !== ORIGIN) foreign.push(r.url())
  })

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
  await page.goto('#/upstreams')
  await expect(page.locator('tbody').getByRole('link', { name: 'github', exact: true })).toBeVisible()

  expect(foreign).toEqual([])
})
