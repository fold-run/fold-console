// The MCP session, hoisted above the router.
//
// Connecting costs an initialize round-trip plus one list call per capability,
// so the session cannot belong to a page: an operator who connects on the
// catalog and walks over to the test console must not pay for it again, and
// must not find an empty picker there. One store, many routes — with the
// wrinkle that this store owns a live protocol session rather than a cache,
// so dropping it is a decision rather than a cheap re-fetch.
import { createContext } from 'preact'
import { useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ComponentChildren } from 'preact'
import { EMPTY_CATALOG, McpClient, type Catalog, type WireEntry } from '@/lib/mcp'
import { useSession } from '@/lib/session'

export type McpStatus = 'idle' | 'connecting' | 'ready' | 'error'

interface McpSession {
  status: McpStatus
  error: string | null
  catalog: Catalog
  client: McpClient | null
  connect: () => void
  disconnect: () => void
  wire: WireEntry[]
  clearWire: () => void
}

const noop = () => {}
const McpContext = createContext<McpSession>({
  status: 'idle',
  error: null,
  catalog: EMPTY_CATALOG,
  client: null,
  connect: noop,
  disconnect: noop,
  wire: [],
  clearWire: noop,
})

export function useMcp() {
  return useContext(McpContext)
}

/**
 * Resolve the gateway's MCP path against this page's base.
 *
 * The gateway reports a root-absolute path ("/mcp"). Using it as-is breaks the
 * moment the console sits behind a proxy that adds a prefix — the same reason
 * every /api call in this repo goes through "../api". "/mcp" becomes "../mcp",
 * which resolves to /mcp at the root and /fold/mcp behind a proxy adding
 * /fold.
 */
export function resolveMcpPath(mcpPath: string | undefined): string {
  const path = mcpPath && mcpPath.trim() ? mcpPath : '/mcp'
  return new URL(`..${path.startsWith('/') ? path : `/${path}`}`, location.href).pathname
}

interface Props {
  mcpPath: string | undefined
  gatewayVersion: string | undefined
  children: ComponentChildren
}

export function McpProvider({ mcpPath, gatewayVersion, children }: Props) {
  const [status, setStatus] = useState<McpStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG)
  const [client, setClient] = useState<McpClient | null>(null)
  const { token } = useSession()

  // Every connect() gets a generation. A slow initialize that resolves after
  // the operator has pasted a different token belongs to a session that no
  // longer exists, and must not overwrite the current catalog.
  const generation = useRef(0)

  const connect = useCallback(() => {
    const gen = ++generation.current
    const next = new McpClient(resolveMcpPath(mcpPath), gatewayVersion ?? 'dev')
    setClient(next)
    setStatus('connecting')
    setError(null)
    setCatalog(EMPTY_CATALOG)
    next
      .connect()
      .then((result) => {
        if (gen !== generation.current) return
        setCatalog(result)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (gen !== generation.current) return
        setError(`MCP connect failed: ${(err as Error).message}`)
        setStatus('error')
      })
  }, [mcpPath, gatewayVersion])

  const disconnect = useCallback(() => {
    generation.current++
    setClient(null)
    setCatalog(EMPTY_CATALOG)
    setStatus('idle')
    setError(null)
  }, [])

  // The catalog is "what this principal may see". A different token is a
  // different principal, so the previous answer is not merely stale — it is
  // about someone else. Drop it rather than showing it under a new identity.
  const lastToken = useRef(token)
  if (lastToken.current !== token) {
    lastToken.current = token
    if (status !== 'idle') queueMicrotask(disconnect)
  }

  const wire = useSyncExternalStore(
    client ? client.subscribe : () => noop,
    client ? client.getWire : () => EMPTY_WIRE,
  )

  const value = useMemo<McpSession>(
    () => ({
      status,
      error,
      catalog,
      client,
      connect,
      disconnect,
      wire,
      clearWire: client ? client.clearWire : noop,
    }),
    [status, error, catalog, client, connect, disconnect, wire],
  )

  return <McpContext.Provider value={value}>{children}</McpContext.Provider>
}

// A stable identity: useSyncExternalStore re-renders forever if the snapshot
// getter returns a fresh [] each call.
const EMPTY_WIRE: WireEntry[] = []
