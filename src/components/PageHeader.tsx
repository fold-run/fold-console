import type { ComponentChildren } from 'preact'

interface Props {
  title: string
  /**
   * The way back out of a detail page, above the title — where the eye
   * already is when the answer to "wrong upstream" is to leave.
   */
  back?: ComponentChildren
  /** One sentence on what this page is, plus its docs link. */
  lede?: ComponentChildren
  /** Actions belong beside the title, not floating above the content. */
  actions?: ComponentChildren
  children?: ComponentChildren
}

/** Title, actions, supporting text — the same three slots on every page. */
export function PageHeader({ title, back, lede, actions, children }: Props) {
  return (
    <header class="page-head">
      {back}
      <div class="page-head-row">
        <h1>{title}</h1>
        {actions ? <div class="page-actions">{actions}</div> : null}
      </div>
      {lede ? <p class="muted lede">{lede}</p> : null}
      {children}
    </header>
  )
}
