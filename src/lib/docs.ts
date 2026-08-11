// Version-aware documentation links: the docs an operator opens from a
// running gateway should be the docs for *that* gateway, not for whatever is
// on main.
//
// These are the only external URLs in the console, and they are navigations
// rather than fetches — CSP's form-action/frame-ancestors do not gate a
// user-initiated link, and connect-src never sees one. The set is fixed and
// CI checks it against the same allowlist fold's own CSP implies.
import { minorLine } from './version'

const DOCS_ROOT = 'https://docs.fold.run'

export type DocTopic =
  | 'configuration'
  | 'federation'
  | 'policy'
  | 'auth'
  | 'observability'
  | 'tenancy'
  | 'discovery'

const TOPIC_PATH: Record<DocTopic, string> = {
  configuration: 'configuration',
  federation: 'federation',
  policy: 'policy',
  auth: 'auth',
  observability: 'observability',
  tenancy: 'tenancy',
  discovery: 'discovery',
}

export function docsLink(topic: DocTopic, gatewayVersion?: string): string {
  return `${DOCS_ROOT}/${minorLine(gatewayVersion)}/${TOPIC_PATH[topic]}/`
}
