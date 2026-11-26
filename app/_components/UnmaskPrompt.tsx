'use client'

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Button } from './Button'
import { confirm_password } from '@/app/_actions/auth'

/**
 * The password prompt in front of unmasking amounts. PrivacyProvider opens it and learns
 * the outcome through `onDone`; the password is checked on the server (confirm_password).
 */
export function UnmaskPrompt({ open, minutes, onDone }: { open: boolean; minutes: number; onDone: (ok: boolean) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const titleId = useId()
  const inputId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      inputRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function finish(ok: boolean) {
    setPassword('')
    setError(null)
    setBusy(false)
    onDone(ok)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    try {
      const res = await confirm_password(password)
      if (res.success) return finish(true)
      setError(res.message)
    } catch {
      setError("Couldn't check your password. Try again.")
    }
    setBusy(false)
    setPassword('')
    inputRef.current?.focus()
  }

  function onBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target !== e.currentTarget || busy) return
    const r = e.currentTarget.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) finish(false)
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={e => {
        e.preventDefault()
        if (!busy) finish(false)
      }}
      onClick={onBackdropClick}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-rule bg-paper text-ink p-4 sm:p-6 shadow-2xl backdrop:bg-black/60 open:animate-scale-in"
    >
      <form onSubmit={submit}>
        <h2 id={titleId} className="text-lg text-ink">
          Show amounts
        </h2>
        <p className="mt-2 text-sm text-ink-2">Enter your password. Amounts stay unlocked for {minutes} minutes, then hide again.</p>
        <label htmlFor={inputId} className="sr-only">
          Password
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          // readOnly, not disabled, while checking: a disabled input can't take focus, and
          // focus has to land back here the moment a wrong password is reported.
          readOnly={busy}
          className="mt-4 block w-full px-3 py-2 bg-raised border border-rule-strong text-ink rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none read-only:opacity-60"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-neg">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => finish(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Unlock'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
