// A stand-in for the gateway, installed as browser-level route handlers.
//
// WHAT THIS BUYS, AND WHAT IT DOES NOT
//
// It buys the states a real gateway will not produce on demand: unauthorized,
// forbidden, version-skewed, an empty federation, an upstream whose breaker is
// open, an MCP server that answers method-not-found, and a federated tool
// whose name is an XSS attempt. Those are most of what can actually go wrong
// in this console, and none of them are reachable by pointing Playwright at
// `go run fold`.
//
// It does not buy contract fidelity. These fixtures are this repo's belief
// about /api/federation, and a belief can go stale — that is the same skew the
// README's compatibility table is about. Two other things cover that from
// angles a browser cannot: src/lib/federation.ts is typed against fold's
// introspection.go, and fold's own suite greps the vendored bundle. A test
// here that mocked its way to green while the real endpoint renamed a field
// would be worse than no test, so the fixtures below are kept literal —
// copied shapes, not constructed ones.
import type { Page, Route } from '@playwright/test'

export interface Upstream {
  id: string
  namespace?: string
  url?: string
  owner?: { org?: string; team?: string; contact?: string }
  labels?: Record<string, string>
  breaker?: string
  connected: boolean
  latencyMs?: number
  error?: string
  endpoints?: Array<{ url?: string; healthy: boolean }>
  source?: string
  authStrategy?: string
}

export interface Federation {
  version: string
  authRequired: boolean
  emaEnabled: boolean
  passthrough: boolean
  mcpPath: string
  policyDefaultDecision: string
  policyRules: number
  globalRequestsPerMinute?: number
  perPrincipalRequestsPerMinute?: number
  sharedState: boolean
  auditSinks: string[]
  tracingEnabled: boolean
  viewerGroups?: string[]
  namespaceSeparator: string
  pageSize: number
  staticUpstreams: number
  discoveredUpstreams: number
  consoleSource?: string
  tenant?: string
  tenantRequestsPerMinute?: number
  tenantUpstreamCalls?: number
  tenantBudgetPeriod?: string
  upstreams: Upstream[]
  discovery?: { url: string; intervalMs?: number; lastOutcome?: string; lastSyncAt?: string }
}

export const federation = (over: Partial<Federation> = {}): Federation => ({
  version: '1.9.0',
  authRequired: false,
  emaEnabled: false,
  passthrough: false,
  mcpPath: '/mcp',
  policyDefaultDecision: 'deny',
  policyRules: 3,
  sharedState: false,
  auditSinks: ['stdout'],
  tracingEnabled: false,
  namespaceSeparator: '__',
  pageSize: 200,
  staticUpstreams: 2,
  discoveredUpstreams: 0,
  consoleSource: 'f1d5aad49b9cd16e6d295832edb9ef7e15daa8aa',
  upstreams: [
    {
      id: 'github',
      namespace: 'github',
      url: 'http://127.0.0.1:3001/mcp',
      source: 'static',
      authStrategy: 'bearer',
      connected: true,
      breaker: 'closed',
      latencyMs: 12,
      owner: { org: 'platform', team: 'dx', contact: 'dx@example.internal' },
      labels: { tier: 'gold', region: 'us-east' },
      endpoints: [
        { url: 'http://127.0.0.1:3001/mcp', healthy: true },
        { url: 'http://127.0.0.1:3002/mcp', healthy: false },
      ],
    },
    {
      id: 'payments',
      namespace: 'payments',
      url: 'http://127.0.0.1:3010/mcp',
      source: 'discovered',
      authStrategy: 'none',
      connected: false,
      breaker: 'open',
      error: 'unreachable — details in gateway logs',
    },
  ],
  ...over,
})

export interface Tool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpOptions {
  tools?: Tool[]
  /** Simulate a server without the capability: it answers method-not-found. */
  promptsUnsupported?: boolean
  /** The result tools/call returns. */
  callResult?: unknown
}

export const defaultTools: Tool[] = [
  {
    name: 'github__create_issue',
    description: 'Open an issue on a repository',
    inputSchema: {
      type: 'object',
      required: ['repo', 'title'],
      properties: {
        repo: { type: 'string' },
        title: { type: 'string' },
        labels: { type: 'array' },
        priority: { type: 'string', enum: ['low', 'high'] },
      },
    },
  },
  { name: 'github__list_repos', description: 'List repositories' },
  { name: 'payments__refund', description: 'Refund a charge' },
]

export interface GatewayOptions {
  federation?: Federation
  /** HTTP status for /api/federation. 401 and 403 are the interesting ones. */
  federationStatus?: number
  authHint?: { authRequired: boolean; resource?: string; oauth?: { issuer: string; clientId: string } } | null
  mcp?: McpOptions
}

/** What the mock gateway saw, for assertions about what the console sent. */
export interface Received {
  /** The Authorization header on each /api/federation request, '' when absent. */
  federationAuth: string[]
  /** The Authorization header on each /mcp request. */
  mcpAuth: string[]
}

/**
 * Install the gateway routes. Must run before the first navigation: the
 * console fetches /api/auth-hint before it paints.
 *
 * Returns what the gateway received. Asserting from this side rather than from
 * `page.on('request')` is deliberate — `request.headers()` is the provisional
 * list and need not carry everything the browser ends up sending, so a header
 * assertion made there can fail on a request that was in fact correct.
 */
export async function mockGateway(page: Page, opts: GatewayOptions = {}): Promise<Received> {
  const state = opts.federation ?? federation()
  const status = opts.federationStatus ?? 200
  const tools = opts.mcp?.tools ?? defaultTools
  const received: Received = { federationAuth: [], mcpAuth: [] }

  await page.route('**/api/federation', (route: Route) => {
    received.federationAuth.push(route.request().headers()['authorization'] ?? '')
    if (status !== 200) {
      return route.fulfill({ status, contentType: 'text/plain', body: 'denied' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) })
  })

  await page.route('**/api/auth-hint', (route: Route) => {
    const hint = opts.authHint === undefined ? { authRequired: state.authRequired } : opts.authHint
    if (hint === null) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hint) })
  })

  await page.route('**/mcp', async (route: Route) => {
    received.mcpAuth.push(route.request().headers()['authorization'] ?? '')
    const msg = JSON.parse(route.request().postData() ?? '{}') as {
      id?: number
      method?: string
      params?: { name?: string }
    }

    // Notifications carry no id. The client treats 202 as "accepted" and moves
    // on; anything else would leave it waiting for a reply that never comes.
    if (msg.id === undefined) return route.fulfill({ status: 202, body: '' })

    const reply = (result: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'mcp-session-id': 'test-session' },
        body: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }),
      })

    switch (msg.method) {
      case 'initialize':
        return reply({ protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'mock', version: '0' } })
      case 'tools/list':
        return reply({ tools })
      case 'prompts/list':
        if (opts.mcp?.promptsUnsupported) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: -32601, message: 'method not found' },
            }),
          })
        }
        return reply({ prompts: [{ name: 'github__summarize', description: 'Summarize a thread' }] })
      case 'resources/list':
        return reply({ resources: [{ uri: 'file:///readme.md', name: 'readme', mimeType: 'text/markdown' }] })
      case 'tools/call':
        return reply(
          opts.mcp?.callResult ?? {
            content: [{ type: 'text', text: `called ${msg.params?.name}` }],
          },
        )
      default:
        return reply({})
    }
  })

  return received
}

/**
 * Every Content-Security-Policy violation the page reports.
 *
 * `pnpm preview` replays fold's exact CSP, so a violation here is a violation
 * in a shipped binary. This is the only check in the repo that exercises the
 * policy rather than reasoning about it — CI's greps catch an inline <script>
 * in the HTML and a `style={{}}` in the source, but neither would notice a
 * dependency injecting a style tag at runtime.
 */
export async function collectCspViolations(page: Page): Promise<string[]> {
  const seen: string[] = []
  await page.exposeFunction('__cspViolation', (v: string) => {
    seen.push(v)
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const ev = e as SecurityPolicyViolationEvent
      ;(window as unknown as { __cspViolation: (v: string) => void }).__cspViolation(
        `${ev.violatedDirective}: ${ev.blockedURI || ev.sourceFile || 'inline'}`,
      )
    })
  })
  return seen
}
