import type { ComponentChildren } from 'preact'

export type BannerTone = 'bad' | 'warn'

interface Props {
  tone?: BannerTone
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
export function Banner({ tone = 'bad', children }: Props) {
  return (
    <p class={`banner ${tone}`} role="alert">
      {children}
    </p>
  )
}
