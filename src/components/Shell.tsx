// The application shell: brand, freshness, identity controls, navigation, footer.
//
// The old console was one scrolling page, which is why everything on it had to
// be visible at once. A persistent sidebar over a routed content area is the
// piece that makes more than one view possible, and nearly everything else in
// this console depends on it. Navigation is a list of routes; the top bar holds
// only what applies to every route — how current the data is, and who you are.
import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { ComponentChildren } from 'preact'
import { Wordmark } from './Wordmark'
import { Palette } from './Palette'
import { useMcp } from './McpProvider'
import type { FederationState } from '@/lib/federation'
import { FreshnessIndicator } from './Freshness'
import { useSession, setToken, clearToken } from '@/lib/session'
import { displayVersion } from '@/lib/version'
import type { AuthHint } from '@/lib/oauth'

interface NavItem {
  to: string
  label: string
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview' },
  { to: '/upstreams', label: 'Upstreams' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/test', label: 'Test console' },
]

interface Props {
  /** The snapshot, for the palette's upstream entries. */
  federation: FederationState | undefined
  version: string | undefined
  authRequired: boolean | undefined
  hint: AuthHint | null
  onSignIn: () => void
  onRefresh: () => void
  refreshing: boolean
  updatedAt: number
  failed: boolean
  /** The current route's name, announced on navigation. */
  section: string
  children: ComponentChildren
}

export function Shell({
  federation,
  version,
  authRequired,
  hint,
  onSignIn,
  onRefresh,
  refreshing,
  updatedAt,
  failed,
  section,
  children,
}: Props) {
  const session = useSession()
  const mcp = useMcp()
  const [palette, setPalette] = useState(false)
  const [draft, setDraft] = useState('')

  // Owned here rather than in the dialog, so the shortcut works before it has
  // ever been opened. Ctrl as well as Meta: an operator on Linux is the
  // common case for a self-hosted gateway, not the exception.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((open) => !open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const main = useRef<HTMLElement>(null)

  const signedIn = session.state === 'signed-in'
  // With auth off no token will ever be needed; a field that does nothing is
  // worse than no field. Before the first successful read authRequired is
  // undefined — show it, because an unauthorized gateway is exactly the case
  // where the operator needs somewhere to put a token.
  const showTokenField = !signedIn && authRequired !== false

  const apply = () => {
    setToken(draft)
    onRefresh()
  }

  return (
    <div class="shell">
      {/* A button, not an anchor: this console routes on the fragment, so an
          href="#main" would be read as a route and navigate away. */}
      <button type="button" class="skip" onClick={() => main.current?.focus()}>
        Skip to content
      </button>

      <header class="topbar">
        <Link to="/" className="brand" aria-label="fold console, overview">
          <Wordmark title="fold" descriptor="Console" />
          {version ? <span class="version muted">{displayVersion(version)}</span> : null}
        </Link>

        <div class="auth">
          <FreshnessIndicator updatedAt={updatedAt} fetching={refreshing} failed={failed} />

          <button type="button" onClick={() => setPalette(true)} aria-keyshortcuts="Meta+K Control+K">
            Jump to
          </button>

          {hint?.oauth && !signedIn ? (
            <button type="button" onClick={onSignIn}>
              Sign in
            </button>
          ) : null}
          {signedIn ? (
            <button
              type="button"
              onClick={() => {
                clearToken()
                onRefresh()
              }}
            >
              Sign out
            </button>
          ) : null}
          {showTokenField ? (
            <input
              type="password"
              value={draft}
              autocomplete="off"
              spellcheck={false}
              aria-label="Bearer token"
              placeholder={hint?.oauth ? '…or paste a Bearer token' : 'Bearer token'}
              // onInput only. preact/compat aliases React's onChange onto the
              // input event, so declaring both left one handler clobbering the
              // other: keystrokes were swallowed, `draft` never advanced past
              // empty, and a pasted token silently authenticated nothing. The
              // commit points are explicit below instead.
              onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
              onBlur={apply}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply()
              }}
            />
          ) : null}
          <button type="button" onClick={onRefresh} disabled={refreshing}>
            Refresh
          </button>
        </div>
      </header>

      <div class="body">
        <nav class="sidebar" aria-label="Console sections">
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  // activeProps matches the exact path only; an upstream detail
                  // page must still light up "Upstreams".
                  className={isActive(pathname, item.to) ? 'nav-link active' : 'nav-link'}
                  aria-current={isActive(pathname, item.to) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* tabIndex -1 so the skip control can move focus here without adding
            the element to the tab order. */}
        <main id="main" ref={main} tabIndex={-1}>
          {children}
        </main>
      </div>

      {palette ? (
        <Palette
          state={federation}
          catalog={mcp.catalog}
          onClose={() => setPalette(false)}
        />
      ) : null}

      <RouteAnnouncer section={section} />

      <footer>
        <div class="foot">
          <span class="legal">
            <Wordmark />© fold.run · the enterprise MCP gateway
          </span>
          <nav aria-label="fold project">
            <a href="https://fold.run/" rel="noopener">fold.run</a>
            <a href="https://docs.fold.run/" rel="noopener">Docs</a>
            <a href="https://github.com/fold-run/fold" rel="noopener">GitHub</a>
            <a href="https://fold.run/status/" rel="noopener">Status</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

/**
 * Announce route changes.
 *
 * A client-side navigation replaces the content under a screen reader without
 * saying anything; the user is left on a page that silently became a different
 * one. The title change alone does not announce in most combinations.
 */
function RouteAnnouncer({ section }: { section: string }) {
  const [message, setMessage] = useState('')
  const first = useRef(true)
  useEffect(() => {
    // The initial render is not a navigation, and announcing it would talk
    // over the page the user just arrived at.
    if (first.current) {
      first.current = false
      return
    }
    setMessage(`${section} page`)
  }, [section])

  return (
    <p class="visually-hidden" role="status" aria-live="polite">
      {message}
    </p>
  )
}

function isActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}
