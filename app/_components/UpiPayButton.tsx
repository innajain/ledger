'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { Button } from '@/app/_components/Button'
import { currency_fmt } from '../_utils/currency_formatter'

type Props = {
  upi_id: string
  payee_name: string

  amount?: number
  note?: string

  on_mark_paid?: (amount: number, note: string) => void

  mark_paid_label?: string

  button_label?: string

  button_class?: string

  disabled?: boolean

  confirm_title?: string

  initial_amount?: number
  /** Pre-fill the note input when opening the prompt modal. */
  initial_note?: string
}

const UPI_ICON = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
    />
  </svg>
)

function build_upi_url(upi_id: string, payee_name: string, amount: number, note?: string) {
  // UPI deep link spec: pa=address, pn=payee name, am=amount, cu=currency, tn=note.
  // IMPORTANT: `pa` (the VPA) must be passed LITERAL — its `@` must NOT be

  const parts = [`pa=${upi_id}`, `pn=${encodeURIComponent(payee_name)}`, `am=${amount.toFixed(2)}`, 'cu=INR']
  if (note) parts.push(`tn=${encodeURIComponent(note)}`)
  return `upi://pay?${parts.join('&')}`
}

function ModalShell({ children, on_close, label }: { children: ReactNode; on_close: () => void; label: string }) {
  const panel_ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') on_close()
      // Minimal focus trap: keep Tab inside the dialog while it is open.
      if (e.key === 'Tab' && panel_ref.current) {
        const focusables = panel_ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', on_key)
    const prev_overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const previously_focused = document.activeElement as HTMLElement | null
    // Focus the panel itself unless a child (e.g. the amount input) autofocuses.
    if (!panel_ref.current?.contains(document.activeElement)) panel_ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', on_key)
      document.body.style.overflow = prev_overflow
      previously_focused?.focus?.()
    }
  }, [on_close])

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in" onClick={on_close}>
      <div
        ref={panel_ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-6 max-w-sm w-full animate-scale-in focus:outline-none"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function UpiPayButton({
  upi_id,
  payee_name,
  amount: amount_prop,
  note: note_prop,
  on_mark_paid,
  mark_paid_label = 'Yes, log it',
  button_label = 'Pay via UPI',
  button_class,
  disabled = false,
  confirm_title = 'Mark as paid?',
  initial_amount,
  initial_note,
}: Props) {
  const prompt_for_amount = amount_prop === undefined

  const [modal, set_modal] = useState<'amount' | 'qr' | 'confirm' | null>(null)
  const [qr_data_url, set_qr_data_url] = useState<string | null>(null)

  const [amount_input, set_amount_input] = useState('')
  const [note_input, set_note_input] = useState('')

  const [prompted_amount, set_prompted_amount] = useState<number | null>(null)
  const [prompted_note, set_prompted_note] = useState<string>('')

  // Effective amount + note used for URL + dialog display. Props win in

  const active_amount = prompt_for_amount ? prompted_amount : (amount_prop ?? null)
  const active_note = prompt_for_amount ? prompted_note : (note_prop ?? '')

  const url = active_amount && active_amount > 0 ? build_upi_url(upi_id, payee_name, active_amount, active_note || undefined) : ''

  useEffect(() => {
    if (modal !== 'qr' || !url) return
    let cancelled = false
    QRCode.toDataURL(url, { width: 280, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(d => {
        if (!cancelled) set_qr_data_url(d)
      })
      .catch(() => {
        if (!cancelled) set_qr_data_url(null)
      })
    return () => {
      cancelled = true
    }
  }, [modal, url])

  function handle_trigger_click() {
    if (disabled) return
    if (prompt_for_amount) {
      set_amount_input(initial_amount !== undefined && initial_amount > 0 ? initial_amount.toFixed(2) : '')
      set_note_input(initial_note ?? '')
      set_modal('amount')
    } else {
      launch()
    }
  }

  function launch() {
    if (!url || active_amount === null) return
    set_modal('qr')
  }

  function submit_amount() {
    const n = parseFloat(amount_input)
    if (!Number.isFinite(n) || n <= 0) return
    set_prompted_amount(n)
    set_prompted_note(note_input.trim())

    setTimeout(() => set_modal('qr'), 0)
  }

  function close_modal() {
    set_modal(null)
  }

  function confirm_paid() {
    set_modal(null)
    if (active_amount !== null) on_mark_paid?.(active_amount, active_note)
  }

  const amount_valid = parseFloat(amount_input) > 0

  return (
    <>
      {}
      <span className="hidden sm:inline-flex">
        <button
          type="button"
          onClick={handle_trigger_click}
          disabled={disabled || (!prompt_for_amount && !url)}
          className={
            button_class ??
            'inline-flex items-center gap-2 px-4 py-2 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium'
          }
        >
          {UPI_ICON}
          {button_label}
        </button>
      </span>

      {modal === 'amount' && (
        <ModalShell on_close={close_modal} label={`Pay ${payee_name}`}>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Pay {payee_name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-mono break-all">{upi_id}</p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                autoFocus
                value={amount_input}
                onChange={e => set_amount_input(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && amount_valid) submit_amount()
                }}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Note (optional)</label>
              <input
                type="text"
                value={note_input}
                onChange={e => set_note_input(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && amount_valid) submit_amount()
                }}
                placeholder="What's this for?"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-5">
            <Button variant="secondary" className="flex-1" onClick={close_modal}>
              Cancel
            </Button>
            <button
              type="button"
              disabled={!amount_valid}
              onClick={submit_amount}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {UPI_ICON}
              Continue
            </button>
          </div>
        </ModalShell>
      )}

      {modal === 'qr' && active_amount !== null && (
        <ModalShell on_close={close_modal} label="Scan to pay">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Scan to pay</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            {payee_name} · <span className="font-medium text-slate-900 dark:text-slate-100">{currency_fmt.format(active_amount)}</span>
          </p>
          <div className="rounded-lg bg-white p-3 flex items-center justify-center min-h-70">
            {qr_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr_data_url} alt="UPI QR code" className="w-full max-w-64" />
            ) : (
              <div className="w-full h-64 bg-slate-100 rounded animate-pulse" />
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 break-all font-mono text-center">{upi_id}</p>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" className="flex-1" onClick={close_modal}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={() => set_modal('confirm')}
              className="flex-1 px-3 py-2 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors font-medium"
            >
              I paid
            </button>
          </div>
        </ModalShell>
      )}

      {modal === 'confirm' && active_amount !== null && (
        <ModalShell on_close={close_modal} label={confirm_title}>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{confirm_title}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
            Did the payment of <span className="font-semibold text-slate-900 dark:text-slate-100">{currency_fmt.format(active_amount)}</span> to{' '}
            {payee_name} succeed?
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={close_modal}>
              No
            </Button>
            <button
              type="button"
              onClick={confirm_paid}
              className="flex-1 px-3 py-2 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors font-medium"
            >
              {mark_paid_label}
            </button>
          </div>
        </ModalShell>
      )}
    </>
  )
}
