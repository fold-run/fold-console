// Sign-in: OAuth 2.1 Authorization Code + PKCE against the issuer fold names
// in /api/auth-hint.
//
// The console is a public client — no secret exists, and the PKCE verifier is
// the proof of possession. The access token never leaves page memory (see
// session.ts); the verifier, which is not a credential on its own, sits in
// sessionStorage for exactly the duration of the redirect round-trip and is
// removed the moment the page comes back.
//
// The CSP admits precisely two origins for fetches: this one, and the issuer's
// (fold derives that from config — never a wildcard). Discovery and the token
// exchange below are the only cross-origin requests the console makes, which
// is why they must go to the configured issuer and nowhere else.
import { AUTH_HINT_URL } from './federation'
import { setToken } from './session'

export interface OAuthHint {
  issuer: string
  clientId: string
  scopes?: string[]
}

export interface AuthHint {
  authRequired: boolean
  resource?: string
  oauth?: OAuthHint
}

const PKCE_KEY = 'fold-console-pkce'

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function fetchAuthHint(): Promise<AuthHint | null> {
  try {
    const res = await fetch(AUTH_HINT_URL)
    if (!res.ok) return null
    return (await res.json()) as AuthHint
  } catch {
    // The hint is an affordance, not a requirement — pasting a token still
    // works against a gateway that does not serve it.
    return null
  }
}

/**
 * Resolve authorization-server metadata: OIDC discovery first, then RFC 8414's
 * inserted-path form for plain OAuth servers that never speak OIDC.
 */
async function discoverAS(issuer: string): Promise<{ authorization_endpoint: string; token_endpoint: string }> {
  const iss = issuer.replace(/\/$/, '')
  const u = new URL(iss)
  const candidates = [
    `${iss}/.well-known/openid-configuration`,
    `${u.origin}/.well-known/oauth-authorization-server${u.pathname.replace(/\/$/, '')}`,
  ]
  for (const c of candidates) {
    try {
      const res = await fetch(c)
      if (!res.ok) continue
      const meta = (await res.json()) as { authorization_endpoint?: string; token_endpoint?: string }
      if (meta.authorization_endpoint && meta.token_endpoint) {
        return { authorization_endpoint: meta.authorization_endpoint, token_endpoint: meta.token_endpoint }
      }
    } catch {
      // try the next form
    }
  }
  throw new Error(`could not discover authorization server metadata for ${issuer}`)
}

// The redirect target is this page with no search and no fragment. It has to
// match byte-for-byte between the authorize request and the token exchange,
// and it has to be a URL the IdP's registered-redirect list can hold — which
// is the second reason this console routes on the fragment rather than the
// path. With history routing, every deep link would be a distinct redirect_uri
// an operator had to register.
function redirectUri(): string {
  return location.origin + location.pathname
}

export async function signIn(hint: AuthHint): Promise<void> {
  if (!hint.oauth) throw new Error('this gateway does not advertise an OAuth issuer')
  const meta = await discoverAS(hint.oauth.issuer)
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))

  sessionStorage.setItem(
    PKCE_KEY,
    JSON.stringify({ verifier, state, tokenEndpoint: meta.token_endpoint }),
  )

  const authz = new URL(meta.authorization_endpoint)
  authz.searchParams.set('response_type', 'code')
  authz.searchParams.set('client_id', hint.oauth.clientId)
  authz.searchParams.set('redirect_uri', redirectUri())
  authz.searchParams.set('code_challenge', b64url(new Uint8Array(digest)))
  authz.searchParams.set('code_challenge_method', 'S256')
  authz.searchParams.set('state', state)
  if (hint.oauth.scopes?.length) authz.searchParams.set('scope', hint.oauth.scopes.join(' '))
  if (hint.resource) authz.searchParams.set('resource', hint.resource) // RFC 8707
  location.assign(authz)
}

/**
 * Finish the flow when the page loads with ?code=… .
 *
 * The code and state are stripped from the URL and from history before
 * anything else happens, the saved verifier is single-use, and the resulting
 * token goes straight into page memory. Returns an error string to surface, or
 * null when there was nothing to do.
 */
export async function handleCallback(hint: AuthHint | null): Promise<string | null> {
  const q = new URLSearchParams(location.search)
  if (!q.has('code') && !q.has('error')) return null

  const savedRaw = sessionStorage.getItem(PKCE_KEY)
  sessionStorage.removeItem(PKCE_KEY)
  // Keep the fragment: it is the route, and dropping it would bounce an
  // operator who deep-linked into a detail page back to the overview after
  // every sign-in.
  history.replaceState(null, '', location.pathname + location.hash)

  if (q.has('error')) {
    const desc = q.get('error_description')
    return `sign-in failed: ${q.get('error')}${desc ? `: ${desc}` : ''}`
  }

  let saved: { verifier?: string; state?: string; tokenEndpoint?: string } | null = null
  try {
    saved = JSON.parse(savedRaw ?? 'null')
  } catch {
    // treated as missing
  }
  if (!saved?.state || saved.state !== q.get('state')) {
    return 'sign-in failed: state mismatch — start again from this page.'
  }
  if (!hint?.oauth || !saved.tokenEndpoint || !saved.verifier) {
    return 'sign-in failed: the gateway no longer advertises the issuer this flow started against.'
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: q.get('code') ?? '',
    redirect_uri: redirectUri(),
    client_id: hint.oauth.clientId,
    code_verifier: saved.verifier,
  })
  if (hint.resource) body.set('resource', hint.resource)

  try {
    const res = await fetch(saved.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const tok = (await res.json()) as {
      access_token?: string
      error?: string
      error_description?: string
    }
    if (!res.ok || !tok.access_token) {
      const desc = tok.error_description ? `: ${tok.error_description}` : ''
      return `token exchange failed: ${tok.error ?? `HTTP ${res.status}`}${desc}`
    }
    setToken(tok.access_token, 'signed-in')
    return null
  } catch (err) {
    return `token exchange failed: ${(err as Error).message}`
  }
}
