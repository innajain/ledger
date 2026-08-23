import { asset_type } from '@/generated/prisma/enums'
import Link from 'next/link'
import { MaskedAmount } from './MaskedAmount'
import { LocalDateTime } from './LocalDateTime'

interface ViewPageHeaderProps {
  backLink: string
  backText: string
  title: string
  description?: string

  editLink?: string
  editText?: string
}

export function ViewPageHeader({ backLink, backText, title, description, editLink, editText }: ViewPageHeaderProps) {
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

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          {description && <p className="text-slate-600 dark:text-slate-400 mt-1">{description}</p>}
        </div>
        {editLink && (
          <Link
            href={editLink}
            className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium inline-flex items-center gap-2 justify-center sm:justify-start sm:whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            {editText}
          </Link>
        )}
      </div>
    </div>
  )
}

interface InfoField {
  label: string
  value: string | React.ReactNode
}

interface InfoCardProps {
  title: string
  fields: InfoField[]
}

export function InfoCard({ title, fields }: InfoCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {fields.map((field, idx) => (
          <div key={idx}>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{field.label}</p>
            {typeof field.value === 'string' ? <p className="text-slate-900 dark:text-slate-100 font-medium">{field.value}</p> : field.value}
          </div>
        ))}
      </div>
    </div>
  )
}

interface HoldingsHeaderProps {
  title?: string
  count: number
}

export function HoldingsHeader({ title = 'Holdings', count }: HoldingsHeaderProps) {
  return (
    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        {count} line item{count !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

interface EmptyStateProps {
  message?: string
  subMessage?: string
}

export function EmptyState({
  message = 'No holdings yet',
  subMessage = 'Line items will appear here once transactions are recorded',
}: EmptyStateProps) {
  return (
    <div className="p-8 text-center">
      <svg
        aria-hidden="true"
        className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
      <p className="text-slate-600 dark:text-slate-300 font-medium">{message}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subMessage}</p>
    </div>
  )
}

interface LineItemRowProps {
  assetName: string
  assetLink?: string
  quantity: number
  bookValue?: number | null
  transactionId: string
  transactionDate: string
  transactionDescription?: string | null
  lineItemDescription?: string | null
  assetType: asset_type
  remainingQuantity?: number | null
}

export function LineItemRow({
  assetName,
  assetLink,
  quantity,
  bookValue,
  transactionId,
  transactionDate,
  transactionDescription,
  lineItemDescription,
  assetType,
  remainingQuantity,
}: LineItemRowProps) {
  const is_depleted = remainingQuantity !== undefined && remainingQuantity !== null && remainingQuantity === 0
  const remaining_txn_value =
    remainingQuantity !== undefined && remainingQuantity !== null && bookValue !== null && bookValue !== undefined && quantity !== 0
      ? (remainingQuantity / quantity) * bookValue
      : null
  // The transaction's description is the row's identity; the asset is a detail. A row
  // titled "Money" 388 times tells the reader nothing.
  const title = transactionDescription || lineItemDescription || assetName
  const showLineNote = !!lineItemDescription && lineItemDescription !== title
  const showAssetTag = assetType !== asset_type.rupees
  return (
    <div className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${is_depleted ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Link
              href={`/transactions/${transactionId}`}
              className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
            >
              {title}
            </Link>
            {showAssetTag &&
              (assetLink ? (
                <Link
                  href={assetLink}
                  className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {assetName}
                </Link>
              ) : (
                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {assetName}
                </span>
              ))}
          </div>

          {showLineNote && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{lineItemDescription}</p>}

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            <LocalDateTime value={transactionDate} />
          </p>

          {assetType !== asset_type.rupees && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <div className="text-slate-600 dark:text-slate-400">
                <span className="text-slate-500 dark:text-slate-400">Quantity:</span>{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">{quantity} units</span>
              </div>
              {remainingQuantity !== undefined && remainingQuantity !== null && (
                <div className="text-slate-600 dark:text-slate-400">
                  <span className="text-slate-500 dark:text-slate-400">Remaining:</span>{' '}
                  <span className="font-medium text-slate-900 dark:text-slate-100">{remainingQuantity} units</span>
                  {remaining_txn_value !== null && (
                    <>
                      {' '}
                      <span className="text-slate-500 dark:text-slate-400">
                        (<MaskedAmount value={remaining_txn_value} /> book)
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-right shrink-0">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            <MaskedAmount value={bookValue !== null && bookValue !== undefined ? bookValue : quantity} />
          </div>
        </div>
      </div>
    </div>
  )
}
