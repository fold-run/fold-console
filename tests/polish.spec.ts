// The affordances added in the polish pass, and the two layout bugs it fixed.
//
// A regression in any of these is silent: the page still renders, it just
// renders wrong. That is precisely the class of defect that survived every
// static check until someone looked at a screenshot.
import { expect, test } from '@playwright/test'
import { federation, mockGateway } from './gateway'

test.describe('layout', () => {
  test('the page title aligns with the content beneath it', async ({ page }) => {
    // A bare `header` rule handed every page header the top bar's 1.5rem side
    // padding, so every h1 sat 24px right of its own content.
    await mockGateway(page)
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()

    const offset = await page.evaluate(() => {
      const h1 = document.querySelector('.page-head h1')!.getBoundingClientRect()
      const card = document.querySelector('.card')!.getBoundingClientRect()
      return Math.round(h1.left - card.left)
    })
    expect(offset).toBe(0)
  })

  test('stacking the nav above the content opens no gap', async ({ page }) => {
    // .body is a flex child that grows, and a grid hands its slack to the
    // rows — so once the sidebar stacked on top it absorbed ~140px.
    await page.setViewportSize({ width: 800, height: 900 })
    await mockGateway(page)
    await page.goto('#/upstreams')
    await expect(page.getByRole('heading', { name: 'Upstreams', level: 1 })).toBeVisible()

    const gap = await page.evaluate(() => {
      const nav = document.querySelector('.sidebar')!.getBoundingClientRect()
      const head = document.querySelector('.page-head')!.getBoundingClientRect()
      return Math.round(head.top - nav.bottom)
    })
    expect(gap).toBeLessThan(40)
  })

  test('no page scrolls sideways', async ({ page }) => {
    await mockGateway(page)
    for (const width of [1440, 900, 600, 380]) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of ['./', '#/upstreams', '#/upstreams/github', '#/catalog', '#/test']) {
        await page.goto(route)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(0)
      }
    }
  })
})

test.describe('freshness', () => {
  test('reports how current the snapshot is', async ({ page }) => {
    await mockGateway(page)
    await page.goto('./')
    const freshness = page.locator('.freshness')
    await expect(freshness).toHaveAttribute('data-state', 'live')
    await expect(freshness).toContainText('just now')
  })

  test('says so when the gateway stops answering', async ({ page }) => {
    await mockGateway(page, { federationStatus: 403, federation: federation({ authRequired: true }) })
    await page.goto('./')
    await expect(page.locator('.freshness')).toHaveAttribute('data-state', 'failed')
    await expect(page.locator('.freshness')).toContainText('not updating')
  })
})

test.describe('keyboard', () => {
  test('the first tab stop skips the navigation', async ({ page }) => {
    await mockGateway(page)
    await page.goto('./')
    // Wait for the app to render before tabbing. The shell is client-rendered
    // after an async bootstrap, so a Tab sent on load lands in an empty
    // document and focus never reaches the button that appears a tick later.
    // (Do not click first to "focus the page" either: Chrome sets the
    // sequential focus starting point to the click, so tabbing then resumes
    // from mid-page and silently skips the whole top bar.)
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
    await page.keyboard.press('Tab')

    const skip = page.getByRole('button', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('main')).toBeFocused()
  })

  test('the skip control is opaque when focused', async ({ page }) => {
    // It overlays the wordmark; the shared button box is transparent, which
    // left both unreadable.
    await mockGateway(page)
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Skip to content' })).toBeFocused()
    const bg = await page
      .getByRole('button', { name: 'Skip to content' })
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })
})

test.describe('reach', () => {
  test('the copy control has a pointer target larger than its box', async ({ page }) => {
    // 25px tall by design, because it sits inside a table cell. The target is
    // grown past the box instead of growing the box.
    await mockGateway(page)
    await page.goto('./')
    const box = page.locator('.copy').first()
    await expect(box).toBeVisible()

    const size = await box.evaluate((el) => {
      const b = el.getBoundingClientRect()
      const cx = b.left + b.width / 2
      const owns = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y)
        return hit === el || el.contains(hit)
      }
      let top = b.top
      let bottom = b.bottom
      for (let y = b.top; y > b.top - 30 && owns(cx, y); y--) top = y
      for (let y = b.bottom; y < b.bottom + 30 && owns(cx, y); y++) bottom = y
      return { visual: b.height, target: bottom - top }
    })
    expect(size.visual).toBeLessThan(30)
    expect(size.target).toBeGreaterThanOrEqual(44)
  })
})

test.describe('progressive disclosure', () => {
  test('the test console offers one thing to do before connecting', async ({ page }) => {
    // It used to announce "Not connected" and then render the whole form in a
    // disabled state, leaving the operator to work out which greyed control
    // mattered.
    await mockGateway(page)
    await page.goto('#/test')

    await expect(page.getByText('Not connected')).toBeVisible()
    await expect(page.getByLabel('Tool')).toHaveCount(0)
    await expect(page.getByLabel(/Arguments/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Call tool' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByLabel('Tool')).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Call tool' })).toBeEnabled()
  })

  test('the Action fill moves to whichever step is next', async ({ page }) => {
    // One primary per page: connecting before there is a session, nothing
    // afterwards, because the next move is reading the result.
    await mockGateway(page)
    await page.goto('#/catalog')
    await expect(page.getByRole('button', { name: 'Connect & list' })).toHaveClass(/primary/)

    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByRole('link', { name: 'create_issue' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload catalog' })).not.toHaveClass(/primary/)
  })
})

test('the wire log follows the tail as messages arrive', async ({ page }) => {
  // The hand-written console did this; the rewrite dropped it, so a live
  // session scrolled out of view and had to be chased by hand.
  await mockGateway(page)
  await page.goto('#/test')
  await page.getByRole('button', { name: 'Connect & list' }).click()
  await expect(page.getByLabel('Tool')).toBeEnabled()
  await page.getByRole('button', { name: 'Call tool' }).click()
  await expect(page.getByRole('region', { name: 'Result' })).toContainText('called')

  const atTail = await page
    .getByRole('region', { name: 'Wire log' })
    .locator('pre')
    .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 4)
  expect(atTail).toBe(true)
})

test('the loading state holds the shape of the answer', async ({ page }) => {
  // Skeletons rather than a line of text, so nothing jumps when data lands.
  // The delay goes through mockGateway: a separate page.route registered
  // before it is shadowed, because Playwright matches most-recent-first.
  await mockGateway(page, { federationDelayMs: 600 })
  await page.goto('#/upstreams')
  await expect(page.locator('.skeleton').first()).toBeVisible()
  await expect(page.locator('tbody').getByRole('link', { name: 'github', exact: true })).toBeVisible()
  await expect(page.locator('.skeleton')).toHaveCount(0)
})
