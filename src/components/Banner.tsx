import type { ComponentChildren } from 'preact'

export type BannerTone = 'bad' | 'warn'

interface Props {
  tone?: BannerTone
  /**
   * Interrupt a screen reader, or wait to be read in order. Default true.
   *
   * The distinction is not cosmetic. Unauthorized, version skew and a failed
   * read describe the *console* being degraded: they arrive unbidden and the
   * page beneath them is not what the operator asked for, so announcing them
   * is the point. A summary of the federation's own health is the opposite —
   * it is the answer to the question the operator navigated here to ask, and
   * hijacking the reader to deliver content they already requested is noise
   * dressed as urgency. It reads in document order instead.
   */
  announce?: boolean
  children: ComponentChildren
}

/**
 * A condition the operator may need to act on: unauthorized, version skew, a
 * failed sign-in. Conditions persist until they resolve — unlike a toast,
 * which reports an event and leaves.
 *
 * role="alert" is deliberate here and deliberately absent from the toast
 * region: this is the one thing on the page worth interrupting for.
 */
export function Banner({ tone = 'bad', announce = true, children }: Props) {
  return (
    <p class={`banner ${tone}`} role={announce ? 'alert' : undefined}>
      {children}
    </p>
  )
}
