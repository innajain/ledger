'use client'

import { useState } from 'react'
import { create_account, update_account } from '@/app/_actions/resources'
import type { Prisma, accounting_head_type } from '@/generated/prisma/client'
import type { ActionResult } from '@/app/_actions/_result'
import { PageHeader, FormCard, TextInput, ParentSelect, FormActions, ErrorAlert, ToggleSwitch } from '@/app/_components/AccountFormComponents'

type AccountFormConfig = {
  accountType: accounting_head_type
  entityName: string // "Account", "Allocation", "Nominal Account"
  basePath: string // "/accounts", "/allocations", "/income_expenses"
  backText: string
  parentLabel: string
  parentHelpText: string
}

const ACCOUNT_FORM_CONFIGS: Record<accounting_head_type, AccountFormConfig> = {
  account: {
    accountType: 'account',
    entityName: 'Account',
    basePath: '/accounts',
    backText: 'Accounts',
    parentLabel: 'Parent Account (Optional)',
    parentHelpText: 'Select a parent to create a sub-account',
  },
  allocation: {
    accountType: 'allocation',
    entityName: 'Allocation',
    basePath: '/allocations',
    backText: 'Allocations',
    parentLabel: 'Parent Allocation (Optional)',
    parentHelpText: 'Select a parent to create a sub-allocation',
  },
  income_expense: {
    accountType: 'income_expense',
    entityName: 'Nominal Account',
    basePath: '/income_expenses',
    backText: 'Nominal Accounts',
    parentLabel: 'Parent Account (Optional)',
    parentHelpText: 'Select a parent to create a sub-account',
  },
}

export function accountFormConfig(type: accounting_head_type): AccountFormConfig {
  return ACCOUNT_FORM_CONFIGS[type]
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
}

export function CreateAccountForm({ parents, config }: CreateAccountFormProps) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  // UPI only makes sense for real accounts (payees you'd send money to).
  // For allocations / income_expenses the field stays hidden and unsaved.
  const supportsUpi = config.accountType === 'account'
  const [upiId, setUpiId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await create_account(name, config.accountType, parentId ?? undefined, supportsUpi ? upiId : undefined)
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
  const [isPlaceholder, setIsPlaceholder] = useState(account.is_placeholder)
  const supportsUpi = config.accountType === 'account'
  const [upiId, setUpiId] = useState(account.upi_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await update_account(account.id, name, config.accountType, parentId, isActive, isPlaceholder, supportsUpi ? upiId : undefined)
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
