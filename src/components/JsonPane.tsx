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
import type { ComponentChildren } from 'preact'
import { CopyButton } from './CopyButton'

interface Props {
  title: string
  text: string
  placeholder: string
  tall?: boolean
  copyLabel?: string
  actions?: ComponentChildren
}

export function JsonPane({ title, text, placeholder, tall, copyLabel, actions }: Props) {
  return (
    <section class="pane-block">
      <div class="pane-head">
        <h3>{title}</h3>
        <div class="pane-actions">
          {actions}
          <CopyButton value={text} label={copyLabel ?? title} />
        </div>
      </div>
      <pre class={tall ? 'pane tall' : 'pane'}>{text || placeholder}</pre>
    </section>
  )
}
