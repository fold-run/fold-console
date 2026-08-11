// What this console believes /api/federation looks like, as data.
//
// THE HOLE THIS FILLS
//
// federation.ts is a hand transcription of fold's gateway/introspection.go.
// Nothing checked it. The end-to-end suite asserts against fixtures written
// from the same belief, and fold's own guard greps the vendored bundle for two
// literal endpoint paths — so if a field in that Go struct were renamed:
//
//   - fold's tests pass; it still compiles and the paths are untouched
//   - this repo's tests pass; the fixtures agree with the types
//   - operators get a dashboard of blank cards
//
// That is the exact skew src/lib/version.ts exists to survive, and it was the
// one path with no test at all. The fix is to state the belief once, in a form
// a running gateway can be measured against.
//
// WHY NOT DERIVE IT
//
// A generator would remove the duplication and put a codegen step between the
// types and the build. The `satisfies` clause below buys the property that
// actually matters — the field list cannot drift from the interface, because
// tsc fails if it gains, loses or renames a key — for no dependency and no
// build step. The kinds are the part still written by hand, and they are what
// the runtime check exists to prove.
import type { AuthHint } from './oauth'
import type { DiscoveryStatus, FederationState, UpstreamHealth } from './federation'

type Kind = 'string' | 'number' | 'boolean' | 'array' | 'object'

interface FieldSpec {
  kind: Kind
  /**
   * Whether fold always sends it. Mirrors the absence of `omitempty` on the Go
   * field: a required field missing from a live response is a broken contract,
   * an optional one missing is just a gateway with that feature switched off.
   */
  required: boolean
}

/**
 * `satisfies Record<keyof T, …>` in both directions: a key added to the
 * interface and not here fails to compile, and a key here that is not on the
 * interface fails too. The list cannot rot silently.
 */
export const FEDERATION_CONTRACT = {
  version: { kind: 'string', required: true },
  authRequired: { kind: 'boolean', required: true },
  emaEnabled: { kind: 'boolean', required: true },
  passthrough: { kind: 'boolean', required: true },
  mcpPath: { kind: 'string', required: true },
  policyDefaultDecision: { kind: 'string', required: true },
  policyRules: { kind: 'number', required: true },
  globalRequestsPerMinute: { kind: 'number', required: false },
  perPrincipalRequestsPerMinute: { kind: 'number', required: false },
  sharedState: { kind: 'boolean', required: true },
  auditSinks: { kind: 'array', required: true },
  tracingEnabled: { kind: 'boolean', required: true },
  viewerGroups: { kind: 'array', required: false },
  namespaceSeparator: { kind: 'string', required: true },
  pageSize: { kind: 'number', required: true },
  staticUpstreams: { kind: 'number', required: true },
  discoveredUpstreams: { kind: 'number', required: true },
  consoleSource: { kind: 'string', required: false },
  tenant: { kind: 'string', required: false },
  tenantRequestsPerMinute: { kind: 'number', required: false },
  tenantUpstreamCalls: { kind: 'number', required: false },
  tenantBudgetPeriod: { kind: 'string', required: false },
  upstreams: { kind: 'array', required: true },
  discovery: { kind: 'object', required: false },
} satisfies Record<keyof FederationState, FieldSpec>

export const UPSTREAM_CONTRACT = {
  id: { kind: 'string', required: true },
  namespace: { kind: 'string', required: false },
  url: { kind: 'string', required: false },
  owner: { kind: 'object', required: false },
  labels: { kind: 'object', required: false },
  breaker: { kind: 'string', required: false },
  connected: { kind: 'boolean', required: true },
  latencyMs: { kind: 'number', required: false },
  error: { kind: 'string', required: false },
  endpoints: { kind: 'array', required: false },
  source: { kind: 'string', required: false },
  authStrategy: { kind: 'string', required: false },
} satisfies Record<keyof UpstreamHealth, FieldSpec>

export const DISCOVERY_CONTRACT = {
  url: { kind: 'string', required: true },
  intervalMs: { kind: 'number', required: false },
  lastOutcome: { kind: 'string', required: false },
  lastSyncAt: { kind: 'string', required: false },
} satisfies Record<keyof DiscoveryStatus, FieldSpec>

export const AUTH_HINT_CONTRACT = {
  authRequired: { kind: 'boolean', required: true },
  resource: { kind: 'string', required: false },
  oauth: { kind: 'object', required: false },
} satisfies Record<keyof AuthHint, FieldSpec>

export interface ContractReport {
  /** Broken promises: a field this console reads is gone or changed shape. */
  breaks: string[]
  /**
   * Fields the gateway sends that this console has never heard of. Not a
   * failure — fold adds surfaces in minors and the console is allowed to lag —
   * but each one is a thing an operator can see in curl and not here.
   */
  unknown: string[]
}

function kindOf(v: unknown): Kind | 'null' | 'undefined' {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (Array.isArray(v)) return 'array'
  return typeof v as Kind
}

function checkObject(
  where: string,
  value: Record<string, unknown>,
  contract: Record<string, FieldSpec>,
  report: ContractReport,
): void {
  for (const [name, spec] of Object.entries(contract)) {
    const actual = value[name]
    if (actual === undefined || actual === null) {
      if (spec.required) report.breaks.push(`${where}.${name} is missing; this console requires it`)
      continue
    }
    const got = kindOf(actual)
    if (got !== spec.kind) {
      report.breaks.push(`${where}.${name} is ${got}, this console reads it as ${spec.kind}`)
    }
  }
  for (const name of Object.keys(value)) {
    if (!(name in contract)) report.unknown.push(`${where}.${name}`)
  }
}

/** Measure a live /api/federation response against what this console reads. */
export function checkFederation(body: unknown): ContractReport {
  const report: ContractReport = { breaks: [], unknown: [] }
  if (kindOf(body) !== 'object') {
    report.breaks.push(`/api/federation returned ${kindOf(body)}, not an object`)
    return report
  }
  const state = body as Record<string, unknown>
  checkObject('federation', state, FEDERATION_CONTRACT, report)

  // Only the first upstream: they come from one Go type, so a second one
  // cannot disagree, and reporting the same break once per upstream would bury
  // the signal in a large federation.
  const upstreams = state.upstreams
  if (Array.isArray(upstreams) && upstreams.length > 0) {
    checkObject('federation.upstreams[0]', upstreams[0] as Record<string, unknown>, UPSTREAM_CONTRACT, report)
  }
  if (state.discovery && kindOf(state.discovery) === 'object') {
    checkObject('federation.discovery', state.discovery as Record<string, unknown>, DISCOVERY_CONTRACT, report)
  }
  return report
}

/** The same, for /api/auth-hint. */
export function checkAuthHint(body: unknown): ContractReport {
  const report: ContractReport = { breaks: [], unknown: [] }
  if (kindOf(body) !== 'object') {
    report.breaks.push(`/api/auth-hint returned ${kindOf(body)}, not an object`)
    return report
  }
  checkObject('authHint', body as Record<string, unknown>, AUTH_HINT_CONTRACT, report)
  return report
}
