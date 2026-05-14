'use client'

import { useState } from 'react'
import { create_account, update_account } from '@/app/_actions/resources'
import type { Prisma, account_type } from '@/generated/prisma/client'
import type { ActionResult } from '@/app/_actions/_result'
import { PageHeader, FormCard, TextInput, ParentSelect, FormActions, ErrorAlert } from '@/app/_components/AccountFormComponents'

type AccountFormConfig = {
  accountType: account_type
  entityName: string // "Account", "Allocation", "Nominal Account"
  basePath: string // "/accounts", "/allocations", "/income_expenses"
  backText: string
  parentLabel: string
  parentHelpText: string
}

const ACCOUNT_FORM_CONFIGS: Record<account_type, AccountFormConfig> = {
  real: {
    accountType: 'real',
    entityName: 'Account',
    basePath: '/accounts',
    backText: 'Back to Accounts',
    parentLabel: 'Parent Account (Optional)',
    parentHelpText: 'Select a parent to create a sub-account',
  },
  allocation: {
    accountType: 'allocation',
    entityName: 'Allocation',
    basePath: '/allocations',
    backText: 'Back to Allocations',
    parentLabel: 'Parent Allocation (Optional)',
    parentHelpText: 'Select a parent to create a sub-allocation',
  },
  nominal: {
    accountType: 'nominal',
    entityName: 'Nominal Account',
    basePath: '/income_expenses',
    backText: 'Back to Nominal Accounts',
    parentLabel: 'Parent Account (Optional)',
    parentHelpText: 'Select a parent to create a sub-account',
  },
}

export function accountFormConfig(type: account_type): AccountFormConfig {
  return ACCOUNT_FORM_CONFIGS[type]
}

type CreateAccountFormProps = {
  parents: Prisma.accountGetPayload<Record<string, never>>[]
  config: AccountFormConfig
}

type UpdateAccountFormProps = {
  account: Prisma.accountGetPayload<Record<string, never>>
  parents: Prisma.accountGetPayload<Record<string, never>>[]
  config: AccountFormConfig
  deleteAccount?: (id: string) => Promise<ActionResult>
}

export function CreateAccountForm({ parents, config }: CreateAccountFormProps) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await create_account(name, config.accountType, parentId ?? undefined)
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
        </FormCard>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <FormActions cancelLink={config.basePath} submitText={busy ? 'Creating...' : `Create ${config.entityName}`} busy={busy} />
      </form>
    </div>
  )
}

export function UpdateAccountForm({ account, parents, config, deleteAccount }: UpdateAccountFormProps) {
  const [name, setName] = useState(account.name)
  const [parentId, setParentId] = useState<string | null>(account.parent_id ?? null)
  const [isActive, setIsActive] = useState(account.is_active)
  const [isPlaceholder, setIsPlaceholder] = useState(account.is_placeholder_acc)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await update_account(account.id, name, config.accountType, parentId, isActive, isPlaceholder)
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

          <div className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Active</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Inactive accounts are hidden from transaction selectors</p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(v => !v)}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
                isActive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
              role="switch"
              aria-checked={isActive}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Placeholder</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Placeholder accounts exist only to group sub-accounts and are hidden from transaction selectors</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPlaceholder(v => !v)}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
                isPlaceholder ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
              role="switch"
              aria-checked={isPlaceholder}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isPlaceholder ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
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
