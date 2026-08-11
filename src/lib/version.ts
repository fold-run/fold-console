// Version skew between this console and the gateway serving it.
//
// The two ship separately: fold vendors these assets at a pinned commit and
// bumps that pin on its own schedule, so an operator can be running a console
// built against endpoints their gateway does not have — or a gateway that
// reports fields this console has never heard of. The fix is a version-gated
// feature check: every gateway-dependent surface names the version that
// introduced it, and asks before it renders.
//
// The rule everywhere below: a feature the gateway is too old for is *absent*,
// never broken. Absence is a card that does not render. It is never a banner
// unless the operator cannot get their job done.

/** The oldest fold that serves /api/federation and /api/auth-hint. */
export const MIN_GATEWAY = '1.9.0'

/** Gateway features this console knows how to render, and when fold gained them. */
export const FEATURES = {
  /** federationState.consoleSource — which console commit is embedded. */
  consoleSource: '1.9.0',
  /** federationState.tenant* — per-tenant governance in the snapshot. */
  tenantGovernance: '1.9.0',
} as const

export type Feature = keyof typeof FEATURES

/**
 * Parse a fold version into comparable parts.
 *
 * Development builds report "dev" and pre-releases carry a `-rc1` suffix. Both
 * are treated as "at least the release they are cut from", because gating a
 * feature off for someone running a release candidate of the version that
 * introduced it is the wrong answer.
 */
function parse(version: string | undefined): [number, number, number] | null {
  if (!version) return null
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim())
  if (!m) return null // "dev" and friends — unknowable, treated as current
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
}

export function compareVersions(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/**
 * Does this gateway have the feature?
 *
 * An unparseable version ("dev") answers yes. A developer running a build off
 * main is the one person who most needs to see new surfaces, and hiding them
 * would make every local session look like a regression.
 */
export function supports(gatewayVersion: string | undefined, feature: Feature): boolean {
  if (!parse(gatewayVersion)) return true
  return compareVersions(gatewayVersion!, FEATURES[feature]) >= 0
}

/**
 * The one skew case worth interrupting an operator for: a gateway older than
 * the endpoints this console is built against. Everything else degrades
 * silently. Returns null when there is nothing to say.
 */
export function skewWarning(gatewayVersion: string | undefined): string | null {
  if (!parse(gatewayVersion)) return null
  if (compareVersions(gatewayVersion!, MIN_GATEWAY) >= 0) return null
  return (
    `This console needs fold ${MIN_GATEWAY} or newer; the gateway reports ${gatewayVersion}. ` +
    'Parts of this page will be empty. Upgrade the gateway, or use the console bundled with it.'
  )
}

/** "1.9.3" → "1.9" — the docs are published per minor line. */
export function minorLine(version: string | undefined): string {
  const p = parse(version)
  return p ? `${p[0]}.${p[1]}` : 'latest'
}

/** Display form: releases get a leading v, "dev" is left alone. */
export function displayVersion(version: string | undefined): string {
  if (!version) return ''
  return /^\d/.test(version) ? `v${version}` : version
}
