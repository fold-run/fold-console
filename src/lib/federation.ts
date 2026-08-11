// The /api/federation contract, mirrored from fold's gateway/introspection.go.
//
// These types are a *copy* of a contract owned by another repo at a version
// this console can skew against (see the compatibility table in the README),
// so every field that fold marks `omitempty` is optional here. Rendering code
// must treat absence as "this gateway does not report it" rather than as an
// error — that is what makes an older gateway degrade to fewer cards instead
// of a page of "undefined".
import { authHeaders } from './session'

export interface EndpointStatus {
  url?: string
  healthy: boolean
}

export interface Owner {
  org?: string
  team?: string
  contact?: string
}

export type BreakerState = 'closed' | 'open' | 'half-open' | (string & {})

export interface UpstreamHealth {
  id: string
  namespace?: string
  url?: string
  owner?: Owner
  labels?: Record<string, string>
  breaker?: BreakerState
  connected: boolean
  latencyMs?: number
  error?: string
  endpoints?: EndpointStatus[]
  source?: 'static' | 'discovered' | (string & {})
  authStrategy?: string
}

export interface DiscoveryStatus {
  url: string
  intervalMs?: number
  lastOutcome?: string
  lastSyncAt?: string
}

export interface FederationState {
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

  upstreams: UpstreamHealth[]
  discovery?: DiscoveryStatus
}

/**
 * A gateway response this console can explain in a sentence.
 *
 * 401 and 403 are not failures to retry — they are answers, and each has a
 * specific remedy the operator can act on. Keeping them as a typed error
 * rather than a thrown Response is what lets the query layer stop polling on
 * them (retrying an unauthorized read every 15 s only mints 401 audit events)
 * while still retrying an ordinary network blip.
 */
export class ApiError extends Error {
  readonly status: number
  /** Terminal errors must not be retried: the same request gets the same answer. */
  readonly terminal: boolean

  constructor(status: number, message: string, terminal = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.terminal = terminal
  }
}

// Relative to this page's base (/console/), so it survives any prefix a
// fronting proxy adds. "../api/federation" resolves to /api/federation at the
// root and to /fold/api/federation behind a proxy adding /fold; an absolute
// path would break the second case. fold's own test suite greps the vendored
// bundle for `fetch("/api/` and fails the build if it finds one.
export const API_BASE = '../api'

export async function fetchFederation(signal?: AbortSignal): Promise<FederationState> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/federation`, { headers: authHeaders(), signal })
  } catch (err) {
    throw new ApiError(0, `state fetch failed: ${(err as Error).message}`)
  }

  if (res.status === 401) {
    throw new ApiError(
      401,
      'Unauthorized — sign in, or paste a valid Bearer token (the same token /mcp accepts).',
      true,
    )
  }
  if (res.status === 403) {
    throw new ApiError(
      403,
      'This principal is not in the introspection viewer allowlist (server.introspection.groups). The denial was audited.',
      true,
    )
  }
  if (!res.ok) throw new ApiError(res.status, `state fetch failed: HTTP ${res.status}`)

  return (await res.json()) as FederationState
}

export const federationQuery = {
  queryKey: ['federation'] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchFederation(signal),
  // The dashboard is a live view of a running gateway, not a document.
  refetchInterval: 15_000,
  retry: (_count: number, error: unknown) => !(error instanceof ApiError && error.terminal),
}
