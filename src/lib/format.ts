// Presentation helpers. Nothing here interprets a value — it only decides how
// an already-decided value reads.

/** The em dash this console uses for "the gateway did not report this". */
export const EMPTY = '—'

export function orEmpty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY
  return String(value)
}

export function latency(ms: number | undefined): string {
  if (ms === undefined) return EMPTY
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`
}

export function ownerLine(owner: { org?: string; team?: string } | undefined): string {
  if (!owner) return EMPTY
  const parts = [owner.org, owner.team].filter(Boolean)
  return parts.length ? parts.join(' / ') : EMPTY
}

/**
 * RFC 3339 from the gateway, rendered in the operator's own zone.
 *
 * Discovery timestamps are the one place this console shows a wall-clock time,
 * and an operator correlating it against their own logs needs it local. Bad
 * input passes through untouched rather than becoming "Invalid Date".
 */
export function timestamp(iso: string | undefined): string {
  if (!iso) return EMPTY
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function interval(ms: number | undefined): string {
  if (!ms) return '30 s (default)'
  return ms % 1000 === 0 ? `${ms / 1000} s` : `${ms} ms`
}

/** Stable JSON for the result and wire panes. */
export function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * Case-insensitive substring match across a row's searchable text.
 *
 * /api/federation is a single snapshot of the whole federation rather than a
 * pageable collection, so filtering is local. That is also what lets it be a
 * substring match: a server-side filter over a paged collection usually has to
 * settle for exact-match, and this one never does.
 */
export function matches(haystack: Array<string | undefined>, needle: string): boolean {
  const q = needle.trim().toLowerCase()
  if (!q) return true
  return haystack.some((h) => h?.toLowerCase().includes(q))
}
