// The fold wordmark, drawn rather than set in a webfont, and never paired with
// a pictorial mark. Two sizes, one path set.
interface Props {
  /** Decorative marks are hidden from assistive tech; the titled one is not. */
  title?: string
  className?: string
}

export function Wordmark({ title, className = 'wordmark' }: Props) {
  return (
    <svg
      class={className}
      viewBox="0 0 44.3 19.1"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d="M4.2 19 V6.3 A4.8 4.8 0 0 1 9 1.5" />
      <path d="M0 8.4 H8.6" />
      <circle cx="18" cy="13" r="4.6" />
      <path d="M28 0 V19" />
      <circle cx="38.2" cy="13" r="4.6" />
      <path d="M42.8 0 V19" />
    </svg>
  )
}
