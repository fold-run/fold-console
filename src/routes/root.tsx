// The root route: everything every page needs, fetched once.
//
// The federation snapshot is one query shared by every route. The cheaper
// version of this — a store refreshed from a router guard — gets the sharing
// but none of the rest: a single in-flight request no matter how many
// components ask, background polling that pauses when the tab is hidden, and a
// retry rule that distinguishes "the network blipped" from "you are not
// allowed to read this".
import { createContext } from 'preact'
import { useCallback, useContext, useEffect, useState } from 'react'
import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Shell } from '@/components/Shell'
import { Banner } from '@/components/Banner'
import { McpProvider } from '@/components/McpProvider'
import { EmptyState } from '@/components/EmptyState'
import { ApiError, federationQuery, type FederationState } from '@/lib/federation'
import { fetchAuthHint, signIn } from '@/lib/oauth'
import { skewWarning } from '@/lib/version'
import { AUTH_HINT_KEY, getInitialSignInError } from '@/lib/bootstrap'
import { useSession } from '@/lib/session'

interface FederationContextValue {
  state: FederationState | undefined
  error: ApiError | null
  isPending: boolean
}

const FederationContext = createContext<FederationContextValue>({
  state: undefined,
  error: null,
  isPending: true,
})

export function useFederation() {
  return useContext(FederationContext)
}

/** Page titles, one per route. Also what the route announcer reads out. */
const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/upstreams': 'Upstreams',
  '/catalog': 'Catalog',
  '/test': 'Test console',
}

function sectionFor(pathname: string): string {
  return TITLES[pathname] ?? (pathname.startsWith('/upstreams/') ? 'Upstream' : 'Not found')
}

function RootLayout() {
  const queryClient = useQueryClient()
  const session = useSession()
  const [signInError, setSignInError] = useState<string | null>(getInitialSignInError())

  const { data: hint = null } = useQuery({
    queryKey: AUTH_HINT_KEY,
    queryFn: fetchAuthHint,
    staleTime: Infinity,
  })

  const federation = useQuery({
    ...federationQuery,
    // The snapshot is per-principal. Keying on the token means pasting a new
    // one is a different query rather than a stale cache entry silently
    // reused under a new identity.
    queryKey: ['federation', session.token ? 'authed' : 'anon'] as const,
  })

  const error = federation.error instanceof ApiError ? federation.error : null

  const refresh = useCallback(() => {
    setSignInError(null)
    void queryClient.invalidateQueries({ queryKey: ['federation'] })
  }, [queryClient])

  const onSignIn = useCallback(() => {
    setSignInError(null)
    signIn(hint!).catch((err: unknown) => setSignInError(`Sign-in failed: ${(err as Error).message}`))
  }, [hint])

  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const section = sectionFor(pathname)
  useEffect(() => {
    document.title = `${section} · fold console`
  }, [section])

  const skew = skewWarning(federation.data?.version)

  return (
    <FederationContext.Provider
      value={{ state: federation.data, error, isPending: federation.isPending }}
    >
      <McpProvider mcpPath={federation.data?.mcpPath} gatewayVersion={federation.data?.version}>
        <Shell
          federation={federation.data}
          version={federation.data?.version}
          authRequired={federation.data?.authRequired}
          hint={hint}
          onSignIn={onSignIn}
          onRefresh={refresh}
          refreshing={federation.isFetching}
          updatedAt={federation.dataUpdatedAt}
          failed={Boolean(error)}
          section={section}
        >
          {signInError ? <Banner>{signInError}</Banner> : null}
          {error ? <Banner>{error.message}</Banner> : null}
          {skew ? <Banner tone="warn">{skew}</Banner> : null}

          {/* A terminal error means there is no snapshot to draw any page
              from. Rendering the route anyway would give every panel its own
              empty state, saying nothing the banner has not already said. */}
          {error?.terminal ? (
            <EmptyState
              title="No federation snapshot"
              hint="The gateway answered, but not with data this principal may read."
            />
          ) : (
            <Outlet />
          )}
        </Shell>
      </McpProvider>
    </FederationContext.Provider>
  )
}

function NotFound() {
  return (
    <EmptyState
      title="No such page"
      hint="That route is not part of the console. Pick a section from the sidebar."
    />
  )
}

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
})
