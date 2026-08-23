'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ViewPageHeader, InfoCard, EmptyState, LineItemRow } from '@/app/_components/ViewPageComponents'
import { HoldingsGrid, HoldingItem } from '@/app/_components/HoldingsGrid'
import { Card } from '@/app/_components/Card'
import { asset_type } from '@/generated/prisma/enums'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { ValueChart, type ValuePoint } from '@/app/_components/ValueChart'
import { UpiPayButton } from '@/app/_components/UpiPayButton'
import { LinkedUserNotify } from '@/app/_components/LinkedUserNotify'
import { AsOfBalance } from '@/app/_components/AsOfBalance'
import { create_upi_payment } from '@/app/_actions/transactions'
import type { ActionResult } from '@/app/_actions/_result'
import type { ClosingBalance } from '@/app/heads/[type]/[id]/closing_balance'

export type LineItem = {
  id: string
  asset_id?: string
  asset_name: string
  quantity: number
  txn_value: number | null
  current_value: number
  transaction_id: string
  transaction_date: string
  transaction_description: string | null
  line_item_description: string | null
  asset_type: asset_type
  remaining_quantity?: number | null
}

export type HeadData = {
  id: string
  name: string
  total: number

  subtree_total?: number | null

  children?: { id: string; name: string; link: string; total: number }[]

  parent?: { name: string; link: string } | null

  linked_user?: { id: string; username: string } | null
  // humanized IST day (e.g. "4 Aug 2026") — accounts only
  lock_date?: string | null
  xirr?: number | null

  upi_id?: string | null
  breakdown: {
    asset_id: string
    asset_name: string
    asset_type: asset_type
    quantity: number
    txn_value: number | null
    current_value: number
  }[]
  line_items: LineItem[]
  value_timeseries?: ValuePoint[]
}

type HeadDetailConfig = {
  backLink: string
  backText: string
  entityName: string
  holdingsTitle?: string
}

type HeadDetailPageProps = {
  head: HeadData
  config: HeadDetailConfig
  closingBalanceAction?: (head_id: string, date: string) => Promise<ActionResult<ClosingBalance>>
  // account-type heads only — reconciliation runs against a single bank account
  canReconcile?: boolean
}

const LINE_ITEMS_PAGE = 100

export function HeadDetailPage({ head, config, closingBalanceAction, canReconcile = false }: HeadDetailPageProps) {
  const router = useRouter()
  const editLink = `${config.backLink}/${head.id}/update`
  const [pay_status, set_pay_status] = useState<{ kind: 'ok'; txn_id: string } | { kind: 'err'; message: string } | null>(null)
  const [visibleLineItems, setVisibleLineItems] = useState(LINE_ITEMS_PAGE)

  const holdingsItems: HoldingItem[] = head.breakdown.map(b => ({
    id: b.asset_id,
    name: b.asset_name,
    link: `/assets/${b.asset_id}`,
    asset_type: b.asset_type,
    quantity: b.quantity,
    txn_value: b.txn_value,
    current_value: b.current_value,
  }))

  async function handle_mark_paid(amount: number, note: string) {
    const result = await create_upi_payment({
      payee_account_id: head.id,
      amount,
      description: note || null,
    })
    if (result.success) {
      set_pay_status({ kind: 'ok', txn_id: result.data!.id })

      router.refresh()
    } else {
      set_pay_status({ kind: 'err', message: result.message })
    }
  }

  return (
    <div className="space-y-6">
      <ViewPageHeader
        backLink={config.backLink}
        backText={config.backText}
        title={head.name}
        description={`${config.entityName} details and holdings`}
        editLink={editLink}
        editText={`Edit ${config.entityName}`}
      />

      {head.parent && (
        <Link
          href={head.parent.link}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <span aria-hidden>↑</span>
          <span>
            Part of <span className="font-medium">{head.parent.name}</span>
          </span>
        </Link>
      )}

      {head.lock_date && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 flex items-center gap-2.5">
          <span aria-hidden>🔒</span>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Reconciled &amp; locked through <span className="font-semibold">{head.lock_date}</span> — entries on or before this day can&apos;t be
            changed.{' '}
            <Link
              href={editLink}
              className="font-medium underline underline-offset-2 decoration-amber-500/60 dark:decoration-amber-400/60 hover:text-amber-900 dark:hover:text-amber-50 hover:decoration-amber-700 dark:hover:decoration-amber-200 transition-colors"
            >
              Adjust on the edit page
            </Link>
            .
          </p>
        </div>
      )}

      {head.upi_id && (
        <div className="bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg border border-green-200 dark:border-green-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              Send money via UPI{head.linked_user ? ` to @${head.linked_user.username}` : ''}
            </p>
            <p className="text-xs font-mono text-green-700 dark:text-green-300 break-all">{head.upi_id}</p>
            {head.total < 0 && (
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                You owe{' '}
                <span className="font-semibold">
                  <MaskedAmount value={-head.total} />
                </span>{' '}
                — pre-filled below
              </p>
            )}
          </div>
          <UpiPayButton
            upi_id={head.upi_id}
            payee_name={head.name}
            mark_paid_label="Log Transaction"
            initial_amount={head.total < 0 ? -head.total : undefined}
            initial_note={head.total < 0 ? 'reimbursement. balance settled' : undefined}
            on_mark_paid={handle_mark_paid}
          />
        </div>
      )}

      {pay_status?.kind === 'ok' && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-green-900 dark:text-green-100">
            Payment recorded.{' '}
            <a href={`/transactions/${pay_status.txn_id}`} className="font-medium underline hover:no-underline">
              View transaction
            </a>
          </p>
          <button
            type="button"
            onClick={() => set_pay_status(null)}
            className="text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 text-sm"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {pay_status?.kind === 'err' && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-900 dark:text-red-100">Couldn&apos;t record payment: {pay_status.message}</p>
          <button
            type="button"
            onClick={() => set_pay_status(null)}
            className="text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 text-sm"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <InfoCard
        title={`${config.entityName} Information`}
        fields={[
          {
            label: head.subtree_total != null ? 'Total Value (this head only)' : 'Total Value',
            value: (
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                <MaskedAmount value={head.total} />
              </p>
            ),
          },
          ...(head.subtree_total != null
            ? [
                {
                  label: 'Total Value (incl. sub-accounts)',
                  value: (
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      <MaskedAmount value={head.subtree_total} />
                    </p>
                  ),
                },
              ]
            : []),
          ...(head.xirr !== undefined && head.xirr !== null
            ? [
                {
                  label: 'XIRR',
                  value: (
                    <span
                      className={
                        head.xirr > 0
                          ? 'text-green-600 dark:text-green-400 font-semibold'
                          : head.xirr < 0
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400 font-semibold'
                      }
                    >
                      {(head.xirr * 100).toFixed(2)}%
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      {head.linked_user && <LinkedUserNotify targetUserId={head.linked_user.id} username={head.linked_user.username} owedAmount={head.total} />}

      {closingBalanceAction && <AsOfBalance headId={head.id} getClosingBalance={closingBalanceAction} />}

      {canReconcile && (
        <Card>
          <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reconcile against a statement</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {head.lock_date
                  ? `Verified through ${head.lock_date} — paste the next stretch of bank rows to match them line by line and move the lock forward.`
                  : 'Paste or upload bank rows to match them against this account line by line, add whatever is missing, and lock the verified period.'}
              </p>
            </div>
            <Link
              href={`/reconcile?account=${encodeURIComponent(head.id)}`}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium inline-flex items-center gap-2 justify-center sm:whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
              Reconcile this account
            </Link>
          </div>
        </Card>
      )}

      {head.children && head.children.length > 0 && (
        <Card>
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sub-{config.entityName.toLowerCase()}s</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {head.children.length} child {head.children.length !== 1 ? 'heads' : 'head'} — values include their own descendants
            </p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {head.children.map(child => (
              <Link
                key={child.id}
                href={child.link}
                className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group"
              >
                <span className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {child.name}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    <MaskedAmount value={child.total} />
                  </span>
                  <span className="text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">→</span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <HoldingsGrid title={config.holdingsTitle || 'Holdings (aggregated by asset)'} items={holdingsItems} linkLabel="View Asset →" />

      {}
      <Card>
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transaction Line Items</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {head.line_items.length} item
            {head.line_items.length !== 1 ? 's' : ''}
          </p>
        </div>

        {head.line_items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
            {head.line_items.slice(0, visibleLineItems).map(li => (
              <LineItemRow
                key={li.id}
                assetName={li.asset_name}
                assetLink={li.asset_id ? `/assets/${li.asset_id}` : undefined}
                quantity={li.quantity}
                bookValue={li.txn_value}
                transactionId={li.transaction_id}
                transactionDate={li.transaction_date}
                transactionDescription={li.transaction_description}
                lineItemDescription={li.line_item_description}
                assetType={li.asset_type}
                remainingQuantity={li.remaining_quantity}
              />
            ))}
            {head.line_items.length > visibleLineItems && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleLineItems(v => v + LINE_ITEMS_PAGE)}
                  className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  Show {Math.min(LINE_ITEMS_PAGE, head.line_items.length - visibleLineItems)} more ({head.line_items.length - visibleLineItems}{' '}
                  remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {head.value_timeseries && head.value_timeseries.length > 0 && <ValueChart points={head.value_timeseries} title="Value over time" />}
    </div>
  )
}
