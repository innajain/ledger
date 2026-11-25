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
      <Link href={backLink} className="inline-flex items-center gap-2 text-ink-2 hover:text-ink transition-colors font-medium mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {backText}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">{title}</h1>
          {description && <p className="text-ink-2 mt-1">{description}</p>}
        </div>
        {editLink && (
          <Link
            href={editLink}
            className="px-4 py-2 bg-accent text-on-accent rounded-lg hover:bg-accent-hover transition-colors font-medium inline-flex items-center gap-2 justify-center sm:justify-start sm:whitespace-nowrap"
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
    <div className="bg-paper rounded-lg shadow-sm border border-rule p-4 sm:p-6 transition-colors">
      <h2 className="text-lg font-semibold text-ink mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {fields.map((field, idx) => (
          <div key={idx}>
            <p className="text-sm text-ink-3 mb-1">{field.label}</p>
            {typeof field.value === 'string' ? <p className="text-ink font-medium">{field.value}</p> : field.value}
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
    <div className="p-4 sm:p-6 border-b border-rule">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink-3 mt-1">
        {count} line item{count !== 1 ? 's' : ''}
      </p>
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
  /**
   * The accounting head this line sits on. Only passed where the surrounding page does
   * not already imply it — a head page scoped to a whole subtree, where a row could have
   * come from any sub-head.
   */
  headName?: string | null
  headLink?: string | null
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
  headName,
  headLink,
}: LineItemRowProps) {
  const is_depleted = remainingQuantity !== undefined && remainingQuantity !== null && remainingQuantity === 0
  const displayed_amount = bookValue !== null && bookValue !== undefined ? bookValue : quantity
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
    <div className={`p-4 hover:bg-sunken transition-colors ${is_depleted ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Link href={`/transactions/${transactionId}`} className="font-semibold text-ink hover:text-accent transition-colors truncate">
              {title}
            </Link>
            {headName &&
              (headLink ? (
                <Link
                  href={headLink}
                  className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-accent-soft text-accent hover:bg-accent-soft transition-colors"
                >
                  {headName}
                </Link>
              ) : (
                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-accent-soft text-accent">{headName}</span>
              ))}
            {showAssetTag &&
              (assetLink ? (
                <Link
                  href={assetLink}
                  className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-sunken text-ink-2 hover:text-accent transition-colors"
                >
                  {assetName}
                </Link>
              ) : (
                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-sunken text-ink-2">{assetName}</span>
              ))}
          </div>

          {showLineNote && <p className="text-sm text-ink-2 mt-1">{lineItemDescription}</p>}

          <p className="text-xs text-ink-3 mt-1">
            <LocalDateTime value={transactionDate} />
          </p>

          {assetType !== asset_type.rupees && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <div className="text-ink-2">
                <span className="text-ink-3">Quantity:</span> <span className="font-medium text-ink">{quantity} units</span>
              </div>
              {remainingQuantity !== undefined && remainingQuantity !== null && (
                <div className="text-ink-2">
                  <span className="text-ink-3">Remaining:</span> <span className="font-medium text-ink">{remainingQuantity} units</span>
                  {remaining_txn_value !== null && (
                    <>
                      {' '}
                      <span className="text-ink-3">
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
          <div className={`text-lg font-semibold ${displayed_amount > 0 ? 'text-pos' : 'text-ink'}`}>
            <MaskedAmount value={displayed_amount} />
          </div>
        </div>
      </div>
    </div>
  )
}
