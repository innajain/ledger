'use client'
import { useState, useEffect } from 'react'
import type { user } from '@/generated/prisma/client'
import type { LineItemDefaults } from '@/app/_actions/preferences'
import type { AccountOpt, AssetOpt, InactiveAccount, InactiveAsset } from './types'
import { AccountSection } from './AccountSection'
import { PreferencesSection } from './PreferencesSection'
import { DataSection } from './DataSection'
import { ValidationSection } from './ValidationSection'
import dynamic from 'next/dynamic'
import { SessionSection } from './SessionSection'

// Admin-only tab — don't ship its chunk to non-admins (or before the tab is opened).
const AdminSection = dynamic(() => import('./AdminSection').then(m => m.AdminSection))

type Props = {
  user: Pick<user, 'id' | 'username'>
  isAdmin: boolean
  upiId: string | null
  accounts: AccountOpt[]
  assets: AssetOpt[]
  defaults: LineItemDefaults
  inactiveAccounts: InactiveAccount[]
  inactiveAssets: InactiveAsset[]
}

export default function ClientPage({ user, isAdmin, upiId, accounts, assets, defaults, inactiveAccounts, inactiveAssets }: Props) {
  const sectionLinks: { id: string; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'data', label: 'Data' },
    { id: 'validation', label: 'Validation' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
    { id: 'session', label: 'Session' },
  ]
  const validIds = new Set(sectionLinks.map(s => s.id))
  const [activeSection, setActiveSection] = useState<string>(sectionLinks[0].id)
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hash && validIds.has(hash)) setActiveSection(hash)
    const onHashChange = () => {
      const h = window.location.hash.replace(/^#/, '')
      if (h && validIds.has(h)) setActiveSection(h)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])
  const goTo = (id: string) => {
    setActiveSection(id)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`)
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-medium text-ink mb-2">Settings</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[180px_minmax(0,1fr)] gap-8 lg:gap-10">
        <aside className="hidden lg:block">
          <nav className="sticky top-8">
            <ul className="space-y-1">
              {sectionLinks.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goTo(s.id)}
                    className={`block w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeSection === s.id ? 'bg-accent text-white shadow-sm' : 'text-ink-2 hover:text-ink hover:bg-sunken'
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="space-y-6 min-w-0">
          {}
          <div className="lg:hidden relative">
            <label htmlFor="settings-section" className="sr-only">
              Section
            </label>
            <select
              id="settings-section"
              value={activeSection}
              onChange={e => goTo(e.target.value)}
              className="appearance-none block w-full px-3 py-2 pr-10 bg-paper border border-rule-strong text-ink rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-colors"
            >
              {sectionLinks.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {activeSection === 'account' && <AccountSection username={user.username} upiId={upiId} />}
          {activeSection === 'preferences' && <PreferencesSection accounts={accounts} assets={assets} defaults={defaults} />}
          {activeSection === 'data' && <DataSection inactiveAccounts={inactiveAccounts} inactiveAssets={inactiveAssets} />}
          {activeSection === 'validation' && <ValidationSection />}
          {isAdmin && activeSection === 'admin' && <AdminSection />}
          {activeSection === 'session' && <SessionSection />}
        </div>
      </div>
    </div>
  )
}
