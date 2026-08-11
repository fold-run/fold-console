import type { ComponentChildren } from 'preact'

export type Tone = 'ok' | 'bad' | 'warn' | undefined

interface CardProps {
  label: string
  value: ComponentChildren
  tone?: Tone
  /** Long values (URLs, error text) wrap instead of forcing a scrollbar. */
  wrap?: boolean
}

/** One labelled fact. The unit the overview and detail pages are built from. */
export function Card({ label, value, tone, wrap }: CardProps) {
  return (
    <div class="card">
      <span class="label">{label}</span>
      <b class={[tone, wrap ? 'wrap' : ''].filter(Boolean).join(' ') || undefined}>{value}</b>
    </div>
  )
}

interface GroupProps {
  /**
   * Facts belong under a heading rather than thirty of them landing in one
   * grid; at fold's card count that is the difference between a dashboard and
   * a wall of monospace.
   */
  title: string
  children: ComponentChildren
  action?: ComponentChildren
}

export function CardGroup({ title, children, action }: GroupProps) {
  return (
    // The group's heading is also its accessible name, so the overview reads
    // as a handful of navigable regions rather than one undifferentiated run
    // of cards.
    <section class="group" aria-label={title}>
      <div class="group-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div class="cards">{children}</div>
    </section>
  )
}
