// The fold wordmark, kept byte-identical in shape to fold.run's.
//
// Outlined glyph paths derived from Black Ops One (SIL OFL 1.1, by James
// Grieshaber and Eben Sorkin): a heavy chamfered stencil whose 45-degree corner
// cuts carry the brand's folded-plane idea in the letters themselves, which is
// why it appears alone with no pictorial mark beside it. Spacing is fold's own,
// not the font's — tracked -70/em with per-pair kerning (fo -55, ol +10,
// ld -15) — and is already baked into these outlines.
//
// Shipped as paths rather than a webfont so the one element that must be
// identical on every fold surface never waits on a font load and never shifts,
// and so no font binary is redistributed. The licence still travels with it:
// see fonts/OFL.txt, which names Black Ops One alongside the two text faces.
//
// This replaces a stroked geometric mark that predated fold's 2026-08-10
// identity revision. The console had been shipping the previous lockup while
// its own stylesheet claimed to follow that revision.

/** Ink bounds of the composed word: ascender to baseline, f crossbar to d stem. */
export const WORDMARK_BOX = { width: 3997, height: 1467 } as const

export const WORDMARK_PATH =
  'M105 1467V670H0V405H105V248L372 0H868V265H548V1467ZM615 670 618 405H868V670ZM1104 1467 839 1202V670L1104 405H1401V670H1286V1219H1401V1467ZM1471 1467V1219H1581V670H1471V405H1767L2032 670V1202L1767 1467ZM2419 1467 2171 1219V0H2613V1202H2811V1467ZM3555 1467V0H3997V1467ZM3069 1467 2830 1228V644L3069 405H3485V670H3272V1219H3485V1362L3380 1467Z'

/**
 * Place the mark centred on (cx, cy) at a given width, in the user units of
 * whatever drawing is asking. The topology's gateway node needs the paths
 * inline: that node IS the product, so it carries the mark rather than the
 * mono label the generic nodes around it get.
 */
export function wordmarkTransform(cx: number, cy: number, width: number): string {
  const scale = width / WORDMARK_BOX.width
  const x = cx - width / 2
  const y = cy - (WORDMARK_BOX.height * scale) / 2
  return `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(5)})`
}

interface Props {
  /** Names the mark for assistive tech. Omit where it is decorative. */
  title?: string
  /** Adds the rule + descriptor lockup used in the header. */
  descriptor?: string
  className?: string
}

export function Wordmark({ title, descriptor, className }: Props) {
  return (
    <span class={className ? `wordmark ${className}` : 'wordmark'}>
      <svg
        class="wordmark-glyphs"
        viewBox={`0 0 ${WORDMARK_BOX.width} ${WORDMARK_BOX.height}`}
        fill="currentColor"
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : 'true'}
        focusable="false"
      >
        {title ? <title>{title}</title> : null}
        <path d={WORDMARK_PATH} />
      </svg>
      {descriptor ? (
        <>
          <span class="wordmark-rule" aria-hidden="true" />
          <span class="wordmark-descriptor">{descriptor}</span>
        </>
      ) : null}
    </span>
  )
}
