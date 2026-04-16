'use client'

import { useState } from 'react'
import { create_account, update_account } from '@/app/_actions/resources'
import type { Prisma, account_type } from '@/generated/prisma/client'
import { PageHeader, FormCard, TextInput, ParentSelect, FormActions, ErrorAlert } from '@/app/_components/AccountFormComponents'

type AccountFormConfig = {
  accountType: account_type
  entityName: string // "Account", "Allocation", "Nominal Account"
  basePath: string // "/accounts", "/allocations", "/income_expenses"
  backText: string
  parentLabel: string
  parentHelpText: string
}

type CreateAccountFormProps = {
  parents: Prisma.accountGetPayload<Record<string, never>>[]
  config: AccountFormConfig
}

type UpdateAccountFormProps = {
  account: Prisma.accountGetPayload<Record<string, never>>
  parents: Prisma.accountGetPayload<Record<string, never>>[]
  config: AccountFormConfig
  deleteAccount?: (id: string) => Promise<{ success: boolean; message: string }>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await update_account(account.id, name, config.accountType, parentId)
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
