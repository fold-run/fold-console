// How current the snapshot on screen is.
//
// The console polls every 15 s, and before this there was no way to tell a live
// reading from one frozen ten minutes ago by a dead tab or a gateway that
// stopped answering. On an observability surface that is the difference between
// evidence and a screenshot, so it sits in the top bar next to the refresh
// control rather than buried on one route.
//
// The dot is the one place outside status-up and the focus ring that Live is
// spent, and it is spent correctly: a lit dot is a claim that this data is
// proven current. Anything less certain drops to the neutral ramp.
import { useEffect, useState } from 'react'

export type Freshness = 'live' | 'fetching' | 'stale' | 'failed'

interface Props {
  /** ms epoch of the last successful read, 0 before the first one. */
  updatedAt: number
  fetching: boolean
  failed: boolean
}

/** Past this, a reading is old enough that it should stop claiming to be live. */
const STALE_AFTER_MS = 45_000

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

export function FreshnessIndicator({ updatedAt, fetching, failed }: Props) {
  // A relative time that never updates is a lie that grows. Re-render on a
  // slow tick of its own; the query's own cadence is not enough, because a
  // failed poll leaves updatedAt untouched while the label must keep aging.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [])

  if (!updatedAt && !failed) return null

  const age = now - updatedAt
  const state: Freshness = failed ? 'failed' : fetching ? 'fetching' : age > STALE_AFTER_MS ? 'stale' : 'live'

  const label =
    state === 'failed'
      ? 'not updating'
      : state === 'fetching'
        ? 'refreshing'
        : ago(age)

  return (
    <p class="freshness" data-state={state}>
      <span class="dot" aria-hidden="true" />
      {/* The visible text is terse; the full sentence goes to assistive tech,
          where "12s ago" on its own says nothing about what is 12s old. */}
      <span class="visually-hidden">
        {state === 'failed'
          ? 'The federation snapshot is not updating.'
          : `Federation snapshot ${state === 'fetching' ? 'refreshing now' : `last updated ${label}`}.`}
      </span>
      <span aria-hidden="true">{label}</span>
    </p>
  )
}
