// Transient feedback for actions that leave no trace on the page — a copy, a
// cleared log. It exists for exactly this: confirming that a click did the
// thing, without stealing the operator's place on the page.
//
// The banner is for conditions ("you are unauthorized"); a toast is for events
// ("copied"). Anything an operator might need to act on later belongs in the
// banner, not here.
import { createContext } from 'preact'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentChildren } from 'preact'

export type ToastTone = 'ok' | 'bad'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {})

export function useToaster() {
  return useContext(ToastContext)
}

const LIFETIME_MS = 3200

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  const push = useCallback((message: string, tone: ToastTone = 'ok') => {
    const id = seq.current++
    setToasts((prev) => prev.concat({ id, message, tone }))
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timers.current.delete(timer)
    }, LIFETIME_MS)
    timers.current.add(timer)
  }, [])

  // A toast outliving its provider would fire setState into a dead tree.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending) clearTimeout(t)
      pending.clear()
    }
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* polite, not assertive: a copy confirmation must never cut across a
          screen reader mid-sentence. */}
      <div class="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} class={`toast ${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
