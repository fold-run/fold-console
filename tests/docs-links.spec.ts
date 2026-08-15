// Every documentation URL this console can emit, fetched.
//
// The links used to carry a version segment — `docs.fold.run/1.10/…` — on the
// reasoning that the docs an operator opens from a running gateway should be
// the docs for that gateway. fold's documentation is a single unversioned
// site, so all of them 404'd, and three of the topic slugs did not exist under
// any prefix either.
//
// Nothing in the repo could have noticed. They are external navigations: the
// CSP never sees them, no unit test renders an href it does not itself supply,
// and a plausible-looking URL reads as correct until somebody clicks it. The
// only check with any power here is the one that asks the internet.
//
// It lives in the contract config rather than the e2e suite for the same
// reason the gateway contract does: it reaches the network, and a docs outage
// should not redden a pull request about a component. It runs on pull
// requests and on the Monday schedule.
import { expect, test } from '@playwright/test'
import { DOC_TOPICS, docsLink } from '../src/lib/docs'

test.describe('documentation links', () => {
  for (const topic of DOC_TOPICS) {
    test(`${topic} points at a page that exists`, async ({ request }) => {
      const url = docsLink(topic)
      const res = await request.get(url, { maxRedirects: 5 })
      expect(res.status(), `${url} should exist`).toBe(200)
    })
  }

  test('anchors point at headings that exist', async ({ request }) => {
    // A wrong anchor does not 404 — it silently lands at the top of the page,
    // which is the failure mode that looks like success. Fetch the document
    // and look for the id.
    const anchored = DOC_TOPICS.map((t) => [t, docsLink(t)] as const).filter(([, url]) =>
      url.includes('#'),
    )
    expect(anchored.length, 'the anchored topics should still be anchored').toBeGreaterThan(0)

    for (const [topic, url] of anchored) {
      const [page, id] = url.split('#')
      const html = await (await request.get(page!)).text()
      expect(html, `${topic}: ${page} has no id="${id}"`).toContain(`id="${id}"`)
    }
  })
})
