'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ViewPageHeader, InfoCard, EmptyState, LineItemRow } from '@/app/_components/ViewPageComponents'
import { HoldingsGrid, HoldingItem } from '@/app/_components/HoldingsGrid'
import { Card } from '@/app/_components/Card'
import { asset_type } from '@/generated/prisma/enums'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import { ValueChart, type ValuePoint } from '@/app/_components/ValueChart'
import { UpiPayButton } from '@/app/_components/UpiPayButton'
import { LinkedUserNotify } from '@/app/_components/LinkedUserNotify'
import { AsOfBalance } from '@/app/_components/AsOfBalance'
import { LockIcon, CloseIcon } from '@/app/_components/icons'
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
  // Cost recorded on the transactions, unmarked to market. Equal to `total` for a head
  // that only ever held rupees, which is why the card hides it in that case.
  book_total?: number | null
  // Cost basis of what the head still holds (FIFO open lots + rupees at face value) —
  // the head-level twin of the asset page's "Current investment". Null on a head with no
  // priced assets, where it would only restate the balance.
  invested_total?: number | null

  subtree_total?: number | null
  subtree_book?: number | null

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
  // This head's future line items, in effective-datetime order — one row per line item,
  // not per transaction (a transaction with two lines here, e.g. rent + brokerage, shows
  // as two rows, each linking to the same transaction). `due` marks a line dated on or
  // before the end of today IST — the whole day, so it can be due and still forward-looking
  // (later today), which is why it is separate from `sufficient` being null: that means the
  // line is already overdue (dated before now) and excluded from the walk. `balance_after`
  // is the resulting balance for that line's asset once it (and every one before it) lands
  // — null for an overdue line item, which never updates it.
  future_transactions?: {
    id: string
    transaction_id: string
    datetime: string | Date
    description: string | null
    amount: number
    due: boolean
    sufficient: boolean | null
    balance_after: { asset_name: string; balance: number } | null
  }[]
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
}

const LINE_ITEMS_PAGE = 100

// Book and current value coincide for a head that only ever held rupees, so printing both
// would just be the same number twice. Compared at paise — the resolution the amounts are
// displayed at — so a sub-paise pricing artefact doesn't sprout a redundant line.
function book_differs(book: number | null | undefined, current: number): book is number {
  return book !== null && book !== undefined && Math.round(book * 100) !== Math.round(current * 100)
}

function Amount({ value }: { value: number }) {
  return (
    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
      <MaskedAmount value={value} />
    </p>
  )
}

export function HeadDetailPage({ head, config, closingBalanceAction }: HeadDetailPageProps) {
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
        editLink={editLink}
        editText={`Edit ${config.entityName.toLowerCase()}`}
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
          <LockIcon className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Reconciled &amp; locked through <span className="font-semibold">{head.lock_date}</span>
            {' — '}entries on or before this day can&apos;t be changed.{' '}
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
        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
            mark_paid_label="Log transaction"
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
            className="p-1 -m-1 text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 text-sm"
            aria-label="Dismiss"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {pay_status?.kind === 'err' && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-900 dark:text-red-100">Couldn&apos;t record payment: {pay_status.message}</p>
          <button
            type="button"
            onClick={() => set_pay_status(null)}
            className="p-1 -m-1 text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 text-sm"
            aria-label="Dismiss"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <InfoCard
        title={`${config.entityName} details`}
        fields={[
          {
            label: head.subtree_total != null ? 'Total value (this one only)' : 'Total value',
            value: <Amount value={head.total} />,
          },
          // Same pair the asset page carries, in the same order: cost of what's still
          // held, then everything posted. Both only once the head holds a priced asset —
          // on a rupees-only one they'd just restate the balance twice.
          ...(head.invested_total != null
            ? [
                { label: 'Current investment', value: <Amount value={head.invested_total} /> },
                ...(head.book_total != null ? [{ label: 'Total book value', value: <Amount value={head.book_total} /> }] : []),
              ]
            : book_differs(head.book_total, head.total)
              ? [{ label: 'Total book value', value: <Amount value={head.book_total} /> }]
              : []),
          ...(head.subtree_total != null
            ? [
                { label: 'Total value (with sub-accounts)', value: <Amount value={head.subtree_total} /> },
                // No invested twin for the subtree: it rolls up from cached per-head
                // balances, which carry no lot history to run FIFO over.
                ...(book_differs(head.subtree_book, head.subtree_total)
                  ? [{ label: 'Total book value (with sub-accounts)', value: <Amount value={head.subtree_book} /> }]
                  : []),
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

      {head.children && head.children.length > 0 && (
        <Card>
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sub-{config.entityName.toLowerCase()}s</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {head.children.length} sub-{head.children.length !== 1 ? 'entries' : 'entry'} — totals include everything under them
            </p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {head.children.map(child => (
              // Stretched-link treatment (see the home cards): the amount needs its own
              // click-to-reveal, so it can't nest inside the row's <Link>.
              <div key={child.id} className="relative hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                <Link href={child.link} aria-label={child.name} className="absolute inset-0 z-0" />
                <div className="relative z-10 pointer-events-none flex items-center justify-between gap-4 p-4">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{child.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 pointer-events-auto">
                      <MaskedAmount value={child.total} />
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      →
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <HoldingsGrid title={config.holdingsTitle || 'Held in assets'} items={holdingsItems} linkLabel="View asset →" />

      {}
      <Card>
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Line items</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {head.line_items.length} item
            {head.line_items.length !== 1 ? 's' : ''}
          </p>
        </div>

        {head.line_items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-96 overflow-y-auto">
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

      {head.future_transactions && head.future_transactions.length > 0 && (
        <Card>
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Future transactions</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Scheduled entries — they don&apos;t affect balances until converted to real transactions.
            </p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-96 overflow-y-auto">
            {head.future_transactions.map(ft => (
              <div key={ft.id} className="relative hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                <Link
                  href={`/transactions/${ft.transaction_id}`}
                  aria-label={ft.description || 'View future transaction'}
                  className="absolute inset-0 z-0"
                />
                <div className="relative z-10 pointer-events-none flex items-center justify-between gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{ft.description || 'No description'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                      <LocalDateTime value={ft.datetime} />
                      {ft.due && (
                        <span className="shrink-0 font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Due
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="ml-4 shrink-0 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      {ft.sufficient !== null &&
                        ft.amount < 0 &&
                        (ft.sufficient ? (
                          <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                            Enough balance
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Could fall short
                          </span>
                        ))}
                      <span
                        className={`font-semibold pointer-events-auto ${
                          ft.amount > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        <MaskedAmount value={ft.amount} keep_sign />
                      </span>
                    </div>
                    {ft.balance_after && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 pointer-events-auto">
                        Balance after: <MaskedAmount value={ft.balance_after.balance} />
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
