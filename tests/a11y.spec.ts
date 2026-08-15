// An engine's opinion, over every route and the states that only exist after
// an interaction.
//
// The accessibility work in this console was done by hand and verified by
// reading: a skip control, route announcements, named regions, accessible
// names on the topology's nodes, contrast computed for every token pair. That
// is exactly the kind of work that feels finished and is not, because the
// author checks the things they thought of.
//
// axe does not replace that judgement — it cannot tell whether an announcement
// is useful, or whether "not updating" is the right phrase — but it is very
// good at the mechanical half, and the mechanical half is where hand-written
// markup rots.
//
// Scoped to WCAG 2 A/AA, which is the floor PRODUCT.md commits to.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { federation, mockGateway, type Upstream } from './gateway'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * Wait out every finite animation currently running.
 *
 * Infinite ones (the freshness dot's pulse) never finish, so they are filtered
 * out rather than waited on forever.
 */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
}

async function scan(page: Page) {
  // Let motion settle first. The banner fades in over 180ms, and axe scanning
  // mid-fade measures a composited colour — it reported #bf3c5d on the Down
  // banner, which is #FF4C79 part-way through its own entrance, not a real
  // contrast failure.
  await settle(page)

  // Then again, because settling once is not enough for anything that mounts
  // with the data rather than with the route. The routes are scanned as soon
  // as <main> is visible, which is before the federation snapshot lands, so
  // Overview's attention banner begins its entrance *after* the first wait has
  // already resolved. Two frames is enough for that render to commit and its
  // animation to be registered; the second wait then covers it.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
  await settle(page)

  return new AxeBuilder({ page }).withTags(TAGS).analyze()
}

/** A readable failure: axe's default dump is unreadable in a terminal. */
function report(violations: Awaited<ReturnType<typeof scan>>['violations']): string {
  if (!violations.length) return ''
  return violations
    .map((v) => {
      const where = v.nodes.map((n) => `      ${n.target.join(' ')}`).join('\n')
      return `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${where}`
    })
    .join('\n\n')
}

const mixed: Upstream[] = [
  { id: 'github', namespace: 'github', connected: true, breaker: 'closed', latencyMs: 12, source: 'static',
    owner: { org: 'platform', team: 'dx', contact: 'dx@example.internal' }, labels: { tier: 'gold' },
    endpoints: [{ url: 'http://127.0.0.1:3001/mcp', healthy: true }, { url: 'http://127.0.0.1:3002/mcp', healthy: false }] },
  { id: 'payments', namespace: 'payments', connected: false, breaker: 'open', source: 'discovered', error: 'unreachable' },
]

test.describe('accessibility', () => {
  // Every route in its resting state.
  for (const [name, route] of [
    ['overview', './'],
    ['upstreams', '#/upstreams'],
    ['upstream detail', '#/upstreams/github'],
    ['topology', '#/upstreams?view=map'],
    ['catalog', '#/catalog'],
    ['test console', '#/test'],
    ['not found', '#/nope'],
  ] as const) {
    test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
      await mockGateway(page, { federation: federation({ upstreams: mixed }) })
      await page.goto(route)
      await expect(page.locator('main')).toBeVisible()

      const { violations } = await scan(page)
      expect(violations, report(violations)).toEqual([])
    })
  }

  test('the catalog after connecting', async ({ page }) => {
    // A table full of upstream-controlled strings, which is a different shape
    // from the empty state the route test sees.
    await mockGateway(page)
    await page.goto('#/catalog')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByRole('link', { name: 'create_issue' })).toBeVisible()

    const { violations } = await scan(page)
    expect(violations, report(violations)).toEqual([])
  })

  test('the test console with a result and a wire log', async ({ page }) => {
    // The form and both output panes only exist once a session is open.
    await mockGateway(page)
    await page.goto('#/test')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByLabel('Tool')).toBeEnabled()
    await page.getByRole('button', { name: 'Call tool' }).click()
    await expect(page.getByRole('region', { name: 'Result' })).toContainText('called')

    const { violations } = await scan(page)
    expect(violations, report(violations)).toEqual([])
  })

  test('an unauthorized gateway, banner and all', async ({ page }) => {
    // The alert, the empty state and the token field together.
    await mockGateway(page, { federationStatus: 401, federation: federation({ authRequired: true }) })
    await page.goto('./')
    await expect(page.getByRole('alert')).toBeVisible()

    const { violations } = await scan(page)
    expect(violations, report(violations)).toEqual([])
  })

  test('the skip control while focused', async ({ page }) => {
    // It is off-screen until focused, so a resting scan never sees it.
    await mockGateway(page)
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Skip to content' })).toBeFocused()

    const { violations } = await scan(page)
    expect(violations, report(violations)).toEqual([])
  })

  test('the jump-to palette, open', async ({ page }) => {
    await mockGateway(page)
    await page.goto('./')
    await expect(page.getByRole('button', { name: 'Jump to' })).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Jump to' })).toBeVisible()
    const { violations } = await scan(page)
    expect(violations, report(violations)).toEqual([])
  })
})
