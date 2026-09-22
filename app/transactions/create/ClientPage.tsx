'use client'

import React, { useState, useEffect, useRef, useId, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { asset_type } from '@/generated/prisma/enums'
import { create_transaction } from '@/app/_actions/transactions'
import { save_attachments, type AttachmentInput } from '@/app/_actions/attachments'
import { create_transaction_template, update_transaction_template } from '@/app/_actions/templates'
import { check_possible_duplicate } from './check_duplicate'
import type { CreateLineItemInput, PossibleDuplicate } from '@/app/_core/transactions_core'
import { TransactionLineItems, TransactionBalanceSummary, LineItemData, new_line_uid } from '@/app/_components/TransactionLineItems'
import { Button, ButtonLink } from '@/app/_components/Button'
import { ChevronLeftIcon, WarningIcon } from '@/app/_components/icons'
import { plain_currency_fmt } from '@/app/_utils/currency_formatter'
import { AttachmentUpload } from '@/app/_components/AttachmentUpload'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import type { LineItemDefaults } from '@/app/_actions/preferences'
import { pickDefaultAccount, pickDefaultAsset, type AccountTypeKey } from '@/app/_utils/line_item_defaults'
import { useToast } from '@/app/_components/Toast'
import { TagPicker, type TagOption } from '@/app/_components/TagPicker'

export default function ClientPage({
  accounts,
  assets,
  defaults,
  tags = [],
  attachmentsEnabled = false,
}: {
  accounts: { id: string; name: string; type: string }[]
  assets: { id: string; name: string; type: asset_type }[]
  defaults: LineItemDefaults
  tags?: TagOption[]
  attachmentsEnabled?: boolean
}) {
  function toLocalDateTimeInputValue(d: Date | string) {
    const dt = typeof d === 'string' ? new Date(d) : d
    if (!dt || isNaN(dt.getTime())) return ''
    const yyyy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    const hh = String(dt.getHours()).padStart(2, '0')
    const min = String(dt.getMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`
  }

  const router = useRouter()
  const { showToast } = useToast()
  const uid = useId()
  const [date, setDate] = useState(() => toLocalDateTimeInputValue(new Date()))
  const [description, setDescription] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [isFuture, setIsFuture] = useState(false)
  const defaultAccount = pickDefaultAccount(accounts, defaults, 'account')
  const defaultAllocation = pickDefaultAccount(accounts, defaults, 'allocation')
  const defaultIncomeExpense = pickDefaultAccount(accounts, defaults, 'income_expense')
  const defaultAsset = pickDefaultAsset(assets, defaults)

  const [items, setItems] = useState<LineItemData[]>([
    {
      uid: new_line_uid(),
      accounting_head_id: defaultAccount?.id ?? '',
      asset_id: defaultAsset?.id ?? '',
      quantity: null,
      txn_value: null,
      description: '',
      datetime: '',
    },
    {
      uid: new_line_uid(),
      accounting_head_id: defaultIncomeExpense?.id ?? '',
      asset_id: defaultAsset?.id ?? '',
      quantity: null,
      txn_value: null,
      description: '',
      datetime: '',
    },
    {
      uid: new_line_uid(),
      accounting_head_id: defaultAllocation?.id ?? '',
      asset_id: defaultAsset?.id ?? '',
      quantity: null,
      txn_value: null,
      description: '',
      datetime: '',
    },
  ])
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentInput[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState<PossibleDuplicate | null>(null)
  const dupWarningRef = useRef<HTMLDivElement>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const rawTemplate = sessionStorage.getItem('ledger_quick_template')
    if (rawTemplate) {
      try {
        const parsed = JSON.parse(rawTemplate) as {
          id?: string
          description?: string
          line_items?: {
            accounting_head_id: string
            asset_id: string
            quantity?: number | null
            txn_value?: number | null
            description?: string
          }[]
        }
        if (parsed.id) setLoadedTemplateId(parsed.id)
        if (parsed.description) setDescription(parsed.description)
        if (parsed.line_items) {
          setItems(
            parsed.line_items.map(li => ({
              uid: new_line_uid(),
              accounting_head_id: li.accounting_head_id,
              asset_id: li.asset_id,
              quantity: li.quantity == null ? null : String(li.quantity),
              txn_value: li.txn_value == null ? null : String(li.txn_value),
              description: li.description || '',
              datetime: '',
            })),
          )
        }
      } catch {}
      sessionStorage.removeItem('ledger_quick_template')
    }
  }, [])

  useEffect(() => {
    if (dupWarning) dupWarningRef.current?.focus()
  }, [dupWarning])

  // Stable identities so the memoized TransactionLineItems tree skips re-rendering on
  // header-field keystrokes (description/reference/date live in this component's state)
  const addItemForType = useCallback(
    (typeKey: string) => {
      const defaultAcc = pickDefaultAccount(accounts, defaults, typeKey as AccountTypeKey)
      const defaultAst = pickDefaultAsset(assets, defaults)
      setItems(prev => [
        {
          uid: new_line_uid(),
          accounting_head_id: defaultAcc?.id ?? '',
          asset_id: defaultAst?.id ?? assets[0]?.id ?? '',
          quantity: null,
          txn_value: null,
          description: '',
          datetime: '',
        },
        ...prev,
      ])
    },
    [accounts, assets, defaults],
  )

  const removeItem = useCallback((i: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }, [])

  const updateItem = useCallback(
    (idx: number, field: keyof LineItemData, value: string | null) => {
      setItems(prev => {
        const copy = [...prev]

        const v: string = field === 'quantity' || field === 'txn_value' ? (value === null ? '' : value) : (value ?? '')
        copy[idx] = { ...copy[idx], [field]: v }

        if (field === 'asset_id') {
          const sel = assets.find(a => a.id === v)
          if (sel?.type === asset_type.rupees) copy[idx].txn_value = null
        }

        if (field === 'quantity' && value === null) {
          ;(copy[idx] as LineItemData).quantity = null
        }
        if (field === 'txn_value' && value === null) {
          ;(copy[idx] as LineItemData).txn_value = null
        }
        return copy
      })
    },
    [assets],
  )

  async function handleUpdateTemplate() {
    if (!loadedTemplateId) return
    setTemplateError(null)
    setSavingTemplate(true)
    try {
      const line_items = items.map(it => ({
        accounting_head_id: it.accounting_head_id,
        asset_id: it.asset_id,
        quantity: it.quantity === null || it.quantity === '' ? undefined : Number(it.quantity),
        txn_value: it.txn_value === null || it.txn_value === '' ? null : Number(it.txn_value),
        description: it.description === '' ? null : it.description,
      }))
      const result = await update_transaction_template(loadedTemplateId, line_items, description || null)
      if (!result.success) {
        setTemplateError(result.message)
      } else {
        showToast('Template updated', 'success')
      }
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingTemplate(false)
    }
  }

  async function handleSaveTemplate() {
    setTemplateError(null)
    setSavingTemplate(true)
    try {
      const line_items = items.map(it => ({
        accounting_head_id: it.accounting_head_id,
        asset_id: it.asset_id,
        quantity: it.quantity === null || it.quantity === '' ? undefined : Number(it.quantity),
        txn_value: it.txn_value === null || it.txn_value === '' ? null : Number(it.txn_value),
        description: it.description === '' ? null : it.description,
      }))
      const result = await create_transaction_template(line_items, description || null)
      if (!result.success) {
        setTemplateError(result.message)
      } else {
        showToast('Template saved', 'success')
      }
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingTemplate(false)
    }
  }

  function buildLineItems(): CreateLineItemInput[] {
    return items.map(it => ({
      accounting_head_id: it.accounting_head_id,
      asset_id: it.asset_id,
      quantity: it.quantity === null || it.quantity === '' ? undefined : Number(it.quantity),
      txn_value: it.txn_value === null || it.txn_value === '' ? null : Number(it.txn_value),
      description: it.description === '' ? null : it.description,
      datetime: it.datetime === '' ? null : new Date(it.datetime),
    }))
  }

  async function doCreate(line_items: CreateLineItemInput[]) {
    const result = await create_transaction(new Date(date), line_items, description || null, { is_future: isFuture, tag_ids: tagIds })
    if (result.success) {
      if (pendingAttachments.length > 0) {
        await save_attachments(result.data!.id, pendingAttachments)
      }
      router.push(`/transactions/${result.data!.id}`)
    } else {
      setError(result.message)
      setBusy(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDupWarning(null)
    setBusy(true)
    try {
      const line_items = buildLineItems()
      // Best-effort near-duplicate check; a failed check never blocks creating
      const chk = await check_possible_duplicate(new Date(date), line_items).catch(() => null)
      if (chk?.success && chk.data!.duplicate) {
        setDupWarning(chk.data!.duplicate)
        setBusy(false)
        return
      }
      await doCreate(line_items)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  async function onCreateAnyway() {
    setError(null)
    setDupWarning(null)
    setBusy(true)
    try {
      await doCreate(buildLineItems())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {}
      <div>
        <Link
          href="/transactions"
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium mb-4"
        >
          <ChevronLeftIcon />
          Transactions
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">New transaction</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Transaction details</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor={`${uid}-date`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Date & time
              </label>
              <input
                id={`${uid}-date`}
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
              {date && (
                <div className="text-sm text-slate-600 dark:text-slate-400 mt-2 italic">
                  <LocalDateTime value={date} />
                </div>
              )}
            </div>

            <div>
              <label htmlFor={`${uid}-description`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Description
              </label>
              <input
                id={`${uid}-description`}
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Enter transaction description"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tags</span>
              <TagPicker options={tags} value={tagIds} onChange={setTagIds} />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Optional labels for finding similar transactions later — “Eating out”, “Goa trip”. They don&apos;t affect any balance.
              </p>
            </div>

            {attachmentsEnabled && (
              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Attachments</span>
                <AttachmentUpload onPendingChange={setPendingAttachments} />
              </div>
            )}

            <div>
              <label
                htmlFor={`${uid}-is-future`}
                className="flex items-start gap-3 cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-4"
              >
                <input
                  id={`${uid}-is-future`}
                  type="checkbox"
                  checked={isFuture}
                  onChange={e => setIsFuture(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Future transaction</span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Won&apos;t affect balances, net worth or XIRR until converted to a real transaction.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {}
        <TransactionLineItems
          items={items}
          accounts={accounts}
          assets={assets}
          onAddItem={addItemForType}
          onRemoveItem={removeItem}
          onUpdateItem={updateItem}
        />

        {}
        {dupWarning && (
          <div
            ref={dupWarningRef}
            role="alert"
            tabIndex={-1}
            className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg space-y-3"
          >
            <div className="flex items-start gap-3">
              <WarningIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-amber-800 dark:text-amber-200">
                <p className="font-semibold">This looks like a duplicate</p>
                <p className="mt-1">
                  An existing transaction{dupWarning.description ? ` (“${dupWarning.description}”)` : ''} already moves{' '}
                  <span className="font-semibold">{plain_currency_fmt.format(dupWarning.amount)}</span> on the same account within a day of this one.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pl-8">
              <Link
                href={`/transactions/${dupWarning.id}`}
                target="_blank"
                className="text-sm font-medium text-amber-800 dark:text-amber-200 underline hover:no-underline"
              >
                View the existing transaction
              </Link>
              <button
                type="button"
                onClick={onCreateAnyway}
                disabled={busy}
                className="px-4 py-1.5 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {busy ? 'Creating…' : 'Create anyway'}
              </button>
              <button type="button" onClick={() => setDupWarning(null)} className="text-sm text-amber-700 dark:text-amber-300 hover:underline">
                Dismiss
              </button>
            </div>
          </div>
        )}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
        {templateError && <ErrorAlert message={templateError} onDismiss={() => setTemplateError(null)} />}

        {/* Reward early, punish late: a pristine form gets no warning — the live balance
            read-out appears once the user has actually entered an amount. */}
        {items.some(it => (it.quantity ?? '') !== '' || (it.txn_value ?? '') !== '') && (
          <TransactionBalanceSummary items={items} accounts={accounts} assets={assets} />
        )}

        {}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {loadedTemplateId && (
              <Button variant="secondary" onClick={handleUpdateTemplate} disabled={savingTemplate} className="w-full sm:w-auto">
                {savingTemplate ? 'Updating…' : 'Update template'}
              </Button>
            )}
            <Button variant="secondary" onClick={handleSaveTemplate} disabled={savingTemplate} className="w-full sm:w-auto">
              {savingTemplate ? 'Saving…' : 'Save as template'}
            </Button>
          </div>

          <div className="flex w-full sm:w-auto justify-end gap-3 pt-4 sm:pt-0 border-t sm:border-0 border-slate-200 dark:border-slate-700">
            <ButtonLink href="/transactions" variant="secondary" className="flex-1 sm:flex-none">
              Cancel
            </ButtonLink>
            <Button type="submit" variant="primary" disabled={busy} className="flex-1 sm:flex-none">
              {busy ? 'Creating…' : 'Create transaction'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
