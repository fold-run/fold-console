// The topology view.
//
// A drawing is the easiest thing in a codebase to break silently: it still
// renders, it just stops being true. These assert the two claims it makes —
// one node per upstream, and a route whose treatment matches that upstream's
// actual state — plus the parts that make it a view rather than a picture.
import { expect, test } from '@playwright/test'
import { federation, mockGateway, type Upstream } from './gateway'

const mixed: Upstream[] = [
  { id: 'github', namespace: 'github', connected: true, breaker: 'closed', latencyMs: 12, source: 'static' },
  { id: 'payments', namespace: 'payments', connected: false, breaker: 'open', source: 'discovered', error: 'unreachable' },
  { id: 'cfdocs', namespace: 'cfdocs', connected: true, breaker: 'half-open', latencyMs: 380, source: 'static' },
]

const withMixed = (page: Parameters<typeof mockGateway>[0]) =>
  mockGateway(page, {
    federation: federation({ upstreams: mixed, staticUpstreams: 2, discoveredUpstreams: 1 }),
  })

test.describe('topology', () => {
  test('draws one node per upstream, and the gateway they share', async ({ page }) => {
    await withMixed(page)
    await page.goto('#/upstreams?view=map')

    await expect(page.locator('.fold-node')).toHaveCount(3)
    await expect(page.locator('.fold-gate')).toHaveCount(1)
    // The gateway carries the mark rather than a label; every other node is a
    // wire string.
    await expect(page.locator('.fold-node-mark')).toHaveCount(1)
    await expect(page.getByText('github__*')).toBeVisible()
  })

  test('route treatment matches the upstream state', async ({ page }) => {
    // Live for proven-up, Down for failed, neutral for half-open, which is
    // neither. Getting this wrong is the failure that still looks fine.
    await withMixed(page)
    await page.goto('#/upstreams?view=map')

    await expect(page.locator('.fold-active')).toHaveCount(1)
    await expect(page.locator('.fold-broken')).toHaveCount(1)
    await expect(page.locator('.fold-dash')).toHaveCount(1)
    // Grain arrows only on routes actually carrying.
    await expect(page.locator('.fold-arrow')).toHaveCount(1)
  })

  test('a half-open breaker says so rather than showing a healthy latency', async ({ page }) => {
    await withMixed(page)
    await page.goto('#/upstreams?view=map')
    await expect(page.getByText('380 ms · breaker half-open')).toBeVisible()
  })

  test('an upstream with no breaker reported still reads as connected', async ({ page }) => {
    // Absence is version skew, not a state. An older gateway that omits the
    // field must not turn the whole federation grey.
    await mockGateway(page, {
      federation: federation({
        upstreams: [{ id: 'legacy', namespace: 'legacy', connected: true, latencyMs: 9 }],
      }),
    })
    await page.goto('#/upstreams?view=map')
    await expect(page.locator('.fold-active')).toHaveCount(1)
    await expect(page.locator('.fold-dash')).toHaveCount(0)
  })

  test('nodes are links into the detail route', async ({ page }) => {
    // The drawing is how you get to the upstream that is down; that is what
    // makes it a view rather than a decoration.
    await withMixed(page)
    await page.goto('#/upstreams?view=map')

    await page.locator('.fold-link').first().click()
    await expect(page).toHaveURL(/#\/upstreams\/github$/)
    await expect(page.getByRole('heading', { name: 'github', level: 1 })).toBeVisible()
  })

  test('every node carries an accessible name', async ({ page }) => {
    await withMixed(page)
    await page.goto('#/upstreams?view=map')

    await expect(page.getByRole('link', { name: /payments: not connected, breaker open/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /github: connected, breaker closed, 12 ms/ })).toBeVisible()
  })

  test('the view is in the URL and survives a cold load', async ({ page }) => {
    await withMixed(page)
    await page.goto('#/upstreams')
    await expect(page.locator('.topology-svg')).toHaveCount(0)

    await page.getByRole('button', { name: 'Map' }).click()
    await expect(page).toHaveURL(/view=map/)

    await page.reload()
    await expect(page.locator('.topology-svg')).toBeVisible()
  })

  test('filters narrow the drawing, not just the table', async ({ page }) => {
    // The reason to put this on /upstreams rather than its own route: filter
    // to what is broken, then look at the shape of it.
    await withMixed(page)
    await page.goto('#/upstreams?view=map&status=disconnected')

    await expect(page.locator('.fold-node')).toHaveCount(1)
    await expect(page.getByText('payments__*')).toBeVisible()
    await expect(page.getByText('github__*')).toHaveCount(0)
  })

  test('a filter matching nothing falls back to the table empty state', async ({ page }) => {
    // Two views, one set of state messages. An empty drawing would say less
    // than the sentence the table already has.
    await withMixed(page)
    await page.goto('#/upstreams?view=map&q=nosuchupstream')
    await expect(page.getByText('No upstream matches this filter')).toBeVisible()
    await expect(page.locator('.topology-svg')).toHaveCount(0)
  })

  test('a federation too large to draw names what it left out', async ({ page }) => {
    // Silent truncation reads as "this is all of them".
    const many: Upstream[] = Array.from({ length: 44 }, (_, i) => ({
      id: `up-${i}`,
      namespace: `ns${i}`,
      connected: true,
      breaker: 'closed',
      latencyMs: 10,
      source: 'static',
    }))
    await mockGateway(page, { federation: federation({ upstreams: many, staticUpstreams: 44 }) })
    await page.goto('#/upstreams?view=map')

    await expect(page.locator('.fold-node')).toHaveCount(40)
    await expect(page.getByText(/4 more not drawn, see the table/)).toBeVisible()
  })

  test('the drawing does not overflow the page at any width', async ({ page }) => {
    await withMixed(page)
    for (const width of [1440, 1000, 700, 380]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('#/upstreams?view=map')
      await expect(page.locator('.topology-svg')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `map at ${width}px`).toBeLessThanOrEqual(0)
    }
  })
})
