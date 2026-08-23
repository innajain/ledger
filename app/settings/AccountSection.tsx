'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { change_password, change_username } from '@/app/_actions/auth'
import { update_own_upi } from '@/app/_actions/preferences'
import { Button } from '@/app/_components/Button'
import { EyeIcon, Spinner } from '@/app/_components/icons'
import { SectionHeading } from './SectionHeading'

const REDIRECT_DELAY_MS = 1500

const ErrorBanner = ({ message }: { message: string }) => (
  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
    <svg className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
  </div>
)

const SuccessBanner = ({ message }: { message: string }) => (
  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
    <svg className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <p className="text-sm text-green-700 dark:text-green-400">{message}</p>
  </div>
)

const inputCls =
  'block w-full px-3 py-2 pr-12 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-colors'
const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2'
const eyeBtnCls = 'absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors'

export function AccountSection({ username, upiId }: { username: string; upiId: string | null }) {
  const router = useRouter()

  const [upi, setUpi] = useState(upiId ?? '')
  const [upiLoading, setUpiLoading] = useState(false)
  const [upiError, setUpiError] = useState<string | null>(null)
  const [upiSuccess, setUpiSuccess] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  const [newUsername, setNewUsername] = useState('')
  const [usernamePassword, setUsernamePassword] = useState('')
  const [showUsernamePassword, setShowUsernamePassword] = useState(false)
  const [usernameLoading, setUsernameLoading] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null)

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
      const result = await change_password({ current_password: currentPassword, new_password: newPassword })
      if (!result.success) throw new Error(result.message)
      setPasswordSuccess('Password changed.')
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
    if (newUsername === username) {
      setUsernameError('New username must be different from current username')
      return
    }
    setUsernameLoading(true)
    try {
      const result = await change_username({ new_username: newUsername, password: usernamePassword })
      if (!result.success) throw new Error(result.message)
      setUsernameSuccess('Username changed — refreshing…')
      setTimeout(() => router.refresh(), REDIRECT_DELAY_MS)
    } catch (err: unknown) {
      setUsernameError(err instanceof Error ? err.message : String(err))
    } finally {
      setUsernameLoading(false)
    }
  }

  async function handleUpiSave(e: React.FormEvent) {
    e.preventDefault()
    setUpiError(null)
    setUpiSuccess(null)
    setUpiLoading(true)
    try {
      const result = await update_own_upi(upi.trim() === '' ? null : upi.trim())
      if (!result.success) throw new Error(result.message)
      setUpi(result.data?.upi_id ?? '')
      setUpiSuccess(result.data?.upi_id ? 'UPI ID saved.' : 'UPI ID cleared.')
    } catch (err: unknown) {
      setUpiError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpiLoading(false)
    }
  }

  return (
    <section>
      <SectionHeading id="account">Account</SectionHeading>
      <div className="space-y-6">
        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-6 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 flex items-center justify-center text-white font-semibold text-lg">
              {username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Username</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{username}</p>
            </div>
          </div>
        </div>

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-6 transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Change password</h3>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className={labelCls}>
                Current password
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
                  className={inputCls}
                />
                <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className={eyeBtnCls}>
                  <EyeIcon open={showCurrentPassword} />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="newPassword" className={labelCls}>
                New password
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
                  className={inputCls}
                />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className={eyeBtnCls}>
                  <EyeIcon open={showNewPassword} />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className={labelCls}>
                Confirm new password
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
                  className={inputCls}
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className={eyeBtnCls}>
                  <EyeIcon open={showConfirmPassword} />
                </button>
              </div>
            </div>

            {passwordError && <ErrorBanner message={passwordError} />}
            {passwordSuccess && <SuccessBanner message={passwordSuccess} />}

            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="lg" disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}>
                {passwordLoading ? (
                  <>
                    <Spinner />
                    <span>Changing password…</span>
                  </>
                ) : (
                  <span>Change password</span>
                )}
              </Button>
            </div>
          </form>
        </div>

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-6 transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Change username</h3>
          <form onSubmit={handleUsernameChange} className="space-y-4">
            <div>
              <label htmlFor="newUsername" className={labelCls}>
                New username
              </label>
              <input
                id="newUsername"
                type="text"
                autoComplete="username"
                required
                placeholder="Enter new username"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                className={inputCls.replace(' pr-12', '')}
              />
            </div>

            <div>
              <label htmlFor="usernamePassword" className={labelCls}>
                Confirm with password
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
                  className={inputCls}
                />
                <button type="button" onClick={() => setShowUsernamePassword(!showUsernamePassword)} className={eyeBtnCls}>
                  <EyeIcon open={showUsernamePassword} />
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">We need your password to confirm this change</p>
            </div>

            {usernameError && <ErrorBanner message={usernameError} />}
            {usernameSuccess && <SuccessBanner message={usernameSuccess} />}

            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="lg" disabled={usernameLoading || !newUsername || !usernamePassword}>
                {usernameLoading ? (
                  <>
                    <Spinner />
                    <span>Changing username…</span>
                  </>
                ) : (
                  <span>Change username</span>
                )}
              </Button>
            </div>
          </form>
        </div>

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-6 transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Your UPI ID</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Set your UPI handle once. Anyone who links an account to you sees a &ldquo;Pay via UPI&rdquo; button using this address &mdash; they no
            longer enter it themselves.
          </p>
          <form onSubmit={handleUpiSave} className="space-y-4">
            <div>
              <label htmlFor="upiId" className={labelCls}>
                UPI ID
              </label>
              <input
                id="upiId"
                type="text"
                autoComplete="off"
                inputMode="email"
                placeholder="e.g. name@oksbi or 9876543210@upi"
                value={upi}
                onChange={e => setUpi(e.target.value)}
                className={inputCls.replace(' pr-12', '')}
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Leave blank and save to clear it.</p>
            </div>

            {upiError && <ErrorBanner message={upiError} />}
            {upiSuccess && <SuccessBanner message={upiSuccess} />}

            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="lg" disabled={upiLoading}>
                {upiLoading ? (
                  <>
                    <Spinner />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>Save UPI ID</span>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}
