// The MCP session: catalog, invocation, and the wire log.
//
// The session is held above the router on purpose, so the tests that matter
// most here are the ones that cross a route boundary — connect on one page,
// still connected on the next.
import { expect, test } from '@playwright/test'
import { mockGateway } from './gateway'

test.describe('catalog', () => {
  test('connect lists what this principal can reach', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/catalog')

    await expect(page.getByText('Not connected')).toBeVisible()
    await page.getByRole('button', { name: 'Connect & list' }).click()

    await expect(page.getByRole('link', { name: 'create_issue' })).toBeVisible()
    await expect(page.getByText('Open an issue on a repository')).toBeVisible()
    await expect(page.getByText('3 of 3')).toBeVisible()
  })

  test('the namespace is split out of the federated name', async ({ page }) => {
    // "github__create_issue" is one string carrying two facts. Showing them as
    // two columns is what makes "which upstream is this from" answerable.
    await mockGateway(page)
    await page.goto('#/catalog')
    await page.getByRole('button', { name: 'Connect & list' }).click()

    const row = page.locator('tbody tr', { hasText: 'create_issue' })
    await expect(row.locator('td').nth(0)).toHaveText('create_issue')
    await expect(row.locator('td').nth(1)).toHaveText('github')
  })

  test('a capability the server does not implement reads as empty, not broken', async ({ page }) => {
    // A method-not-found answer to prompts/list is a normal server, not a
    // failure — the console must not surface it as an error.
    await mockGateway(page, { mcp: { promptsUnsupported: true } })
    await page.goto('#/catalog')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByRole('link', { name: 'create_issue' })).toBeVisible()

    await page.getByRole('button', { name: /^Prompts/ }).click()
    await expect(page.getByText('No prompts visible')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('filtering the catalog is deep-linkable', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/catalog')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await page.getByLabel('Filter catalog').fill('refund')

    await expect(page.getByRole('link', { name: 'refund' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'create_issue' })).toHaveCount(0)
    await expect(page).toHaveURL(/q=refund/)
  })
})

test.describe('test console', () => {
  test('the session survives navigation between routes', async ({ page }) => {
    // Connecting costs a round-trip per capability. An operator who connects
    // on the catalog must not pay again, or find an empty picker, on the test
    // console.
    await mockGateway(page)
    await page.goto('#/catalog')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByRole('link', { name: 'create_issue' })).toBeVisible()

    await page.getByRole('link', { name: 'Test console' }).click()
    await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible()
    await expect(page.getByText('Not connected')).toHaveCount(0)
    await expect(page.getByLabel('Tool')).toBeEnabled()
  })

  test('a catalog row links straight to its item, preselected', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/catalog')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await page.getByRole('link', { name: 'refund' }).click()

    await expect(page).toHaveURL(/item=payments__refund/)
    await expect(page.getByLabel('Tool')).toHaveValue('payments__refund')
    await expect(page.locator('.itemdesc')).toHaveText('Refund a charge')
  })

  test('arguments are pre-filled from the tool schema, required fields only', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/catalog')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await page.getByRole('link', { name: 'create_issue' }).click()

    const args = page.getByLabel(/Arguments/)
    const value = JSON.parse((await args.inputValue()) || '{}') as Record<string, unknown>
    expect(Object.keys(value).sort()).toEqual(['repo', 'title'])
    // Optional properties are noise in a skeleton, and servers reject
    // unexpected nulls more often than they reject omissions.
    expect(value).not.toHaveProperty('labels')
  })

  test('calling a tool shows the result and the wire log', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/test')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByLabel('Tool')).toBeEnabled()

    await page.getByRole('button', { name: 'Call tool' }).click()
    await expect(page.getByRole('region', { name: 'Result' })).toContainText('called github__create_issue')

    const wire = page.getByRole('region', { name: 'Wire log' })
    await expect(wire).toContainText('"method": "initialize"')
    await expect(wire).toContainText('"method": "tools/call"')
  })

  test('malformed arguments are rejected before anything is sent', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/test')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByLabel('Tool')).toBeEnabled()

    await page.getByLabel(/Arguments/).fill('{not json')
    await page.getByRole('button', { name: 'Call tool' }).click()
    await expect(page.getByRole('alert')).toContainText('Arguments are not valid JSON')
  })

  test('a tool error is a result, not a page failure', async ({ page }) => {
    await mockGateway(page, {
      mcp: { callResult: { isError: true, content: [{ type: 'text', text: 'repository not found' }] } },
    })
    await page.goto('#/test')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await expect(page.getByLabel('Tool')).toBeEnabled()
    await page.getByRole('button', { name: 'Call tool' }).click()

    await expect(page.getByRole('region', { name: 'Result' })).toContainText('repository not found')
    await expect(page.getByRole('heading', { name: 'Test console' })).toBeVisible()
  })

  test('resources take no arguments', async ({ page }) => {
    await mockGateway(page)
    await page.goto('#/test')
    await page.getByRole('button', { name: 'Connect & list' }).click()
    await page.getByRole('button', { name: /^Resources/ }).click()

    await expect(page.getByRole('button', { name: 'Read resource' })).toBeVisible()
    await expect(page.getByLabel(/Arguments/)).toBeDisabled()
  })
})
