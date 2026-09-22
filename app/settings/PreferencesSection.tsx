'use client'

import React, { useState, useEffect, useId } from 'react'
import { useTheme } from '@/app/_components/ThemeProvider'
import { usePrivacy } from '@/app/_components/PrivacyProvider'
import { NotificationToggle } from '@/app/_components/NotificationToggle'
import { update_line_item_defaults, type LineItemDefaults } from '@/app/_actions/preferences'
import { Button } from '@/app/_components/Button'
import { Spinner } from '@/app/_components/icons'
import { SectionHeading } from './SectionHeading'
import type { AccountOpt, AssetOpt } from './types'

const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2'
const selectCls =
  'block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors'

export function PreferencesSection({ accounts, assets, defaults }: { accounts: AccountOpt[]; assets: AssetOpt[]; defaults: LineItemDefaults }) {
  const uid = useId()
  const { theme, set_theme } = useTheme()
  const { masking_enabled, mask_threshold, set_masking_enabled, set_mask_threshold } = usePrivacy()

  const [thresholdInput, setThresholdInput] = useState<string>(String(mask_threshold))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThresholdInput(String(mask_threshold))
  }, [mask_threshold])

  const [defaultAccount, setDefaultAccount] = useState<string>(defaults.default_account_id ?? '')
  const [defaultAllocation, setDefaultAllocation] = useState<string>(defaults.default_allocation_id ?? '')
  const [defaultIncomeExpense, setDefaultIncomeExpense] = useState<string>(defaults.default_income_expense_id ?? '')
  const [defaultAsset, setDefaultAsset] = useState<string>(defaults.default_asset_id ?? '')
  const [defaultsLoading, setDefaultsLoading] = useState(false)
  const [defaultsError, setDefaultsError] = useState<string | null>(null)
  const [defaultsSuccess, setDefaultsSuccess] = useState<string | null>(null)

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
      setDefaultsSuccess('Defaults saved.')
    } catch (err: unknown) {
      setDefaultsError(err instanceof Error ? err.message : String(err))
    } finally {
      setDefaultsLoading(false)
    }
  }

  return (
    <section>
      <SectionHeading id="preferences">Preferences</SectionHeading>
      <div className="space-y-6">
        {}
        <NotificationToggle />

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-4 sm:p-6 transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Appearance</h3>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Theme</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">System follows your OS setting.</p>
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

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-4 sm:p-6 transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Privacy</h3>
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
              <label htmlFor="maskThreshold" className={labelCls}>
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
                className="block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Amounts strictly above this value will be hidden by default.</p>
            </div>
          </div>
        </div>

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-4 sm:p-6 transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Transaction line defaults</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Pre-selected account and asset for new lines on the create and edit transaction pages. Leave blank to fall back to the first account/asset
            of that type.
          </p>
          <form onSubmit={handleDefaultsSave} className="space-y-4">
            <div>
              <label htmlFor={`${uid}-default-account`} className={labelCls}>
                Default account
              </label>
              <select id={`${uid}-default-account`} value={defaultAccount} onChange={e => setDefaultAccount(e.target.value)} className={selectCls}>
                <option value="">— Use first available —</option>
                {accountHeads.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${uid}-default-allocation`} className={labelCls}>
                Default allocation
              </label>
              <select
                id={`${uid}-default-allocation`}
                value={defaultAllocation}
                onChange={e => setDefaultAllocation(e.target.value)}
                className={selectCls}
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
              <label htmlFor={`${uid}-default-income-expense`} className={labelCls}>
                Default income / expense category
              </label>
              <select
                id={`${uid}-default-income-expense`}
                value={defaultIncomeExpense}
                onChange={e => setDefaultIncomeExpense(e.target.value)}
                className={selectCls}
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
              <label htmlFor={`${uid}-default-asset`} className={labelCls}>
                Default asset
              </label>
              <select id={`${uid}-default-asset`} value={defaultAsset} onChange={e => setDefaultAsset(e.target.value)} className={selectCls}>
                <option value="">— Use first available —</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {defaultsError && (
              <div
                role="alert"
                className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3"
              >
                <svg
                  aria-hidden="true"
                  className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-700 dark:text-red-400">{defaultsError}</p>
              </div>
            )}

            {defaultsSuccess && (
              <div
                role="status"
                aria-live="polite"
                className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3"
              >
                <svg
                  aria-hidden="true"
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

            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="lg" disabled={defaultsLoading}>
                {defaultsLoading ? (
                  <>
                    <Spinner />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>Save defaults</span>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}
