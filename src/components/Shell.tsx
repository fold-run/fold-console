// The application shell: brand, identity controls, primary navigation, footer.
//
// The old console was one scrolling page, which is why everything on it had to
// be visible at once. A persistent sidebar over a routed content area is the
// piece that makes more than one view possible, and nearly everything else in
// this console depends on it. Navigation is a list of routes; the header holds
// the one control that affects every route (who you are) and nothing else.
import { Link, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import type { ComponentChildren } from 'preact'
import { Wordmark } from './Wordmark'
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
  version: string | undefined
  authRequired: boolean | undefined
  hint: AuthHint | null
  onSignIn: () => void
  onRefresh: () => void
  refreshing: boolean
  children: ComponentChildren
}

export function Shell({
  version,
  authRequired,
  hint,
  onSignIn,
  onRefresh,
  refreshing,
  children,
}: Props) {
  const session = useSession()
  const [draft, setDraft] = useState('')
  const pathname = useRouterState({ select: (s) => s.location.pathname })

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
      <header>
        <Link to="/" className="brand" aria-label="fold console, overview">
          <Wordmark title="fold" />
          <span class="wm-rule" aria-hidden="true" />
          <span class="wm-desc">Console</span>
          {version ? <span class="version muted">{displayVersion(version)}</span> : null}
        </Link>

        <div class="auth">
          {hint?.oauth && !signedIn ? (
            <button type="button" onClick={onSignIn}>
              Sign in
            </button>
          ) : null}
          {signedIn ? (
            <button type="button" onClick={() => { clearToken(); onRefresh() }}>
              Signed in ✓ — sign out
            </button>
          ) : null}
          {showTokenField ? (
            <input
              type="password"
              value={draft}
              autocomplete="off"
              spellcheck={false}
              aria-label="Bearer token"
              placeholder={hint?.oauth ? '…or paste a Bearer token' : 'Bearer token (if auth is required)'}
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
            {refreshing ? 'Refreshing…' : 'Refresh'}
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
                  // activeProps only matches the exact path; an upstream detail
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

        <main>{children}</main>
      </div>

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

function isActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}
