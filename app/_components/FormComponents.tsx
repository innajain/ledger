// components/FormComponents.tsx
import Link from 'next/link'
import type { accounting_head_type, Prisma } from '@/generated/prisma/client'
import { Card } from './Card'

// Page Header with Back Navigation
interface PageHeaderProps {
  backLink: string
  backText: string
  title: string
  description: string
}

export function PageHeader({ backLink, backText, title, description }: PageHeaderProps) {
  return (
    <div>
      <Link
        href={backLink}
        className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium mb-4"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {backText}
      </Link>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="text-slate-600 dark:text-slate-400 mt-1">{description}</p>
    </div>
  )
}

// Form Card Wrapper
interface FormCardProps {
  title: string
  children: React.ReactNode
}

export function FormCard({ title, children }: FormCardProps) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </Card>
  )
}

// Text Input Field
interface TextInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  helpText?: string
  autoComplete?: string
  inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric' | 'decimal' | 'search'
}

export function TextInput({ label, value, onChange, placeholder, required, helpText, autoComplete, inputMode }: TextInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
      />
      {helpText && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{helpText}</p>}
    </div>
  )
}

// Account Type Select
interface HeadTypeSelectProps {
  label: string
  value: accounting_head_type
  onChange: (value: accounting_head_type) => void
  disabled?: boolean
  restrictedTo?: accounting_head_type[]
}

export function HeadTypeSelect({ label, value, onChange, disabled, restrictedTo }: HeadTypeSelectProps) {
  const allowedTypes = restrictedTo || ['account', 'allocation', 'income_expense']

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as accounting_head_type)}
        disabled={disabled}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {allowedTypes.includes('account') && <option value="account">Account</option>}
        {allowedTypes.includes('allocation') && <option value="allocation">Allocation</option>}
        {allowedTypes.includes('income_expense') && <option value="income_expense">Income / Expense</option>}
      </select>
    </div>
  )
}

// Parent Account Select
interface ParentSelectProps {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  parents: Prisma.accounting_headGetPayload<Record<string, never>>[]
  excludeId?: string
  helpText?: string
}

export function ParentSelect({ label, value, onChange, parents, excludeId, helpText }: ParentSelectProps) {
  const filteredParents = excludeId ? parents.filter(p => p.id !== excludeId) : parents

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
      >
        <option value="">-- None (Top Level) --</option>
        {filteredParents.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {helpText && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{helpText}</p>}
    </div>
  )
}

// Asset Type Select
interface AssetTypeSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
}

export function AssetTypeSelect({ label, value, onChange }: AssetTypeSelectProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
      >
        <option value="rupees">Rupees</option>
        <option value="mf">Mutual Fund</option>
        <option value="etf">ETF</option>
        <option value="shares">Shares</option>
        <option value="other">Other</option>
      </select>
    </div>
  )
}

// Parent Asset Select
interface ParentAssetSelectProps {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  parents: Array<{ id: string; name: string }>
  excludeId?: string
  helpText?: string
}

export function ParentAssetSelect({ label, value, onChange, parents, excludeId, helpText }: ParentAssetSelectProps) {
  const filteredParents = excludeId ? parents.filter(p => p.id !== excludeId) : parents

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
      >
        <option value="">-- None (Top Level) --</option>
        {filteredParents.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {helpText && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{helpText}</p>}
    </div>
  )
}

// Error Alert Component
interface ErrorAlertProps {
  message: string | null
  onDismiss?: () => void
}

export function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
  if (!message) return null

  return (
    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
      <svg className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1">
        <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
          aria-label="Dismiss error"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// Toggle Switch
interface ToggleSwitchProps {
  label: string
  helpText?: string
  value: boolean
  onChange: (value: boolean) => void
}

export function ToggleSwitch({ label, helpText, value, onChange }: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
        {helpText && <p className="text-xs text-slate-500 dark:text-slate-400">{helpText}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
          value ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
        }`}
        role="switch"
        aria-checked={value}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  )
}

// Form Action Buttons
interface FormActionsProps {
  cancelLink: string
  submitText: string
  busy: boolean
  onDelete?: () => void
  deleteText?: string
}

export function FormActions({ cancelLink, submitText, busy, onDelete, deleteText }: FormActionsProps) {
  return (
    <div className="pt-6 border-t border-slate-200 dark:border-slate-700 flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3">
      {/* Delete Button */}
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="px-6 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium border border-red-200 dark:border-red-800 w-full sm:w-auto"
        >
          {deleteText || 'Delete'}
        </button>
      ) : (
        <span />
      )}

      {/* Submit/Cancel Buttons */}
      <div className="flex gap-3">
        <Link
          href={cancelLink}
          className="flex-1 sm:flex-none text-center px-6 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 sm:flex-none px-6 py-2.5 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {submitText}
        </button>
      </div>
    </div>
  )
}
