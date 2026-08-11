import type { ComponentChildren } from 'preact'

interface Props {
  title: string
  /**
   * What to do about it. An empty state that only says "no results" makes the
   * operator guess whether they are looking at a filter, a permission, or an
   * outage — the three cases fold can be in, which look identical without
   * this line.
   */
  hint?: ComponentChildren
}

export function EmptyState({ title, hint }: Props) {
  return (
    <div class="empty">
      <p class="empty-title">{title}</p>
      {hint ? <p class="muted">{hint}</p> : null}
    </div>
  )
}
