interface Option<T extends string> {
  value: T
  label: string
  /** Counts turn the control into a summary: "Tools 42 · Prompts 0". */
  count?: number
  disabled?: boolean
}

interface Props<T extends string> {
  options: Array<Option<T>>
  value: T
  onChange: (value: T) => void
  label: string
}

/**
 * A selection within a group, not an action: it lifts one background step and
 * brightens its border rather than taking an Action fill, which would put
 * three of the brightest elements on the page in a row.
 */
export function Segmented<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          class={opt.value === value ? 'active' : undefined}
          aria-pressed={opt.value === value}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
          {opt.count === undefined ? null : <span class="seg-count">{opt.count}</span>}
        </button>
      ))}
    </div>
  )
}
