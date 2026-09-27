'use client'

import { useState } from 'react'
import { useToast } from '@/app/_components/Toast'
import { Button } from '@/app/_components/Button'
import { log_out } from '@/app/_actions/auth'
import { SectionHeading } from './SectionHeading'

export function SessionSection() {
  const { showToast } = useToast()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    if (!confirm('Log out of this device?')) return
    setLoggingOut(true)
    try {
      await log_out()

      // A hard navigation, deliberately — `useRouter().push()` would be a soft
      // one, which keeps the React tree and the Next client router cache alive
      // across a logout. That cache can hold prefetched authenticated pages, so
      // the document has to be torn down rather than re-rendered. The logout on
      // the login page does the same thing via location.reload().
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login'
    } catch (err: unknown) {
      showToast("Couldn't log out: " + (err instanceof Error ? err.message : String(err)), 'error')
      setLoggingOut(false)
    }
  }

  return (
    <section>
      <SectionHeading id="session">Session</SectionHeading>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-4 sm:p-6 transition-colors">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Log out</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Log out of this device. You&apos;ll need to log in again to return.</p>
          </div>
          <Button variant="secondary" className="shrink-0" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? 'Logging out…' : 'Log out'}
          </Button>
        </div>
      </div>
    </section>
  )
}
