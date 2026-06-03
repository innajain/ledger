'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTheme } from '@/app/_components/ThemeProvider'
import type { user } from '@/generated/prisma/client'
import { change_password, change_username, log_out } from '@/app/_actions/auth'
import { update_line_item_defaults, type LineItemDefaults } from '@/app/_actions/preferences'
import { usePrivacy } from '@/app/_components/PrivacyProvider'
import { NotificationToggle } from '@/app/_components/NotificationToggle'
import { useToast } from '@/app/_components/Toast'
import { flush_redis } from '@/app/_actions/flush'
import { validate_all_txns } from '@/app/_actions/validate_all_txns'

type AccountOpt = { id: string; name: string; type: string }
type AssetOpt = { id: string; name: string }
type InactiveAccount = { id: string; name: string; type: string; is_placeholder: boolean }
type InactiveAsset = { id: string; name: string; type: string; is_placeholder: boolean }

type Props = {
  user: Pick<user, 'id' | 'username'>
  isAdmin: boolean
  accounts: AccountOpt[]
  assets: AssetOpt[]
  defaults: LineItemDefaults
  inactiveAccounts: InactiveAccount[]
  inactiveAssets: InactiveAsset[]
}

function accountUrl(a: InactiveAccount) {
  // The path segment is the head type verbatim: /heads/{account|allocation|income_expense}
  return `/heads/${a.type}/${a.id}`
}

const TYPE_LABELS: Record<string, string> = {
  account: 'Account',
  allocation: 'Allocation',
  income_expense: 'Income/Expense',
}

const REDIRECT_DELAY_MS = 1500

function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  // scroll-mt offsets the anchor jump so the heading doesn't hide under the sticky page header.
  return (
    <h2 id={id} className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-1 scroll-mt-24">
      {children}
    </h2>
  )
}

export default function ClientPage({ user, isAdmin, accounts, assets, defaults, inactiveAccounts, inactiveAssets }: Props) {
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  // Username change state
  const [newUsername, setNewUsername] = useState('')
  const [usernamePassword, setUsernamePassword] = useState('')
  const [showUsernamePassword, setShowUsernamePassword] = useState(false)
  const [usernameLoading, setUsernameLoading] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null)

  // Line-item defaults state
  const [defaultAccount, setDefaultAccount] = useState<string>(defaults.default_account_id ?? '')
  const [defaultAllocation, setDefaultAllocation] = useState<string>(defaults.default_allocation_id ?? '')
  const [defaultIncomeExpense, setDefaultIncomeExpense] = useState<string>(defaults.default_income_expense_id ?? '')
  const [defaultAsset, setDefaultAsset] = useState<string>(defaults.default_asset_id ?? '')
  const [defaultsLoading, setDefaultsLoading] = useState(false)
  const [defaultsError, setDefaultsError] = useState<string | null>(null)
  const [defaultsSuccess, setDefaultsSuccess] = useState<string | null>(null)

  // Theme state (DB-backed via ThemeProvider).
  const { theme, set_theme } = useTheme()

  // Privacy (amount masking) state
  const { masking_enabled, mask_threshold, set_masking_enabled, set_mask_threshold } = usePrivacy()
  const [thresholdInput, setThresholdInput] = useState<string>(String(mask_threshold))
  useEffect(() => {
    // Keep the input in sync after the privacy context hydrates from the DB.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThresholdInput(String(mask_threshold))
  }, [mask_threshold])

  // Action state for moved-from-dashboard buttons
  const { showToast } = useToast()
  const [flushing, setFlushing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Side-nav drives which section is rendered. Only one section is mounted
  // at a time; the URL hash is kept in sync so reloads and back/forward work.
  const sectionLinks: { id: string; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'data', label: 'Data' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
    { id: 'session', label: 'Session' },
  ]
  const validIds = new Set(sectionLinks.map(s => s.id))
  const [activeSection, setActiveSection] = useState<string>(sectionLinks[0].id)
  useEffect(() => {
    // Hydrate from URL hash on mount. Done in an effect to keep SSR stable.
    const hash = window.location.hash.replace(/^#/, '')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hash && validIds.has(hash)) setActiveSection(hash)
    const onHashChange = () => {
      const h = window.location.hash.replace(/^#/, '')
      if (h && validIds.has(h)) setActiveSection(h)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
    // validIds is derived from sectionLinks which only changes with isAdmin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])
  const goTo = (id: string) => {
    setActiveSection(id)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`)
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  }

  const accountHeads = accounts.filter(a => a.type === 'account')
  const allocationAccounts = accounts.filter(a => a.type === 'allocation')
  const incomeExpenseHeads = accounts.filter(a => a.type === 'income_expense')

  async function handleDefaultsSave(e: React.FormEvent) {
    e.preventDefault()
    setDefaultsError(null)
    setDefaultsSuccess(null)
    setDefaultsLoading(true)
    try {
      const result = await update_line_item_defaults({
        default_account_id: defaultAccount === '' ? null : defaultAccount,
        default_allocation_id: defaultAllocation === '' ? null : defaultAllocation,
        default_income_expense_id: defaultIncomeExpense === '' ? null : defaultIncomeExpense,
        default_asset_id: defaultAsset === '' ? null : defaultAsset,
      })
      if (!result.success) throw new Error(result.message)
      setDefaultsSuccess('Defaults saved successfully!')
    } catch (err: unknown) {
      setDefaultsError(err instanceof Error ? err.message : String(err))
    } finally {
      setDefaultsLoading(false)
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    setPasswordLoading(true)
    try {
      const result = await change_password({
        current_password: currentPassword,
        new_password: newPassword,
      })
      if (!result.success) throw new Error(result.message)
      setPasswordSuccess('Password changed successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : String(err))
    } finally {
      setPasswordLoading(false)
    }
  }

  async function handleUsernameChange(e: React.FormEvent) {
    e.preventDefault()
    setUsernameError(null)
    setUsernameSuccess(null)

    if (!newUsername) {
      setUsernameError('Username is required')
      return
    }

    if (newUsername === user.username) {
      setUsernameError('New username must be different from current username')
      return
    }

    setUsernameLoading(true)
    try {
      const result = await change_username({
        new_username: newUsername,
        password: usernamePassword,
      })
      if (!result.success) throw new Error(result.message)
      setUsernameSuccess('Username changed successfully! Redirecting...')
      setTimeout(() => {
        window.location.reload()
      }, REDIRECT_DELAY_MS)
    } catch (err: unknown) {
      setUsernameError(err instanceof Error ? err.message : String(err))
    } finally {
      setUsernameLoading(false)
    }
  }

  async function handleFlushRedis() {
    if (!confirm('Flush Redis cache? This clears all cached prices.')) return
    setFlushing(true)
    try {
      const res = await flush_redis()
      if (res.success) showToast(res.message ?? 'Redis cache flushed', 'success')
      else showToast(res.message ?? 'Flush failed', 'error')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setFlushing(false)
    }
  }

  async function handleValidate() {
    if (!confirm('Validate all transactions? This will check every txn.')) return
    setValidating(true)
    try {
      const res = await validate_all_txns()
      if (!res || res.length === 0) {
        showToast('All transactions are valid', 'success')
      } else {
        const details = res.map(r => `id: ${r.id} — ${r.message}`).join('\n')
        console.error(`Invalid transactions found (${res.length}):\n\n${details}`)
        showToast(`Invalid transactions found (${res.length}). See console for details.`, 'warning')
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setValidating(false)
    }
  }

  async function handleLogout() {
    if (!confirm('Log out?')) return
    setLoggingOut(true)
    try {
      await log_out()
      window.location.reload()
    } catch (err: unknown) {
      showToast('Logout failed: ' + (err instanceof Error ? err.message : String(err)), 'error')
      setLoggingOut(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Settings</h1>
        <p className="text-slate-600 dark:text-slate-400">Manage your account settings and preferences</p>
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
                      activeSection === s.id
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
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
          {/* Mobile section selector (hidden on lg+) */}
          <div className="lg:hidden relative">
            <label htmlFor="settings-section" className="sr-only">
              Section
            </label>
            <select
              id="settings-section"
              value={activeSection}
              onChange={e => goTo(e.target.value)}
              className="appearance-none block w-full px-4 py-3 pr-10 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
            >
              {sectionLinks.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {/* ---------- Account ---------- */}
          {activeSection === 'account' && (
            <section>
              <SectionHeading id="account">Account</SectionHeading>
              <div className="space-y-6">
                {/* Current User Info Card */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 flex items-center justify-center text-white font-semibold text-lg">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Username</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{user.username}</p>
                    </div>
                  </div>
                </div>

                {/* Change Password Card */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Change Password</h3>
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div>
                      <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          id="currentPassword"
                          type={showCurrentPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          placeholder="Enter current password"
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          className="block w-full px-4 py-3 pr-12 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        >
                          {showCurrentPassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          id="newPassword"
                          type={showNewPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          placeholder="Enter new password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="block w-full px-4 py-3 pr-12 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        >
                          {showNewPassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          placeholder="Confirm new password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          className="block w-full px-4 py-3 pr-12 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        >
                          {showConfirmPassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {passwordError && (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                        <svg className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-red-700 dark:text-red-400">{passwordError}</p>
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-green-700 dark:text-green-400">{passwordSuccess}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                      className="w-full px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors font-medium shadow-sm flex items-center justify-center gap-2"
                    >
                      {passwordLoading ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>Changing password...</span>
                        </>
                      ) : (
                        <span>Change Password</span>
                      )}
                    </button>
                  </form>
                </div>

                {/* Change Username Card */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Change Username</h3>
                  <form onSubmit={handleUsernameChange} className="space-y-4">
                    <div>
                      <label htmlFor="newUsername" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        New Username
                      </label>
                      <input
                        id="newUsername"
                        type="text"
                        autoComplete="username"
                        required
                        placeholder="Enter new username"
                        value={newUsername}
                        onChange={e => setNewUsername(e.target.value)}
                        className="block w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                      />
                    </div>

                    <div>
                      <label htmlFor="usernamePassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Confirm with Password
                      </label>
                      <div className="relative">
                        <input
                          id="usernamePassword"
                          type={showUsernamePassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          placeholder="Enter your password"
                          value={usernamePassword}
                          onChange={e => setUsernamePassword(e.target.value)}
                          className="block w-full px-4 py-3 pr-12 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowUsernamePassword(!showUsernamePassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        >
                          {showUsernamePassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">We need your password to confirm this change</p>
                    </div>

                    {usernameError && (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                        <svg className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-red-700 dark:text-red-400">{usernameError}</p>
                      </div>
                    )}

                    {usernameSuccess && (
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-green-700 dark:text-green-400">{usernameSuccess}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={usernameLoading || !newUsername || !usernamePassword}
                      className="w-full px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors font-medium shadow-sm flex items-center justify-center gap-2"
                    >
                      {usernameLoading ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>Changing username...</span>
                        </>
                      ) : (
                        <span>Change Username</span>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </section>
          )}

          {/* ---------- Preferences ---------- */}
          {activeSection === 'preferences' && (
            <section>
              <SectionHeading id="preferences">Preferences</SectionHeading>
              <div className="space-y-6">
                {/* Notifications */}
                <NotificationToggle />

                {/* Appearance */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Appearance</h3>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Theme</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">System follows your operating system preference.</p>
                    </div>
                    <select
                      value={theme}
                      onChange={e => set_theme(e.target.value as 'light' | 'dark' | 'system')}
                      className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                      aria-label="Theme"
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                </div>

                {/* Privacy */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Privacy</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Hide amounts above a threshold. Masked amounts can be revealed individually by clicking them.
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Mask large amounts</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">When off, all amounts are shown in full.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => set_masking_enabled(!masking_enabled)}
                        role="switch"
                        aria-checked={masking_enabled}
                        aria-label="Toggle amount masking"
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          masking_enabled ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            masking_enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div>
                      <label htmlFor="maskThreshold" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Masking threshold (₹)
                      </label>
                      <input
                        id="maskThreshold"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1000}
                        disabled={!masking_enabled}
                        value={thresholdInput}
                        onChange={e => setThresholdInput(e.target.value)}
                        onBlur={() => {
                          const parsed = Number(thresholdInput)
                          if (Number.isFinite(parsed) && parsed >= 0) {
                            set_mask_threshold(parsed)
                          } else {
                            setThresholdInput(String(mask_threshold))
                          }
                        }}
                        className="block w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Amounts strictly above this value will be hidden by default.</p>
                    </div>
                  </div>
                </div>

                {/* Line Item Defaults */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Transaction Line Item Defaults</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Pre-selected account and asset for new line items on the Create / Edit Transaction pages. Leave blank to fall back to the first
                    account/asset of that type.
                  </p>
                  <form onSubmit={handleDefaultsSave} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Default Account</label>
                      <select
                        value={defaultAccount}
                        onChange={e => setDefaultAccount(e.target.value)}
                        className="block w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                      >
                        <option value="">— Use first available —</option>
                        {accountHeads.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Default Allocation Account</label>
                      <select
                        value={defaultAllocation}
                        onChange={e => setDefaultAllocation(e.target.value)}
                        className="block w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                      >
                        <option value="">— Use first available —</option>
                        {allocationAccounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Default Income / Expense</label>
                      <select
                        value={defaultIncomeExpense}
                        onChange={e => setDefaultIncomeExpense(e.target.value)}
                        className="block w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                      >
                        <option value="">— Use first available —</option>
                        {incomeExpenseHeads.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Default Asset</label>
                      <select
                        value={defaultAsset}
                        onChange={e => setDefaultAsset(e.target.value)}
                        className="block w-full px-4 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
                      >
                        <option value="">— Use first available —</option>
                        {assets.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {defaultsError && (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                        <svg className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-red-700 dark:text-red-400">{defaultsError}</p>
                      </div>
                    )}

                    {defaultsSuccess && (
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
                        <svg
                          className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-green-700 dark:text-green-400">{defaultsSuccess}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={defaultsLoading}
                      className="w-full px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors font-medium shadow-sm flex items-center justify-center gap-2"
                    >
                      {defaultsLoading ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Save Defaults</span>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </section>
          )}

          {/* ---------- Data ---------- */}
          {activeSection === 'data' && (
            <section>
              <SectionHeading id="data">Data</SectionHeading>
              <div className="space-y-6">
                {/* Inactive Accounts */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Inactive Accounts</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Accounts that are hidden from transaction selectors. Click to manage.
                  </p>
                  {inactiveAccounts.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic">No inactive accounts.</p>
                  ) : (
                    <ul className="space-y-2">
                      {inactiveAccounts.map(a => (
                        <li key={a.id}>
                          <Link
                            href={accountUrl(a)}
                            className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                          >
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {a.name}
                              {a.is_placeholder && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(placeholder)</span>}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                a.type === 'account'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : a.type === 'allocation'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                              }`}
                            >
                              {TYPE_LABELS[a.type] ?? a.type}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Inactive Assets */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Inactive Assets</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Assets that are hidden from transaction selectors. Click to manage.
                  </p>
                  {inactiveAssets.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic">No inactive assets.</p>
                  ) : (
                    <ul className="space-y-2">
                      {inactiveAssets.map(a => (
                        <li key={a.id}>
                          <Link
                            href={`/assets/${a.id}/update`}
                            className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                          >
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {a.name}
                              {a.is_placeholder && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(placeholder)</span>}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 capitalize">
                              {a.type}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Database Dump */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Database Dump</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Download a SQL file with INSERT statements for every user-data table.
                      </p>
                    </div>
                    <a
                      href="/api/dump"
                      className="shrink-0 px-4 py-2 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-lg hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors font-medium border border-teal-200 dark:border-teal-800 inline-flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      Download
                    </a>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ---------- Admin (admins only) ---------- */}
          {isAdmin && activeSection === 'admin' && (
            <section>
              <SectionHeading id="admin">Admin</SectionHeading>
              <div className="space-y-6">
                {/* Flush Redis */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Flush Redis Cache</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Clears every cached price, balance, and chart series. Next page render will rebuild from source.
                      </p>
                    </div>
                    <button
                      onClick={handleFlushRedis}
                      disabled={flushing}
                      className="shrink-0 px-4 py-2 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-violet-200 dark:border-violet-800"
                    >
                      {flushing ? 'Flushing...' : 'Flush cache'}
                    </button>
                  </div>
                </div>

                {/* Validate Transactions */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Validate Transactions</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Run the integrity checker against every transaction. Any failures are logged to the browser console.
                      </p>
                    </div>
                    <button
                      onClick={handleValidate}
                      disabled={validating}
                      className="shrink-0 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-amber-300 dark:border-amber-700"
                    >
                      {validating ? 'Validating...' : 'Validate all'}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ---------- Session ---------- */}
          {activeSection === 'session' && (
            <section>
              <SectionHeading id="session">Session</SectionHeading>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Log out</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      Sign out of this device. You&apos;ll need to sign in again to return.
                    </p>
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
          )}
        </div>
      </div>
    </div>
  )
}
