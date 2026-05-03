'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { asset_type } from '@/generated/prisma/enums'
import { create_transaction } from '@/app/_actions/transactions'
import { create_transaction_template, update_transaction_template } from '@/app/_actions/templates'
import { TransactionLineItems, LineItemData } from '@/app/_components/TransactionLineItems'
import { ErrorAlert } from '@/app/_components/AccountFormComponents'

export default function ClientPage({
  accounts,
  assets,
}: {
  accounts: { id: string; name: string; type: string }[]
  assets: { id: string; name: string; type: asset_type }[]
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

  const [date, setDate] = useState(() => toLocalDateTimeInputValue(new Date()))
  const [description, setDescription] = useState('')
  // Preferred defaults (use if present)
  const defaultReal = accounts.find(a => a.name === 'Google Pay' && a.type === 'real') ?? accounts.find(a => a.type === 'real') ?? accounts[0]
  const defaultAllocation =
    accounts.find(a => a.name === 'Discretionary Expenses' && a.type === 'allocation') ?? accounts.find(a => a.type === 'allocation') ?? accounts[0]
  const defaultNominal = accounts.find(a => a.name === 'Expenses' && a.type === 'nominal') ?? accounts.find(a => a.type === 'nominal') ?? accounts[0]
  const defaultAsset = assets.find(a => a.name === 'Money') ?? assets[0]

  const [items, setItems] = useState<LineItemData[]>([
    {
      account_id: defaultReal?.id ?? '',
      asset_id: defaultAsset?.id ?? '',
      quantity: null,
      book_value: null,
      description: '',
      datetime: '',
    },
    {
      account_id: defaultNominal?.id ?? '',
      asset_id: defaultAsset?.id ?? '',
      quantity: null,
      book_value: null,
      description: '',
      datetime: '',
    },
    {
      account_id: defaultAllocation?.id ?? '',
      asset_id: defaultAsset?.id ?? '',
      quantity: null,
      book_value: null,
      description: '',
      datetime: '',
    },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [loadedTemplateId, setLoadedTemplateId] = useState<string | null>(null)

  useEffect(() => {
    const rawTemplate = sessionStorage.getItem('ledger_quick_template')
    if (rawTemplate) {
      try {
        const parsed = JSON.parse(rawTemplate)
        if (parsed.id) setLoadedTemplateId(parsed.id)
        if (parsed.description) setDescription(parsed.description)
        if (parsed.line_items) {
          setItems(
            parsed.line_items.map((li: any) => ({
              account_id: li.account_id,
              asset_id: li.asset_id,
              quantity: li.quantity ?? null,
              book_value: li.book_value ?? null,
              description: li.description || '',
              datetime: '',
            })),
          )
        }
      } catch (e) {}
      sessionStorage.removeItem('ledger_quick_template')
    }
  }, [])
  // Nicely formatted preview of the entered date
  const formattedDate = (() => {
    try {
      const d = new Date(date)
      if (isNaN(d.getTime())) return null

      const day = d.getDate()
      const ordinal = (n: number) => {
        const j = n % 10
        const k = n % 100
        if (k >= 11 && k <= 13) return n + 'th'
        if (j === 1) return n + 'st'
        if (j === 2) return n + 'nd'
        if (j === 3) return n + 'rd'
        return n + 'th'
      }

      const month = d.toLocaleString('en-US', { month: 'long' })
      const year = d.getFullYear()
      const time = d.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      return `${ordinal(day)} ${month} ${year}, ${time}`
    } catch {
      return null
    }
  })()

  function addItemForType(typeKey: string) {
    let preferred: { id: string; name?: string; type?: string } | undefined
    if (typeKey === 'real') preferred = accounts.find(a => a.name === 'Google Pay' && a.type === 'real')
    if (typeKey === 'allocation') preferred = accounts.find(a => a.name === 'Discretionary Expenses' && a.type === 'allocation')
    if (typeKey === 'nominal') preferred = accounts.find(a => a.name === 'Expenses' && a.type === 'nominal')
    const defaultAcc = preferred ?? accounts.find(a => a.type === typeKey) ?? accounts[0]
    setItems(prev => [
      {
        account_id: defaultAcc?.id ?? '',
        asset_id: defaultAsset?.id ?? assets[0]?.id ?? '',
        quantity: null,
        book_value: null,
        description: '',
        datetime: '',
      },
      ...prev,
    ])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(idx: number, field: keyof LineItemData, value: string | null) {
    setItems(prev => {
      const copy = [...prev]
      // Allow `quantity` and `book_value` to be null; coerce other nulls to empty string
      const v: string = field === 'quantity' || field === 'book_value' ? (value === null ? '' : value) : (value ?? '')
      copy[idx] = { ...copy[idx], [field]: v }
      // Clear book_value when switching to rupees asset
      if (field === 'asset_id') {
        const sel = assets.find(a => a.id === v)
        if (sel?.type === asset_type.rupees) copy[idx].book_value = null
      }
      // Preserve null for quantity/book_value when requested
      if (field === 'quantity' && value === null) {
        ;(copy[idx] as LineItemData).quantity = null
      }
      if (field === 'book_value' && value === null) {
        ;(copy[idx] as LineItemData).book_value = null
      }
      return copy
    })
  }

  async function handleUpdateTemplate() {
    if (!loadedTemplateId) return
    setTemplateError(null)
    setSavingTemplate(true)
    try {
      const line_items = items.map(it => ({
        account_id: it.account_id,
        asset_id: it.asset_id,
        quantity: it.quantity === null || it.quantity === '' ? undefined : Number(it.quantity),
        book_value: it.book_value === null || it.book_value === '' ? null : Number(it.book_value),
        description: it.description === '' ? null : it.description,
      }))
      const result: any = await update_transaction_template(loadedTemplateId, line_items as any, description || null)
      if (!result.success) {
        setTemplateError(result.message)
      } else {
        alert('Template updated!')
      }
    } catch (err: any) {
      setTemplateError(err.message || String(err))
    } finally {
      setSavingTemplate(false)
    }
  }

  async function handleSaveTemplate() {
    setTemplateError(null)
    setSavingTemplate(true)
    try {
      const line_items = items.map(it => ({
        account_id: it.account_id,
        asset_id: it.asset_id,
        quantity: it.quantity === null || it.quantity === '' ? undefined : Number(it.quantity),
        book_value: it.book_value === null || it.book_value === '' ? null : Number(it.book_value),
        description: it.description === '' ? null : it.description,
      }))
      const result: any = await create_transaction_template(line_items as any, description || null)
      if (!result.success) {
        setTemplateError(result.message)
      } else {
        alert('Template saved!')
      }
    } catch (err: any) {
      setTemplateError(err.message || String(err))
    } finally {
      setSavingTemplate(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const line_items = items.map(it => ({
        account_id: it.account_id,
        asset_id: it.asset_id,
        quantity: it.quantity === null || it.quantity === '' ? undefined : Number(it.quantity),
        book_value: it.book_value === null || it.book_value === '' ? null : Number(it.book_value),
        description: it.description === '' ? null : it.description,
        datetime: it.datetime === '' ? null : new Date(it.datetime),
      }))
      const result = await create_transaction(new Date(date), line_items, description || null)
      if (result.success) {
        window.location.href = `/transactions/${result.data!.id}`
      } else {
        setError(result.message)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/transactions"
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Transactions
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Create Transaction</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Add a new transaction with line items</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Basic Info Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Transaction Details</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date & Time</label>
              <input
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
              {formattedDate && <div className="text-sm text-slate-600 dark:text-slate-400 mt-2 italic">{formattedDate}</div>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Enter transaction description"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <TransactionLineItems
          items={items}
          accounts={accounts}
          assets={assets}
          onAddItem={addItemForType}
          onRemoveItem={removeItem}
          onUpdateItem={updateItem}
        />

        {/* Error Display */}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
        {templateError && <ErrorAlert message={templateError} onDismiss={() => setTemplateError(null)} />}

        {/* Submit Button */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {loadedTemplateId && (
              <button
                type="button"
                onClick={handleUpdateTemplate}
                disabled={savingTemplate}
                className="w-full sm:w-auto px-6 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-indigo-200 dark:border-indigo-800"
              >
                {savingTemplate ? 'Updating...' : 'Update Quick Template'}
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={savingTemplate}
              className="w-full sm:w-auto px-6 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-emerald-200 dark:border-emerald-800"
            >
              {savingTemplate ? 'Saving...' : 'Save as New Template'}
            </button>
          </div>

          <div className="flex w-full sm:w-auto justify-end gap-3 pt-4 sm:pt-0 border-t sm:border-0 border-slate-200">
            <Link
              href="/transactions"
              className="flex-1 sm:flex-none text-center px-6 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 sm:flex-none px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {busy ? 'Creating...' : 'Create Transaction'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
