'use client'

import { useState } from 'react'
import { create_account, update_account, find_user_by_username } from '@/app/_actions/resources'
import type { Prisma, accounting_head_type } from '@/generated/prisma/client'
import type { ActionResult } from '@/app/_actions/_result'
import { PageHeader, FormCard, TextInput, ParentSelect, FormActions, ErrorAlert, ToggleSwitch } from '@/app/_components/AccountFormComponents'

type AccountFormConfig = {
  headType: accounting_head_type
  entityName: string // "Account", "Allocation", "Income / Expense"
  basePath: string // "/heads/account", "/heads/allocation", "/heads/income_expense"
  backText: string
  parentLabel: string
  parentHelpText: string
}

const ACCOUNT_FORM_CONFIGS: Record<accounting_head_type, AccountFormConfig> = {
  account: {
    headType: 'account',
    entityName: 'Account',
    basePath: '/heads/account',
    backText: 'Accounts',
    parentLabel: 'Parent Account (Optional)',
    parentHelpText: 'Select a parent to create a sub-account',
  },
  allocation: {
    headType: 'allocation',
    entityName: 'Allocation',
    basePath: '/heads/allocation',
    backText: 'Allocations',
    parentLabel: 'Parent Allocation (Optional)',
    parentHelpText: 'Select a parent to create a sub-allocation',
  },
  income_expense: {
    headType: 'income_expense',
    entityName: 'Income / Expense',
    basePath: '/heads/income_expense',
    backText: 'Income & Expenses',
    parentLabel: 'Parent Account (Optional)',
    parentHelpText: 'Select a parent to create a sub-account',
  },
}

export function accountFormConfig(type: accounting_head_type): AccountFormConfig {
  return ACCOUNT_FORM_CONFIGS[type]
}

// Picker for linking this account to another user. Resolves a username to a
// user id via find_user_by_username; transactions touching a linked account
// become approval-gated in the other user's ledger.
function LinkedUserField({
  linkedUserId,
  linkedUsername,
  onChange,
}: {
  linkedUserId: string | null
  linkedUsername: string | null
  onChange: (id: string | null, username: string | null) => void
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function link() {
    setErr(null)
    setBusy(true)
    try {
      const res = await find_user_by_username(input.trim())
      if (!res.success) throw new Error(res.message)
      onChange(res.data!.id, res.data!.username)
      setInput('')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Linked User (Optional)</label>
      {linkedUserId ? (
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium">
            Linked to @{linkedUsername ?? 'user'}
          </span>
          <button type="button" onClick={() => onChange(null, null)} className="text-sm text-red-600 dark:text-red-400 hover:underline">
            Clear
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (input.trim()) link()
              }
            }}
            placeholder="another user's username"
            autoComplete="off"
            className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={link}
            disabled={busy || !input.trim()}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium disabled:opacity-50"
          >
            {busy ? 'Linking…' : 'Link'}
          </button>
        </div>
      )}
      {err && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{err}</p>}
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Link this account to another user so transactions touching it sync to their ledger for approval.
      </p>
    </div>
  )
}

type CreateAccountFormProps = {
  parents: Prisma.accounting_headGetPayload<Record<string, never>>[]
  config: AccountFormConfig
}

type UpdateAccountFormProps = {
  account: Prisma.accounting_headGetPayload<Record<string, never>>
  parents: Prisma.accounting_headGetPayload<Record<string, never>>[]
  config: AccountFormConfig
  deleteAccount?: (id: string) => Promise<ActionResult>
  // Username of the currently linked user (resolved server-side for display).
  linkedUsername?: string | null
}

export function CreateAccountForm({ parents, config }: CreateAccountFormProps) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  // UPI only makes sense for accounts (payees you'd send money to).
  // For allocations / income_expenses the field stays hidden and unsaved.
  const supportsUpi = config.headType === 'account'
  const [upiId, setUpiId] = useState('')
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null)
  const [linkedUsername, setLinkedUsername] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await create_account(
        name,
        config.headType,
        parentId ?? undefined,
        supportsUpi ? upiId : undefined,
        supportsUpi ? (linkedUserId ?? undefined) : undefined,
      )
      if (!result.success) throw new Error(result.message)
      window.location.href = config.basePath
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backLink={config.basePath}
        backText={config.backText}
        title={`Create ${config.entityName}`}
        description={`Add a new ${config.entityName.toLowerCase()} to your ledger`}
      />

      <form onSubmit={onCreate} className="space-y-6">
        <FormCard title={`${config.entityName} Details`}>
          <TextInput
            label={`${config.entityName} Name`}
            value={name}
            onChange={setName}
            placeholder={`Enter ${config.entityName.toLowerCase()} name`}
            required
          />

          <ParentSelect label={config.parentLabel} value={parentId} onChange={setParentId} parents={parents} helpText={config.parentHelpText} />

          {supportsUpi && (
            <TextInput
              label="UPI ID (Optional)"
              value={upiId}
              onChange={setUpiId}
              placeholder="e.g. name@bank or 9876543210@upi"
              helpText="When set, a Pay via UPI button appears on this account. Phone numbers need the @upi suffix."
              autoComplete="off"
            />
          )}

          {supportsUpi && (
            <LinkedUserField
              linkedUserId={linkedUserId}
              linkedUsername={linkedUsername}
              onChange={(id, un) => {
                setLinkedUserId(id)
                setLinkedUsername(un)
              }}
            />
          )}
        </FormCard>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <FormActions cancelLink={config.basePath} submitText={busy ? 'Creating...' : `Create ${config.entityName}`} busy={busy} />
      </form>
    </div>
  )
}

export function UpdateAccountForm({ account, parents, config, deleteAccount, linkedUsername: initialLinkedUsername }: UpdateAccountFormProps) {
  const [name, setName] = useState(account.name)
  const [parentId, setParentId] = useState<string | null>(account.parent_id ?? null)
  const [isActive, setIsActive] = useState(account.is_active)
  const [isPlaceholder, setIsPlaceholder] = useState(account.is_placeholder)
  const supportsUpi = config.headType === 'account'
  const [upiId, setUpiId] = useState(account.upi_id ?? '')
  const [linkedUserId, setLinkedUserId] = useState<string | null>(account.linked_user_id ?? null)
  const [linkedUsername, setLinkedUsername] = useState<string | null>(initialLinkedUsername ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await update_account(
        account.id,
        name,
        config.headType,
        parentId,
        isActive,
        isPlaceholder,
        supportsUpi ? upiId : undefined,
        supportsUpi ? linkedUserId : undefined,
      )
      if (!result.success) throw new Error(result.message)
      window.location.href = config.basePath
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!deleteAccount) {
      setError('Delete operation is not available')
      return
    }
    if (!confirm(`Delete this ${config.entityName.toLowerCase()}? This action cannot be undone.`)) return
    setError(null)
    try {
      const result = await deleteAccount(account.id)
      if (!result.success) throw new Error(result.message)
      window.location.href = config.basePath
    } catch (err: unknown) {
      setError('Delete failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backLink={config.basePath}
        backText={config.backText}
        title={`Update ${config.entityName}`}
        description={`Modify ${config.entityName.toLowerCase()} details or delete`}
      />

      <form onSubmit={onUpdate} className="space-y-6">
        <FormCard title={`${config.entityName} Details`}>
          <TextInput
            label={`${config.entityName} Name`}
            value={name}
            onChange={setName}
            placeholder={`Enter ${config.entityName.toLowerCase()} name`}
            required
          />

          <ParentSelect
            label={config.parentLabel}
            value={parentId}
            onChange={setParentId}
            parents={parents}
            excludeId={account.id}
            helpText={config.parentHelpText}
          />

          {supportsUpi && (
            <TextInput
              label="UPI ID (Optional)"
              value={upiId}
              onChange={setUpiId}
              placeholder="e.g. name@bank or 9876543210@upi"
              helpText="When set, a Pay via UPI button appears on this account. Phone numbers need the @upi suffix. Leave blank to clear."
              autoComplete="off"
            />
          )}

          {supportsUpi && (
            <LinkedUserField
              linkedUserId={linkedUserId}
              linkedUsername={linkedUsername}
              onChange={(id, un) => {
                setLinkedUserId(id)
                setLinkedUsername(un)
              }}
            />
          )}

          <ToggleSwitch label="Active" helpText="Inactive accounts are hidden from transaction selectors" value={isActive} onChange={setIsActive} />
          <ToggleSwitch
            label="Placeholder"
            helpText="Placeholder accounts exist only to group sub-accounts and are hidden from transaction selectors"
            value={isPlaceholder}
            onChange={setIsPlaceholder}
          />
        </FormCard>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <FormActions
          cancelLink={config.basePath}
          submitText={busy ? 'Updating...' : `Update ${config.entityName}`}
          busy={busy}
          onDelete={deleteAccount ? onDelete : undefined}
          deleteText={`Delete ${config.entityName}`}
        />
      </form>
    </div>
  )
}
