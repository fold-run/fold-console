import { useToaster } from './Toaster'

interface Props {
  /** The exact text to place on the clipboard. */
  value: string
  /** What was copied, for the confirmation: "Upstream ID copied". */
  label: string
  className?: string
}

/**
 * Copy-to-clipboard, with a toast to confirm it.
 *
 * An operator reading this console is on their way to a terminal — an upstream
 * ID, a tool name, a JSON result. Making them select monospace text out of a
 * table is the difference between the console being useful and being a
 * screenshot.
 */
export function CopyButton({ value, label, className }: Props) {
  const toast = useToaster()

  const copy = async () => {
    try {
      // navigator.clipboard needs a secure context. A gateway served over
      // plain HTTP to anything but localhost has none, and the failure is
      // silent otherwise — say so rather than appearing to have worked.
      if (!navigator.clipboard) throw new Error('needs a secure context (https or localhost)')
      await navigator.clipboard.writeText(value)
      toast(`${label} copied`)
    } catch (err) {
      toast(`Copy failed: ${(err as Error).message}`, 'bad')
    }
  }

  return (
    <button
      type="button"
      class={className ? `copy ${className}` : 'copy'}
      onClick={copy}
      disabled={!value}
      title={`Copy ${label.toLowerCase()}`}
      aria-label={`Copy ${label.toLowerCase()}`}
    >
      Copy
    </button>
  )
}
