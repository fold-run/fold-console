import { render } from 'preact'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { ToastProvider } from './components/Toaster'
import { AUTH_HINT_KEY, setBootstrap } from './lib/bootstrap'
import { fetchAuthHint, handleCallback } from './lib/oauth'
import './styles/app.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The federation snapshot is a live reading, not a document: refetching
      // when the operator comes back to the tab is the behaviour they expect
      // from a dashboard, and it costs one request.
      refetchOnWindowFocus: true,
      staleTime: 5_000,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  )
}

// The OAuth callback is consumed before the first paint: the code and state
// leave the URL and history immediately, and the token is in memory before any
// query runs — otherwise a returning operator watches a 401 banner flash past
// on the way to a page that was always going to work.
async function bootstrap() {
  const hint = await fetchAuthHint()
  const signInError = await handleCallback(hint)
  setBootstrap(hint, signInError)
  queryClient.setQueryData(AUTH_HINT_KEY, hint)

  const root = document.getElementById('app')
  if (!root) throw new Error('#app is missing from index.html')
  render(<App />, root)
}

void bootstrap()
