// A minimal streamable-HTTP MCP client pointed at the gateway's own endpoint:
// initialize → notifications/initialized → tools|prompts|resources/list →
// tools/call. Responses arrive either as plain JSON or as an SSE stream on the
// POST response; both are handled.
//
// This is an ordinary client. It holds no privileged path — policy, rate
// limits, tenancy and audit apply to it exactly as they do to any other caller
// of /mcp, which is the point: what you see here is what a real client sees.
import { authHeaders } from './session'

export type Mode = 'tools' | 'prompts' | 'resources'

export interface ModeSpec {
  list: string
  listKey: string
  call: string
  verb: string
  /** resources/read takes no arguments — the URI is the identity. */
  args: boolean
  label: string
}

export const MODES: Record<Mode, ModeSpec> = {
  tools: { list: 'tools/list', listKey: 'tools', call: 'tools/call', verb: 'Call tool', args: true, label: 'Tools' },
  prompts: { list: 'prompts/list', listKey: 'prompts', call: 'prompts/get', verb: 'Get prompt', args: true, label: 'Prompts' },
  resources: { list: 'resources/list', listKey: 'resources', call: 'resources/read', verb: 'Read resource', args: false, label: 'Resources' },
}

export const MODE_ORDER: Mode[] = ['tools', 'prompts', 'resources']

export interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  description?: string
  default?: unknown
}

export interface CatalogItem {
  name?: string
  uri?: string
  title?: string
  description?: string
  mimeType?: string
  inputSchema?: JsonSchema
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
}

export type Catalog = Record<Mode, CatalogItem[]>

export const EMPTY_CATALOG: Catalog = { tools: [], prompts: [], resources: [] }

/** The invocable identity: name for tools and prompts, uri for resources. */
export function itemKey(mode: Mode, item: CatalogItem): string {
  return (mode === 'resources' ? item.uri : item.name) ?? ''
}

export interface WireEntry {
  id: number
  direction: '→' | '←'
  message: unknown
}

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
}

/**
 * A connected session against the gateway's MCP endpoint.
 *
 * The wire log is exposed as an external store rather than component state so
 * that a request started on one route keeps logging when the operator
 * navigates to another — the log is a property of the session, not of the page
 * that happens to be mounted.
 */
export class McpClient {
  private sessionId: string | null = null
  private protocolVersion: string | null = null
  private nextId = 0
  private wire: WireEntry[] = []
  private wireSeq = 0
  private listeners = new Set<() => void>()

  constructor(private readonly path: string, private readonly clientVersion: string) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getWire = (): WireEntry[] => this.wire

  clearWire = () => {
    this.wire = []
    this.emit()
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  private log(direction: '→' | '←', message: unknown) {
    // Bounded: a chatty upstream that streams progress notifications for
    // minutes must not grow this array until the tab dies.
    const next = this.wire.concat({ id: this.wireSeq++, direction, message })
    this.wire = next.length > 400 ? next.slice(next.length - 400) : next
    this.emit()
  }

  /** One SSE-or-JSON POST exchange. Returns the result matching this request's id. */
  private async rpc(method: string, params?: unknown, notification = false): Promise<unknown> {
    const msg: JsonRpcMessage = { jsonrpc: '2.0', method }
    if (params !== undefined) msg.params = params
    if (!notification) msg.id = ++this.nextId
    this.log('→', msg)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...authHeaders(),
    }
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId
    if (this.protocolVersion) headers['MCP-Protocol-Version'] = this.protocolVersion

    const res = await fetch(this.path, { method: 'POST', headers, body: JSON.stringify(msg) })
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid

    if (res.status === 202) return null // notification accepted
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`)
    }

    const ct = res.headers.get('content-type') ?? ''
    let reply: JsonRpcMessage | null = null

    if (ct.includes('text/event-stream')) {
      // The SDK ends the stream once the response is sent, so reading to the
      // end terminates. Events are blank-line separated; an event's payload is
      // its concatenated `data:` lines.
      const text = await res.text()
      for (const chunk of text.split(/\r?\n\r?\n/)) {
        const data = chunk
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).replace(/^ /, ''))
          .join('\n')
        if (!data) continue
        let m: JsonRpcMessage
        try {
          m = JSON.parse(data) as JsonRpcMessage
        } catch {
          continue
        }
        this.log('←', m)
        if (!notification && m.id === msg.id) reply = m
      }
    } else {
      reply = (await res.json()) as JsonRpcMessage
      this.log('←', reply)
    }

    if (notification) return null
    if (!reply) throw new Error(`no response for request ${msg.id} on the stream`)
    if (reply.error) throw new Error(`JSON-RPC ${reply.error.code}: ${reply.error.message}`)
    return reply.result
  }

  /**
   * Page through a list method until the cursor runs dry — bounded, so a
   * misbehaving server cannot loop the page forever. A server without the
   * capability answers method-not-found; that reads as an empty list.
   */
  private async fetchList(mode: Mode): Promise<CatalogItem[]> {
    const spec = MODES[mode]
    const items: CatalogItem[] = []
    let cursor: string | undefined
    for (let page = 0; page < 25; page++) {
      let res: { nextCursor?: string; [k: string]: unknown }
      try {
        res = (await this.rpc(spec.list, cursor ? { cursor } : {})) as typeof res
      } catch (err) {
        if (/-32601/.test((err as Error).message)) return []
        throw err
      }
      items.push(...((res[spec.listKey] as CatalogItem[] | undefined) ?? []))
      cursor = res.nextCursor
      if (!cursor) break
    }
    return items
  }

  /** initialize, then list everything this principal may see. */
  async connect(): Promise<Catalog> {
    this.sessionId = null
    this.protocolVersion = null
    this.nextId = 0

    const init = (await this.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'fold-console', version: this.clientVersion },
    })) as { protocolVersion?: string }
    this.protocolVersion = init.protocolVersion ?? null
    await this.rpc('notifications/initialized', undefined, true)

    const catalog: Catalog = { tools: [], prompts: [], resources: [] }
    for (const mode of MODE_ORDER) catalog[mode] = await this.fetchList(mode)
    return catalog
  }

  async invoke(mode: Mode, key: string, args: Record<string, unknown>): Promise<unknown> {
    const params = mode === 'resources' ? { uri: key } : { name: key, arguments: args }
    return this.rpc(MODES[mode].call, params)
  }
}

/**
 * A JSON skeleton for a tool's arguments, built from its inputSchema.
 *
 * A management UI would render a real form from this schema. fold has no
 * write API to submit one to, so the read-only equivalent is to hand the
 * operator a filled-in shape to edit. Only required properties are emitted —
 * a skeleton carrying every optional field is noise, and MCP servers reject
 * unexpected nulls more often than they reject omissions.
 */
export function argumentSkeleton(item: CatalogItem | undefined): string {
  const schema = item?.inputSchema
  if (schema?.properties) {
    const required = new Set(schema.required ?? [])
    const out: Record<string, unknown> = {}
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (required.size && !required.has(name)) continue
      out[name] = sampleFor(prop)
    }
    if (Object.keys(out).length) return JSON.stringify(out, null, 2)
  }
  if (item?.arguments?.length) {
    const out: Record<string, unknown> = {}
    for (const arg of item.arguments) {
      if (arg.required !== false) out[arg.name] = ''
    }
    if (Object.keys(out).length) return JSON.stringify(out, null, 2)
  }
  return ''
}

function sampleFor(prop: JsonSchema): unknown {
  if (prop.default !== undefined) return prop.default
  if (prop.enum?.length) return prop.enum[0]
  switch (prop.type) {
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return {}
    default:
      return ''
  }
}
