// The route tree.
//
// Routing is on the fragment (`/console/#/upstreams`), not the path, and that
// is a deployment constraint rather than a preference. fold serves these
// assets from an http.FileServer over an embedded FS: there is no SPA
// fallback, so GET /console/upstreams is a 404 in every shipped binary, and
// this repo cannot add one — the server lives in another repo, behind a
// reviewed vendoring step. Hash routing makes every deep link a request for
// /console/ that the file server already answers.
//
// It also keeps the OAuth redirect_uri to a single value. With history
// routing, every deep link would be a distinct redirect target an operator had
// to register with their IdP.
import { createHashHistory, createRouter } from '@tanstack/react-router'
import { rootRoute } from './routes/root'
import { overviewRoute } from './routes/overview'
import { upstreamsRoute } from './routes/upstreams'
import { upstreamDetailRoute } from './routes/upstreamDetail'
import { catalogRoute } from './routes/catalog'
import { testConsoleRoute } from './routes/testConsole'

const routeTree = rootRoute.addChildren([
  overviewRoute,
  upstreamsRoute,
  upstreamDetailRoute,
  catalogRoute,
  testConsoleRoute,
])

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  // Every route reads from one already-cached snapshot, so there is nothing
  // to prefetch and no code to split — the bundle is one chunk by necessity
  // (fold's manifest names exactly one .js file).
  defaultPreload: false,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
