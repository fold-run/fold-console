// Catalog: everything this principal can reach, as a searchable list.
//
// The old console put tools, prompts and resources in a <select>. A dropdown
// is a fine control for ten things and a wall for the several hundred a real
// federation exposes — you cannot search it, you cannot see a description
// without selecting, and you cannot tell which upstream a name came from.
//
// So the catalog gets the same list treatment the upstreams do: filter, sort,
// description in the row, and a link straight into the test console with the
// item already selected.
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, sortRows, type Column, type SortDir } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { Segmented } from '@/components/Segmented'
import { CopyButton } from '@/components/CopyButton'
import { useMcp } from '@/components/McpProvider'
import { rootRoute, useFederation } from './root'
import { MODES, MODE_ORDER, itemKey, type CatalogItem, type Mode } from '@/lib/mcp'
import { matches, orEmpty } from '@/lib/format'

interface Search {
  mode?: Mode
  q?: string
  sort?: string
  dir?: SortDir
}

function validateSearch(raw: Record<string, unknown>): Search {
  const mode = MODE_ORDER.includes(raw.mode as Mode) ? (raw.mode as Mode) : undefined
  const q = typeof raw.q === 'string' && raw.q ? raw.q : undefined
  const sort = typeof raw.sort === 'string' && raw.sort ? raw.sort : undefined
  const dir = raw.dir === 'asc' || raw.dir === 'desc' ? raw.dir : undefined
  return { ...(mode ? { mode } : {}), ...(q ? { q } : {}), ...(sort ? { sort } : {}), ...(dir ? { dir } : {}) }
}

/**
 * Split a federated name on the gateway's namespace separator.
 *
 * The gateway prefixes every upstream's tools with its namespace, so
 * "github__create_issue" is one string carrying two facts. Showing them as two
 * columns is what makes "which upstream is this from" answerable at a glance,
 * and it is why the separator is in the federation snapshot at all.
 */
function split(name: string, separator: string): { namespace: string; local: string } {
  const at = separator ? name.indexOf(separator) : -1
  if (at <= 0) return { namespace: '', local: name }
  return { namespace: name.slice(0, at), local: name.slice(at + separator.length) }
}

function Catalog() {
  const { state } = useFederation()
  const mcp = useMcp()
  const search = catalogRoute.useSearch()
  const navigate = useNavigate({ from: catalogRoute.fullPath })
  const mode: Mode = search.mode ?? 'tools'
  const separator = state?.namespaceSeparator ?? ''

  const setSearch = (patch: Partial<Search>) => {
    void navigate({ search: (prev: Search) => ({ ...prev, ...patch }), replace: true })
  }

  const columns = useMemo<Array<Column<CatalogItem>>>(
    () => [
      {
        key: 'name',
        header: mode === 'resources' ? 'URI' : 'Name',
        value: (item) => split(itemKey(mode, item), separator).local,
        render: (item) => (
          <Link
            to="/test"
            search={{ mode, item: itemKey(mode, item) }}
            className="cell-link"
            title={itemKey(mode, item)}
          >
            {split(itemKey(mode, item), separator).local}
          </Link>
        ),
      },
      {
        key: 'namespace',
        header: 'Namespace',
        value: (item) => split(itemKey(mode, item), separator).namespace,
        render: (item) => orEmpty(split(itemKey(mode, item), separator).namespace),
      },
      {
        key: 'description',
        header: 'Description',
        // Upstream-controlled text, rendered as a JSX child — escaped, never
        // parsed as markup. That invariant is the whole reason this repo bans
        // innerHTML in CI.
        value: (item) => item.description ?? item.title ?? '',
        render: (item) => orEmpty(item.description ?? item.title),
        wrap: true,
      },
      {
        key: 'copy',
        header: '',
        value: () => '',
        sortable: false,
        render: (item) => (
          <CopyButton value={itemKey(mode, item)} label={mode === 'resources' ? 'URI' : 'Name'} />
        ),
      },
    ],
    [mode, separator],
  )

  const items = mcp.catalog[mode]
  const rows = useMemo(() => {
    const filtered = items.filter((item) =>
      matches([itemKey(mode, item), item.title, item.description, item.mimeType], search.q ?? ''),
    )
    return sortRows(filtered, columns, search.sort, search.dir ?? 'asc')
  }, [items, columns, mode, search.q, search.sort, search.dir])

  const onSort = (key: string) => {
    if (search.sort === key) setSearch({ dir: search.dir === 'asc' ? 'desc' : 'asc' })
    else setSearch({ sort: key, dir: 'asc' })
  }

  return (
    <>
      <PageHeader
        title="Catalog"
        lede="Tools, prompts and resources visible to this principal — the same list any MCP client would receive."
        actions={
          <button type="button" class="primary" onClick={mcp.connect} disabled={mcp.status === 'connecting'}>
            {mcp.status === 'connecting' ? 'Connecting…' : mcp.status === 'ready' ? 'Reload catalog' : 'Connect & list'}
          </button>
        }
      >
        <div class="filters">
          <Segmented
            label="Capability"
            value={mode}
            onChange={(next) => setSearch({ mode: next, sort: undefined, dir: undefined })}
            options={MODE_ORDER.map((m) => ({
              value: m,
              label: MODES[m].label,
              count: mcp.status === 'ready' ? mcp.catalog[m].length : undefined,
            }))}
          />
          <input
            type="search"
            class="filter-text"
            placeholder="Filter by name, description, namespace…"
            aria-label="Filter catalog"
            value={search.q ?? ''}
            disabled={mcp.status !== 'ready'}
            onInput={(e) => setSearch({ q: (e.target as HTMLInputElement).value || undefined })}
          />
          {mcp.status === 'ready' ? (
            <span class="muted count">
              {rows.length} of {items.length}
            </span>
          ) : null}
        </div>
      </PageHeader>

      <DataTable
        caption={`${MODES[mode].label} visible to this principal`}
        columns={columns}
        rows={mcp.status === 'ready' ? rows : []}
        rowKey={(item) => itemKey(mode, item)}
        sort={search.sort}
        dir={search.dir ?? 'asc'}
        onSort={onSort}
        empty={emptyFor(mcp.status, mcp.error, items.length, Boolean(search.q), mode)}
      />
    </>
  )
}

function emptyFor(
  status: ReturnType<typeof useMcp>['status'],
  error: string | null,
  total: number,
  filtering: boolean,
  mode: Mode,
) {
  if (status === 'connecting') return 'Connecting to the gateway…'
  if (status === 'error') {
    return <EmptyState title="Could not list the catalog" hint={error ?? undefined} />
  }
  if (status === 'idle') {
    return (
      <EmptyState
        title="Not connected"
        hint="Connect to open an MCP session against the gateway and list what this principal may see."
      />
    )
  }
  if (filtering && total) return <EmptyState title="Nothing matches this filter" />
  return (
    <EmptyState
      title={`No ${MODES[mode].label.toLowerCase()} visible`}
      hint="Either no federated server exposes any, or policy denies this principal every one of them."
    />
  )
}

export const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catalog',
  validateSearch,
  component: Catalog,
})
