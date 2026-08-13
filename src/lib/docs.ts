// Links out to the documentation.
//
// These were versioned — `docs.fold.run/1.10/configuration/` — on the reasoning
// that the docs an operator opens from a running gateway should be the docs for
// *that* gateway. It is a good idea, borrowed from tools whose documentation is
// published per release. fold's is not: docs.fold.run is a single unversioned
// Starlight site, so every one of those links was a 404, and three of the topic
// slugs did not exist under any prefix either.
//
// Nothing caught it. They are external navigations, so no CSP rule and no test
// touched them, and a link that looks plausible reads as correct right up until
// somebody clicks it. tests/docs-links.spec.ts now fetches every URL this can
// produce and asserts each one answers 200, which is the only check that would
// have.
//
// Targets below are verified against the live site, anchors included.

const DOCS_ROOT = 'https://docs.fold.run'

export type DocTopic =
  | 'configuration'
  | 'upstreams'
  | 'policy'
  | 'auth'
  | 'observability'
  | 'tenancy'
  | 'discovery'

/**
 * Where each surface of this console sends an operator.
 *
 * Anchors are used where the page is broad and the question is narrow: someone
 * reading the Governance cards wants the `policy` block, not the top of a
 * configuration reference that opens on `upstreams`.
 */
const TOPIC_PATH: Record<DocTopic, string> = {
  configuration: 'configuration/',
  upstreams: 'configuration/#upstreams-required',
  policy: 'configuration/#policy',
  auth: 'configuration/#auth-gateway-authentication',
  observability: 'operations/',
  tenancy: 'tenancy/',
  discovery: 'discovery/',
}

/** Every URL this module can produce, for the link check to walk. */
export const DOC_TOPICS = Object.keys(TOPIC_PATH) as DocTopic[]

export function docsLink(topic: DocTopic): string {
  return `${DOCS_ROOT}/${TOPIC_PATH[topic]}`
}
