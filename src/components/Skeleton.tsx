// Loading placeholders shaped like the thing that is coming.
//
// The console previously said "Reading the federation snapshot…" in the middle
// of an otherwise empty page, which tells the operator nothing about what they
// are waiting for and guarantees a layout jump when it arrives. A skeleton in
// the shape of the answer removes both problems, and on a fast local gateway it
// is gone before it is consciously seen.
//
// aria-hidden throughout: the live region on the surrounding component is what
// announces "loading", and a screen reader reading out a dozen empty boxes is
// worse than silence.

interface CardsProps {
  /** How many placeholder cards. Match the group it stands in for. */
  count?: number
}

export function SkeletonCards({ count = 4 }: CardsProps) {
  return (
    <div class="cards" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} class="card skeleton-card">
          <span class="skeleton skeleton-label" />
          <span class="skeleton skeleton-value" />
        </div>
      ))}
    </div>
  )
}

interface RowsProps {
  columns: number
  rows?: number
}

export function SkeletonRows({ columns, rows = 3 }: RowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c}>
              <span class="skeleton skeleton-cell" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
