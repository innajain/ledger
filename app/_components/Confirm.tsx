'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type MouseEvent } from 'react'
import { Button } from './Button'

/**
 * In-app replacement for `window.confirm()`. The native dialog can be suppressed by the
 * host without the page knowing — an embedded browser (the Claude desktop pane, some
 * in-app webviews) or Chrome's "prevent this page from creating additional dialogs" makes
 * it return `false` at once, so the guarded action silently never runs. This one is DOM,
 * so it always shows, and it is styled like the rest of the app.
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Delete this asset?', confirmLabel: 'Delete', danger: true }))) return
 *
 * Esc, Cancel and a click on the backdrop all resolve `false`. The native `confirm` is
 * banned by the `no-alert` lint rule so it doesn't creep back.
 */
export type ConfirmOptions = {
  title: string
  message?: string
  /** Defaults to "Confirm". Name the action ("Delete", "Log out") rather than "OK". */
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive: the confirm button is red and Cancel takes the initial focus, so Enter can't destroy. */
  danger?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()

  const settle = useCallback((ok: boolean) => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    setPending(null)
    p.resolve(ok)
  }, [])

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>(resolve => {
        // A second request while one is open answers the first with "no" rather than stacking dialogs.
        pendingRef.current?.resolve(false)
        const next = { ...opts, resolve }
        pendingRef.current = next
        setPending(next)
      }),
    [],
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!pending) {
      if (dialog.open) dialog.close()
      return
    }
    if (!dialog.open) dialog.showModal()
    ;(pending.danger ? cancelRef : confirmRef).current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [pending])

  function onBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    // The backdrop belongs to the <dialog> element, so a click on it targets the dialog
    // itself with coordinates outside its box; clicks on the content target a child.
    if (e.target !== e.currentTarget) return
    const r = e.currentTarget.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) settle(false)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={pending?.message ? messageId : undefined}
        onCancel={e => {
          e.preventDefault()
          settle(false)
        }}
        onClick={onBackdropClick}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-rule bg-paper text-ink p-4 sm:p-6 shadow-2xl backdrop:bg-black/60 open:animate-scale-in"
      >
        {pending && (
          <>
            <h2 id={titleId} className="text-lg text-ink">
              {pending.title}
            </h2>
            {pending.message && (
              <p id={messageId} className="mt-2 text-sm text-ink-2">
                {pending.message}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button ref={cancelRef} variant="secondary" onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </Button>
              <Button ref={confirmRef} variant={pending.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
                {pending.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext.Provider>
  )
}
