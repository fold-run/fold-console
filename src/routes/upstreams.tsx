// Upstreams: the federation as a list you can actually work.
//
// The old console rendered every upstream into one unsorted, unfiltered table.
// That is fine at three upstreams and unusable at fifty — which is the size
// fold is built for. So: a filter schema (free text plus the low-cardinality
// enums worth a dropdown), sortable columns, a defined empty state, and — the
// part that matters for an on-call operator — all of it in the URL, so "the
// broken upstream" is something you can paste into a chat rather than
// describe.
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, sortRows, type Column, type SortDir } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { DocsLink } from '@/components/DocsLink'
import { Segmented } from '@/components/Segmented'
import { Topology } from '@/components/Topology'
import { rootRoute, useFederation } from './root'
import type { UpstreamHealth } from '@/lib/federation'
import { latency, matches, orEmpty, ownerLine } from '@/lib/format'

type View = 'table' | 'map'

interface Search {
  view?: View
  q?: string
  source?: 'static' | 'discovered'
  status?: 'connected' | 'disconnected'
  sort?: string
  dir?: SortDir
}

// Hand-rolled rather than schema-validated: a validator library is a
// dependency, and this console's whole search surface is five strings from a
// closed set. Anything unrecognised is dropped, so a mangled link degrades to
// the default view instead of throwing on render.
function validateSearch(raw: Record<string, unknown>): Search {
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
  const q = typeof raw.q === 'string' && raw.q ? raw.q : undefined
  const sort = typeof raw.sort === 'string' && raw.sort ? raw.sort : undefined
  return {
    ...(raw.view === 'map' ? { view: 'map' as const } : {}),
    ...(q ? { q } : {}),
    ...(sort ? { sort } : {}),
    ...(pick(raw.source, ['static', 'discovered'] as const)
      ? { source: pick(raw.source, ['static', 'discovered'] as const) }
      : {}),
    ...(pick(raw.status, ['connected', 'disconnected'] as const)
      ? { status: pick(raw.status, ['connected', 'disconnected'] as const) }
      : {}),
    ...(pick(raw.dir, ['asc', 'desc'] as const) ? { dir: pick(raw.dir, ['asc', 'desc'] as const) } : {}),
  }
}

const breakerTone = (u: UpstreamHealth) =>
  // A half-open breaker is neither proven up nor failed. Live is a proof
  // signal and must not mark it; it reads on the neutral ramp instead.
  u.breaker === 'closed' ? 'ok' : u.breaker === 'open' ? 'bad' : 'warn'

function Upstreams() {
  const { state, isPending } = useFederation()
  const search = upstreamsRoute.useSearch()
  const navigate = useNavigate({ from: upstreamsRoute.fullPath })

  const setSearch = (patch: Partial<Search>) => {
    void navigate({ search: (prev: Search) => ({ ...prev, ...patch }), replace: true })
  }

  const columns = useMemo<Array<Column<UpstreamHealth>>>(
    () => [
      {
        key: 'id',
        header: 'Upstream',
        value: (u) => u.id,
        render: (u) => (
          <Link to="/upstreams/$id" params={{ id: u.id }} className="cell-link">
            {u.id}
          </Link>
        ),
      },
      { key: 'namespace', header: 'Namespace', value: (u) => u.namespace ?? '' , render: (u) => orEmpty(u.namespace) },
      { key: 'source', header: 'Source', value: (u) => u.source ?? '', render: (u) => orEmpty(u.source) },
      { key: 'auth', header: 'Auth', value: (u) => u.authStrategy ?? '', render: (u) => orEmpty(u.authStrategy) },
      {
        key: 'connected',
        header: 'Connected',
        value: (u) => (u.connected ? 1 : 0),
        render: (u) => (u.connected ? 'yes' : 'no'),
        tone: (u) => (u.connected ? 'ok' : 'bad'),
      },
      {
        key: 'breaker',
        header: 'Breaker',
        value: (u) => u.breaker ?? '',
        render: (u) => orEmpty(u.breaker),
        tone: (u) => (u.breaker === 'closed' ? undefined : breakerTone(u)),
      },
      {
        key: 'latency',
        header: 'Latency',
        // Sorting an unreachable upstream by latency is meaningless; sink it
        // to the bottom rather than letting a missing value read as 0 ms.
        value: (u) => (u.connected ? (u.latencyMs ?? 0) : Number.MAX_SAFE_INTEGER),
        render: (u) => (u.connected ? latency(u.latencyMs) : orEmpty(u.error)),
        tone: (u) => (u.connected ? undefined : 'warn'),
        wrap: true,
      },
      {
        key: 'owner',
        header: 'Owner',
        value: (u) => ownerLine(u.owner),
        render: (u) => ownerLine(u.owner),
      },
    ],
    [],
  )

  const all = state?.upstreams ?? []

  const filtered = useMemo(() => {
    const rows = all.filter((u) => {
      if (search.source && u.source !== search.source) return false
      if (search.status === 'connected' && !u.connected) return false
      if (search.status === 'disconnected' && u.connected) return false
      return matches(
        [
          u.id,
          u.namespace,
          u.url,
          u.authStrategy,
          u.owner?.org,
          u.owner?.team,
          ...Object.entries(u.labels ?? {}).map(([k, v]) => `${k}=${v}`),
        ],
        search.q ?? '',
      )
    })
    return sortRows(rows, columns, search.sort, search.dir ?? 'asc')
  }, [all, columns, search.q, search.source, search.status, search.sort, search.dir])

  const onSort = (key: string) => {
    if (search.sort === key) {
      setSearch({ dir: search.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      setSearch({ sort: key, dir: 'asc' })
    }
  }

  const filtering = Boolean(search.q || search.source || search.status)
  const view: View = search.view === 'map' ? 'map' : 'table'

  return (
    <>
      <PageHeader
        title="Upstreams"
        lede="Every MCP server this gateway federates, as the gateway last saw it."
        actions={<DocsLink topic="federation" version={state?.version}>Federation docs</DocsLink>}
      >
        <div class="filters">
          <Segmented
            label="View"
            value={view}
            onChange={(next) => setSearch({ view: next === 'map' ? 'map' : undefined })}
            options={[
              { value: 'table', label: 'Table' },
              { value: 'map', label: 'Map' },
            ]}
          />
          <input
            type="search"
            class="filter-text"
            placeholder="Filter by id, namespace, URL, owner, label…"
            aria-label="Filter upstreams"
            value={search.q ?? ''}
            onInput={(e) => setSearch({ q: (e.target as HTMLInputElement).value || undefined })}
          />
          <select
            class="filter-select"
            aria-label="Source"
            value={search.source ?? ''}
            onChange={(e) =>
              setSearch({ source: ((e.target as HTMLSelectElement).value || undefined) as Search['source'] })
            }
          >
            <option value="">Any source</option>
            <option value="static">Static</option>
            <option value="discovered">Discovered</option>
          </select>
          <select
            class="filter-select"
            aria-label="Connection status"
            value={search.status ?? ''}
            onChange={(e) =>
              setSearch({ status: ((e.target as HTMLSelectElement).value || undefined) as Search['status'] })
            }
          >
            <option value="">Any status</option>
            <option value="connected">Connected</option>
            <option value="disconnected">Disconnected</option>
          </select>
          {/* Announced, because filtering changes the result count without
              moving focus and a keyboard user gets no other signal. */}
          <output class="muted count" aria-live="polite">
            {filtered.length} of {all.length}
          </output>
        </div>
      </PageHeader>

      {view === 'map' && state && filtered.length > 0 ? (
        <Topology state={state} upstreams={filtered} />
      ) : (
      <DataTable
        caption="Federated upstreams"
        columns={columns}
        rows={filtered}
        rowKey={(u) => u.id}
        sort={search.sort}
        dir={search.dir ?? 'asc'}
        onSort={onSort}
        loading={isPending}
        empty={
          filtering ? (
            <EmptyState
              title="No upstream matches this filter"
              hint={
                <button type="button" class="linkish" onClick={() => setSearch({ q: undefined, source: undefined, status: undefined })}>
                  Clear the filter
                </button>
              }
            />
          ) : (
            <EmptyState
              title="No upstreams in the federation"
              hint="Add one under `upstreams` in the gateway config, or enable discovery."
            />
          )
        }
      />
      )}
    </>
  )
}

export const upstreamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upstreams',
  validateSearch,
  component: Upstreams,
})
