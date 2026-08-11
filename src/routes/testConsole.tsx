// The test console: invoke one thing and read exactly what came back.
//
// Calls go through the gateway's own MCP endpoint, so policy, rate limits,
// tenancy and audit apply exactly as they do for any other client. There is no
// privileged path here, and that is the point — a call that works in this
// panel is a call that works from a real client.
//
// What is new relative to the old console: the selection lives in the URL, so
// "run this and tell me what you see" is a link; the argument box is
// pre-filled from the tool's own inputSchema instead of an empty textarea; and
// the wire log survives navigation, because it belongs to the session.
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { JsonPane } from '@/components/JsonPane'
import { EmptyState } from '@/components/EmptyState'
import { Segmented } from '@/components/Segmented'
import { useMcp } from '@/components/McpProvider'
import { rootRoute } from './root'
import {
  MODES,
  MODE_ORDER,
  argumentSkeleton,
  itemKey,
  type Mode,
} from '@/lib/mcp'
import { pretty } from '@/lib/format'

interface Search {
  mode?: Mode
  item?: string
}

function validateSearch(raw: Record<string, unknown>): Search {
  const mode = MODE_ORDER.includes(raw.mode as Mode) ? (raw.mode as Mode) : undefined
  const item = typeof raw.item === 'string' && raw.item ? raw.item : undefined
  return { ...(mode ? { mode } : {}), ...(item ? { item } : {}) }
}

function TestConsole() {
  const mcp = useMcp()
  const search = testConsoleRoute.useSearch()
  const navigate = useNavigate({ from: testConsoleRoute.fullPath })
  const mode: Mode = search.mode ?? 'tools'
  const spec = MODES[mode]

  const items = mcp.catalog[mode]
  const selected = search.item && items.some((i) => itemKey(mode, i) === search.item)
    ? search.item
    : (items[0] ? itemKey(mode, items[0]) : '')
  const item = items.find((i) => itemKey(mode, i) === selected)

  const [args, setArgs] = useState('')
  const [result, setResult] = useState('')
  const [callError, setCallError] = useState<string | null>(null)
  const [calling, setCalling] = useState(false)

  // A new selection gets that item's own skeleton. Editing then belongs to the
  // operator: this must not fire on every keystroke, only when the identity of
  // what is being called changes.
  useEffect(() => {
    setArgs(spec.args ? argumentSkeleton(item) : '')
    setResult('')
    setCallError(null)
  }, [mode, selected, spec.args, item])

  const setSearch = (patch: Partial<Search>) => {
    void navigate({ search: (prev: Search) => ({ ...prev, ...patch }), replace: true })
  }

  const wireText = useMemo(
    () => mcp.wire.map((e) => `${e.direction} ${pretty(e.message)}`).join('\n\n'),
    [mcp.wire],
  )

  const invoke = async () => {
    if (!mcp.client || !selected) return
    setCallError(null)
    setResult('')

    let parsed: Record<string, unknown> = {}
    if (spec.args) {
      const raw = args.trim()
      if (raw) {
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>
        } catch (err) {
          setCallError(`Arguments are not valid JSON: ${(err as Error).message}`)
          return
        }
      }
    }

    setCalling(true)
    try {
      setResult(pretty(await mcp.client.invoke(mode, selected, parsed)))
    } catch (err) {
      // A tool that returns an error is a result, not a page failure: show it
      // in the result pane where the operator is already looking.
      setResult((err as Error).message)
    } finally {
      setCalling(false)
    }
  }

  const notReady = mcp.status !== 'ready'

  return (
    <>
      <PageHeader
        title="Test console"
        lede="Calls go through the gateway's own MCP endpoint — policy, rate limits, and audit apply exactly as they do for any other client."
        actions={
          <button type="button" onClick={mcp.connect} disabled={mcp.status === 'connecting'}>
            {mcp.status === 'connecting' ? 'Connecting…' : mcp.status === 'ready' ? 'Reconnect' : 'Connect & list'}
          </button>
        }
      />

      {mcp.status === 'error' ? <p class="banner bad" role="alert">{mcp.error}</p> : null}

      {mcp.status === 'idle' ? (
        <EmptyState
          title="Not connected"
          hint="Connect to open an MCP session, or browse what is available in the catalog first."
        />
      ) : null}

      <div class="filters">
        <Segmented
          label="What to invoke"
          value={mode}
          onChange={(next) => setSearch({ mode: next, item: undefined })}
          options={MODE_ORDER.map((m) => ({
            value: m,
            label: MODES[m].label,
            count: mcp.status === 'ready' ? mcp.catalog[m].length : undefined,
            disabled: notReady,
          }))}
        />
        <Link to="/catalog" search={{ mode }} className="linkish">
          Browse the catalog →
        </Link>
      </div>

      <label class="field">
        <span class="field-label">{mode === 'resources' ? 'Resource' : mode === 'prompts' ? 'Prompt' : 'Tool'}</span>
        <select
          value={selected}
          disabled={notReady || items.length === 0}
          onChange={(e) => setSearch({ item: (e.target as HTMLSelectElement).value })}
        >
          {items.length === 0 ? <option value="">Nothing available</option> : null}
          {items.map((i) => {
            const key = itemKey(mode, i)
            return (
              <option key={key} value={key}>
                {mode === 'resources' && i.name ? `${key} (${i.name})` : key}
              </option>
            )
          })}
        </select>
      </label>

      {item?.description ? <p class="itemdesc muted">{item.description}</p> : null}

      <label class="field">
        <span class="field-label">
          Arguments
          {item?.inputSchema?.required?.length ? (
            <span class="muted"> · required: {item.inputSchema.required.join(', ')}</span>
          ) : null}
        </span>
        <textarea
          rows={8}
          spellcheck={false}
          disabled={notReady || !spec.args}
          value={args}
          placeholder={
            spec.args
              ? '{"argument": "value"}'
              : 'resources/read takes no arguments — the URI is the identity'
          }
          onInput={(e) => setArgs((e.target as HTMLTextAreaElement).value)}
        />
      </label>

      {callError ? <p class="banner bad" role="alert">{callError}</p> : null}

      <div class="row">
        <button
          type="button"
          class="primary"
          disabled={notReady || !selected || calling}
          onClick={() => void invoke()}
        >
          {calling ? 'Calling…' : spec.verb}
        </button>
      </div>

      <JsonPane
        title="Result"
        copyLabel="Result"
        text={result}
        placeholder="Nothing yet — connect and call a tool."
      />

      <JsonPane
        title="Wire log"
        copyLabel="Wire log"
        text={wireText}
        placeholder="Every JSON-RPC message this session sends and receives appears here."
        tall
        actions={
          <button type="button" class="copy" onClick={mcp.clearWire} disabled={mcp.wire.length === 0}>
            Clear
          </button>
        }
      />
    </>
  )
}

export const testConsoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/test',
  validateSearch,
  component: TestConsole,
})
