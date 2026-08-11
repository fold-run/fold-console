// A JSON / wire-log pane with a copy affordance.
//
// The obvious move here is an embedded editor. Monaco alone is roughly twenty
// times the entire byte budget these assets get inside a fold binary, so this
// renders what the old console did — pre-formatted text — and adds the two
// things an operator actually wanted from the editor: copy the whole payload,
// and a clear "nothing here yet" state.
//
// The content is upstream-controlled (tool results, federated errors) and is
// rendered as a text child. JSX escapes it; there is no innerHTML anywhere in
// this repo, and CI fails the build if one appears.
import { useEffect, useRef } from 'react'
import type { ComponentChildren } from 'preact'
import { CopyButton } from './CopyButton'

interface Props {
  title: string
  text: string
  placeholder: string
  tall?: boolean
  copyLabel?: string
  actions?: ComponentChildren
  /**
   * Follow the tail as content arrives. The wire log wants it; a tool result,
   * which the operator is reading from the top, does not.
   */
  follow?: boolean
}

export function JsonPane({ title, text, placeholder, tall, copyLabel, actions, follow }: Props) {
  const pane = useRef<HTMLPreElement>(null)

  // The hand-written console scrolled the wire log to the bottom on every
  // message; the rewrite dropped it, so a live session scrolled out of view and
  // had to be chased by hand.
  //
  // Whether to follow is the operator's standing intent, tracked from their
  // scrolling, not recomputed from geometry when new text lands. Measuring
  // after the update cannot work: by then the content has already grown, so
  // someone pinned to the tail measures as having scrolled away by exactly the
  // height of the message that just arrived, and the log stops following after
  // the first one. Default true so a pane that mounts already full — connect
  // logs a handshake and a list call per capability before it is ever seen —
  // opens at the end rather than on line one.
  const stick = useRef(true)
  const onScroll = () => {
    const el = pane.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  useEffect(() => {
    const el = pane.current
    if (!follow || !el || !stick.current) return
    el.scrollTop = el.scrollHeight
  }, [follow, text])

  return (
    // Named region: a scrollable pane of output that a screen-reader user can
    // jump to and identify is worth more here than the default anonymous
    // <section>, and there are two of these on the test console.
    <section class="pane-block" aria-label={title}>
      <div class="pane-head">
        <h3>{title}</h3>
        <div class="pane-actions">
          {actions}
          <CopyButton value={text} label={copyLabel ?? title} />
        </div>
      </div>
      <pre ref={pane} class={tall ? 'pane tall' : 'pane'} tabIndex={0} onScroll={follow ? onScroll : undefined}>
        {text || placeholder}
      </pre>
    </section>
  )
}
