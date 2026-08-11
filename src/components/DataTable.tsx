// A sortable table with an empty state.
//
// A management UI would page and sort against the server. /api/federation
// hands over the whole federation in one snapshot, so sorting and filtering
// are local and instant — no cursor, no request per keystroke. What the table
// keeps from the server-side idiom is the discipline: every list has a defined
// empty state, sort is a property of the URL, and no column silently truncates
// without a way to see the full value.
import type { ComponentChildren } from 'preact'
import type { Tone } from './Card'

export interface Column<T> {
  key: string
  header: string
  /** The comparable projection. Also what free-text search reads. */
  value: (row: T) => string | number
  /** Optional richer cell. Falls back to value(). */
  render?: (row: T) => ComponentChildren
  tone?: (row: T) => Tone
  sortable?: boolean
  /** Long free text (errors, URLs) wraps rather than widening the table. */
  wrap?: boolean
}

export type SortDir = 'asc' | 'desc'

interface Props<T> {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string
  /** Sort state lives in the route's search params, so a sorted view is a link. */
  sort?: string
  dir?: SortDir
  onSort?: (key: string) => void
  onRowClick?: (row: T) => void
  empty: ComponentChildren
  caption?: string
}

export function sortRows<T>(rows: T[], columns: Array<Column<T>>, sort?: string, dir: SortDir = 'asc'): T[] {
  const col = columns.find((c) => c.key === sort)
  if (!col) return rows
  const factor = dir === 'desc' ? -1 : 1
  // Copied before sorting: rows come straight from the query cache, and
  // sorting in place would mutate what every other consumer is reading.
  return rows.slice().sort((a, b) => {
    const av = col.value(a)
    const bv = col.value(b)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor
  })
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  dir = 'asc',
  onSort,
  onRowClick,
  empty,
  caption,
}: Props<T>) {
  return (
    <div class="tablewrap">
      <table>
        {caption ? <caption class="visually-hidden">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort === col.key
              const sortable = onSort && col.sortable !== false
              return (
                <th
                  key={col.key}
                  aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {sortable ? (
                    <button type="button" class="th-sort" onClick={() => onSort(col.key)}>
                      {col.header}
                      <span class="sort-mark" aria-hidden="true">
                        {active ? (dir === 'asc' ? '↑' : '↓') : ''}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td class="empty-cell" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                class={onRowClick ? 'clickable' : undefined}
                // Keyboard reach comes from the link inside the first cell,
                // not from the row: a tabbable <tr> would put every row in the
                // tab order twice.
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    class={[col.tone?.(row), col.wrap ? 'wrap' : ''].filter(Boolean).join(' ') || undefined}
                  >
                    {col.render ? col.render(row) : col.value(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
