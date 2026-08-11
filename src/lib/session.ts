// The operator's Bearer token.
//
// It lives in this module's closure and nowhere else: not localStorage, not
// sessionStorage, not a query cache, not the URL. A console that survives a
// reload is not worth a token sitting in a store that every script on the
// origin — and every browser extension with storage access — can read. The
// price is re-authenticating after a refresh, which is the correct trade for
// a credential that opens the whole federation.
//
// Components read it through useSession(); the store is external rather than
// React state so that non-component code (the MCP client, the fetch wrapper)
// can reach it without prop-drilling a token through every call site.
import { useSyncExternalStore } from 'react'

export type SignInState = 'anonymous' | 'pasted' | 'signed-in'

interface Session {
  token: string
  state: SignInState
}

let session: Session = { token: '', state: 'anonymous' }
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function getSession(): Session {
  return session
}

export function setToken(token: string, state: SignInState = 'pasted') {
  const trimmed = token.trim()
  session = { token: trimmed, state: trimmed ? state : 'anonymous' }
  emit()
}

export function clearToken() {
  session = { token: '', state: 'anonymous' }
  emit()
}

/** The Authorization header, or nothing when running against an open gateway. */
export function authHeaders(): Record<string, string> {
  return session.token ? { Authorization: `Bearer ${session.token}` } : {}
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSession)
}
