'use client'

import { useState } from 'react'
import { notify_linked_user } from '@/app/_actions/notifications'
import { currency_fmt } from '@/app/_utils/currency_formatter'

// Send a push notification to the user this account is linked to: a free-form
// message, or a one-tap payment reminder when they owe you (positive balance).
export function LinkedUserNotify({ targetUserId, username, owedAmount }: { targetUserId: string; username: string; owedAmount: number }) {
  const owes = owedAmount > 0
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function send(text: string) {
    const body = text.trim()
    if (!body) {
      setStatus('Enter a message first.')
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const r = await notify_linked_user(targetUserId, body)
      setStatus(r.success ? (r.message ?? 'Notification sent.') : (r.message ?? 'Could not send.'))
      if (r.success) setMessage('')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not send.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Notify @{username}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Sends a push notification to their device (if they’ve enabled notifications).</p>

      {owes && (
        <button
          type="button"
          onClick={() => send(`Reminder: you owe me ${currency_fmt.format(owedAmount)}. Please settle up when you can.`)}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-500 dark:bg-amber-600 text-white rounded-lg hover:bg-amber-600 dark:hover:bg-amber-700 font-medium disabled:opacity-50 transition-colors"
        >
          Send payment reminder ({currency_fmt.format(owedAmount)})
        </button>
      )}

      <div className="mt-4">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={`Message to @${username}…`}
          className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => send(message)}
            disabled={busy || !message.trim()}
            className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Sending…' : 'Send notification'}
          </button>
        </div>
      </div>

      {status && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{status}</p>}
    </div>
  )
}
