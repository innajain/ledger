'use client'

import { useState } from 'react'
import { useToast } from '@/app/_components/Toast'
import { log_out } from '@/app/_actions/auth'
import { SectionHeading } from './SectionHeading'

export function SessionSection() {
  const { showToast } = useToast()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    if (!confirm('Log out?')) return
    setLoggingOut(true)
    try {
      await log_out()
      // Full reload: clears the auth cookie's client state and lets the proxy
      // redirect to /login on the next request.
      window.location.href = '/login'
    } catch (err: unknown) {
      showToast('Logout failed: ' + (err instanceof Error ? err.message : String(err)), 'error')
      setLoggingOut(false)
    }
  }

  return (
    <section>
      <SectionHeading id="session">Session</SectionHeading>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Log out</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Sign out of this device. You&apos;ll need to sign in again to return.</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="shrink-0 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-red-200 dark:border-red-800"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </div>
    </section>
  )
}
