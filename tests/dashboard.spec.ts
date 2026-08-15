// The read paths: overview, the upstream list, and one upstream in full.
//
// The bias here is towards things a unit test cannot see — that a deep link
// survives a cold load, that filter state is really in the URL, that a card
// for an absent field is absent rather than blank.
import { expect, test, type Page } from '@playwright/test'
import { federation, mockGateway } from './gateway'

// Scoped to the table body: the footer carries a "GitHub" project link, and an
// unscoped by-name lookup matches both.
const upstreamLink = (page: Page, id: string) =>
  page.locator('tbody').getByRole('link', { name: id, exact: true })

test.describe('overview', () => {
  test('renders the gateway snapshot, grouped', async ({ page }) => {
    await mockGateway(page)
    await page.goto('./')

    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
    for (const group of ['Gateway', 'Federation', 'Governance', 'Observability']) {
      await expect(page.getByRole('heading', { name: group, level: 2 })).toBeVisible()
    }

    await expect(page.getByText('2 static + 0 discovered')).toBeVisible()
    await expect(page.getByText('deny, 3 rule(s)')).toBeVisible()
    // One of two upstreams is down, so this must not read as healthy.
    await expect(page.getByText('1 / 2')).toBeVisible()
  })

  test('omits cards for facts the gateway does not report', async ({ page }) => {
    // No tenancy, no discovery, no rate limit: those cards should not exist at
    // all. A row of em dashes would be the failure this guards against.
    await mockGateway(page, { federation: federation() })
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Your tenant' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Discovery' })).toHaveCount(0)
    await expect(page.getByText('rate limit')).toHaveCount(0)
  })

  test('shows tenancy and discovery when they are reported', async ({ page }) => {
    await mockGateway(page, {
      federation: federation({
        tenant: 'acme',
        tenantRequestsPerMinute: 600,
        tenantUpstreamCalls: 10_000,
        tenantBudgetPeriod: 'day',
        globalRequestsPerMinute: 1200,
        discovery: {
          url: 'https://registry.internal/servers.json',
          intervalMs: 60_000,
          lastOutcome: 'applied',
          lastSyncAt: '2026-08-11T12:00:00Z',
        },
      }),
    })
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Your tenant' })).toBeVisible()
    await expect(page.getByText('acme')).toBeVisible()
    await expect(page.getByText('10000 calls/day')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Discovery' })).toBeVisible()
    await expect(page.getByText('60 s')).toBeVisible()
  })
})

test.describe('upstreams', () => {
  test.beforeEach(async ({ page }) => {
    await mockGateway(page)
  })

  test('lists every upstream with its status', async ({ page }) => {
    await page.goto('#/upstreams')
    await expect(upstreamLink(page, 'github')).toBeVisible()
    await expect(upstreamLink(page, 'payments')).toBeVisible()
    await expect(page.getByText('2 of 2')).toBeVisible()
    // The unreachable one shows its error where latency would be.
    await expect(page.getByText('unreachable — details in gateway logs')).toBeVisible()
  })

  test('filter narrows the list and lands in the URL', async ({ page }) => {
    await page.goto('#/upstreams')
    await page.getByLabel('Filter upstreams').fill('payments')

    await expect(upstreamLink(page, 'payments')).toBeVisible()
    await expect(upstreamLink(page, 'github')).toHaveCount(0)
    await expect(page.getByText('1 of 2')).toBeVisible()
    await expect(page).toHaveURL(/q=payments/)
  })

  test('a filtered URL reconstructs the view on a cold load', async ({ page }) => {
    // The whole point of putting filter state in the URL: someone else opens
    // the link and sees what you saw.
    await page.goto('#/upstreams?status=disconnected')
    await expect(upstreamLink(page, 'payments')).toBeVisible()
    await expect(upstreamLink(page, 'github')).toHaveCount(0)
    await expect(page.getByLabel('Connection status')).toHaveValue('disconnected')
  })

  test('a filter matching nothing offers a way out', async ({ page }) => {
    await page.goto('#/upstreams?q=nosuchupstream')
    await expect(page.getByText('No upstream matches this filter')).toBeVisible()
    await page.getByRole('button', { name: 'Clear the filter' }).click()
    await expect(upstreamLink(page, 'github')).toBeVisible()
  })

  test('an empty federation reads as configuration, not as an outage', async ({ page }) => {
    await mockGateway(page, {
      federation: federation({ upstreams: [], staticUpstreams: 0, discoveredUpstreams: 0 }),
    })
    await page.goto('#/upstreams')
    await expect(page.getByText('No upstreams in the federation')).toBeVisible()
  })

  test('sorting is a link, and reverses on a second click', async ({ page }) => {
    await page.goto('#/upstreams')
    await page.getByRole('button', { name: /^Upstream/ }).click()
    await expect(page).toHaveURL(/sort=id.*dir=asc|dir=asc.*sort=id/)

    const asc = await page.locator('tbody tr td:first-child').allInnerTexts()
    expect(asc).toEqual(['github', 'payments'])

    await page.getByRole('button', { name: /^Upstream/ }).click()
    await expect(page).toHaveURL(/dir=desc/)
    const desc = await page.locator('tbody tr td:first-child').allInnerTexts()
    expect(desc).toEqual(['payments', 'github'])
  })
})

test.describe('upstream detail', () => {
  test('a deep link renders on a cold load', async ({ page }) => {
    // Hash routing exists because fold's file server has no SPA fallback. This
    // is the test for that decision: a fresh navigation straight to a nested
    // route, no client-side history to lean on.
    await mockGateway(page)
    await page.goto('#/upstreams/github')

    await expect(page.getByRole('heading', { name: 'github', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Endpoints' })).toBeVisible()
    const ownership = page.getByRole('region', { name: 'Ownership' })
    await expect(ownership.getByText('platform / dx')).toBeVisible()
    // owner.contact has always been in fold's API and was never rendered.
    await expect(ownership.getByText('dx@example.internal')).toBeVisible()
    await expect(page.getByText('tier=gold')).toBeVisible()
  })

  test('per-endpoint health is broken out', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/upstreams/github')
    await expect(page.getByText('healthy', { exact: true })).toBeVisible()
    await expect(page.getByText('unhealthy', { exact: true })).toBeVisible()
  })

  test('an upstream with one endpoint says so instead of showing an empty table', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/upstreams/payments')
    await expect(page.getByText('Single endpoint')).toBeVisible()
  })

  test('an unknown id explains itself and offers the way back', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/upstreams/ghost')
    await expect(page.getByText(/No upstream "ghost" in this federation/)).toBeVisible()
    await page.getByRole('link', { name: 'Back to upstreams' }).click()
    await expect(page.getByRole('heading', { name: 'Upstreams', level: 1 })).toBeVisible()
  })

  test('the raw record is shown, for fields this page has not learned yet', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/upstreams/github')
    await expect(page.getByRole('region', { name: 'Raw record' })).toContainText('"authStrategy": "bearer"')
  })
})

test('an unknown route is a page, not a blank screen', async ({ page }) => {
  await mockGateway(page)
  await page.goto('#/nope')
  await expect(page.getByText('No such page')).toBeVisible()
})

test.describe('the attention banner', () => {
  test('names the disconnected upstream and links to it', async ({ page }) => {
    await mockGateway(page)
    await page.goto('./')

    const banner = page.locator('.banner.bad')
    await expect(banner).toContainText('payments is not connected')
    // payments is breaker-open too, but it is already counted as down: a
    // disconnected upstream's breaker is not a second finding about it.
    await expect(banner).not.toContainText('open breaker')

    await banner.getByRole('link', { name: 'Show them' }).click()
    await expect(page).toHaveURL(/status=disconnected/)
    await expect(page.locator('tbody tr')).toHaveCount(1)
  })

  test('says nothing when the federation is healthy', async ({ page }) => {
    // Absence over placeholder: a banner that is always there is furniture,
    // and an operator who has learned to skip it skips it on the day it counts.
    await mockGateway(page, {
      federation: federation({
        upstreams: [
          { id: 'github', namespace: 'github', connected: true, breaker: 'closed', source: 'static' },
        ],
      }),
    })
    await page.goto('./')
    await expect(page.locator('.banner')).toHaveCount(0)
  })

  test('does not interrupt a screen reader', async ({ page }) => {
    // It is the answer the operator navigated here to read, not a condition
    // that arrived unbidden. role="alert" stays reserved for the console being
    // degraded — skew, unauthorized, a failed read — which is also what keeps
    // getByRole('alert') meaning one thing in the rest of this suite.
    await mockGateway(page)
    await page.goto('./')
    await expect(page.locator('.banner.bad')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('reports an open breaker on an otherwise connected upstream', async ({ page }) => {
    await mockGateway(page, {
      federation: federation({
        upstreams: [
          { id: 'github', namespace: 'github', connected: true, breaker: 'open', source: 'static' },
        ],
      }),
    })
    await page.goto('./')
    const banner = page.locator('.banner.warn')
    await expect(banner).toContainText('github is connected but its breaker is open')
    await expect(banner).toContainText('Calls to it fail fast')
  })

  test('half-open is not reported as a failure', async ({ page }) => {
    // Neither proven nor failed; the neutral ramp, not a banner.
    await mockGateway(page, {
      federation: federation({
        upstreams: [
          { id: 'github', namespace: 'github', connected: true, breaker: 'half-open', source: 'static' },
        ],
      }),
    })
    await page.goto('./')
    await expect(page.locator('.banner')).toHaveCount(0)
  })
})

test.describe('the jump-to palette', () => {
  test('opens on the keyboard and reaches an upstream', async ({ page }) => {
    await mockGateway(page)
    await page.goto('./')
    await expect(page.getByRole('button', { name: 'Jump to' })).toBeVisible()

    await page.keyboard.press('Control+k')
    const search = page.getByRole('combobox', { name: 'Search' })
    await expect(search).toBeFocused()

    await search.fill('payments')
    await expect(page.getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/upstreams\/payments$/)
  })

  // The trigger must not displace the skip link as the first tab stop. That
  // is already asserted by polish.spec.ts ("the first tab stop skips the
  // navigation"), which is written around a trap this duplicate kept falling
  // into — the shell is client-rendered, so a Tab sent on load lands in an
  // empty document. One careful assertion beats two, and the trigger lives in
  // the top bar, after the skip control in DOM order.

  test('escape closes it and leaves the route alone', async ({ page }) => {
    await mockGateway(page)
    await page.goto('./#/upstreams')
    // The shortcut is attached by an effect, so a keypress dispatched in the
    // same tick as the navigation beats it there. A person pressing this has
    // already seen the page.
    await expect(page.getByRole('button', { name: 'Jump to' })).toBeVisible()
    await page.keyboard.press('Control+k')
    const dialog = page.getByRole('dialog', { name: 'Jump to' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/#\/upstreams$/)
  })

  test('says which haystack it searched when nothing matches', async ({ page }) => {
    await mockGateway(page)
    await page.goto('./')
    await expect(page.getByRole('button', { name: 'Jump to' })).toBeVisible()
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Search' }).fill('zzzz')
    await expect(page.getByText('Routes, upstream ids and catalog names')).toBeVisible()
  })

  test('hints use glyphs the shipped font actually carries', async ({ page }) => {
    // The subset is latin plus U+2190-2193. A command glyph or a return arrow
    // would be drawn by a fallback face, which is the defect docs/design.md
    // records about the arrows themselves.
    await mockGateway(page)
    await page.goto('./')
    await expect(page.getByRole('button', { name: 'Jump to' })).toBeVisible()
    await page.keyboard.press('Control+k')
    const foot = page.locator('.pal-foot')
    await expect(foot).toHaveText(/↑ ↓ to move, Enter to open, Esc to close/)
    const text = (await foot.textContent()) ?? ''
    for (const banned of ['\u2318', '\u21b5', '\u2325']) {
      expect(text).not.toContain(banned)
    }
  })
})
