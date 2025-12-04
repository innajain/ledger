// components/ViewPageComponents.tsx
import { asset_type } from '@/generated/prisma/enums';
import Link from 'next/link';
import { currency_fmt } from '../_utils/currency formatter';

// View Page Header
interface ViewPageHeaderProps {
  backLink: string;
  backText: string;
  title: string;
  description: string;
  editLink: string;
  editText: string;
}

export function ViewPageHeader({ backLink, backText, title, description, editLink, editText }: ViewPageHeaderProps) {
  return (
    <div>
      <Link href={backLink} className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors font-medium mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {backText}
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
          <p className="text-slate-600 mt-1">{description}</p>
        </div>
        <Link
          href={editLink}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium inline-flex items-center gap-2"
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
      </div>
    </div>
  );
}

// Info Card
interface InfoField {
  label: string;
  value: string | React.ReactNode;
}

interface InfoCardProps {
  title: string;
  fields: InfoField[];
}

export function InfoCard({ title, fields }: InfoCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {fields.map((field, idx) => (
          <div key={idx}>
            <p className="text-sm text-slate-500 mb-1">{field.label}</p>
            {typeof field.value === 'string' ? <p className="text-slate-900 font-medium">{field.value}</p> : field.value}
          </div>
        ))}
      </div>
    </div>
  );
}

// Holdings Card Header
interface HoldingsHeaderProps {
  title?: string;
  count: number;
}

export function HoldingsHeader({ title = 'Holdings', count }: HoldingsHeaderProps) {
  return (
    <div className="p-6 border-b border-slate-200">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500 mt-1">
        {count} line item{count !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

// Empty State
interface EmptyStateProps {
  message?: string;
  subMessage?: string;
}

export function EmptyState({
  message = 'No holdings yet',
  subMessage = 'Line items will appear here once transactions are recorded',
}: EmptyStateProps) {
  return (
    <div className="p-8 text-center">
      <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
      <p className="text-slate-600 font-medium">{message}</p>
      <p className="text-sm text-slate-500 mt-1">{subMessage}</p>
    </div>
  );
}

// Line Item Row
interface LineItemRowProps {
  assetName: string;
  assetLink?: string;
  quantity?: number;
  bookValue?: number | null;
  currentValue: number;
  transactionId: string;
  transactionDate: string;
  transactionDescription?: string | null;
  lineItemDescription?: string | null;
  assetType: asset_type;
}

export function LineItemRow({
  assetName,
  assetLink,
  quantity,
  bookValue,
  currentValue,
  transactionId,
  transactionDate,
  transactionDescription,
  lineItemDescription,
  assetType,
}: LineItemRowProps) {
  return (
    <div className="p-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {assetLink ? (
            <Link href={assetLink} className="text-slate-900 font-semibold hover:text-blue-600 transition-colors">
              {assetName}
            </Link>
          ) : (
            <span className="text-slate-900 font-semibold">{assetName}</span>
          )}

          {/* Line Item Description */}
          {lineItemDescription && <p className="text-sm text-slate-600 mt-1">{lineItemDescription}</p>}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {assetType === asset_type.rupees ? (
              <div className="text-slate-600">
                <span className="font-medium text-slate-900">{currency_fmt.format(currentValue)}</span>
              </div>
            ) : (
              <>
                <div className="text-slate-600">
                  <span className="text-slate-500">Quantity:</span> <span className="font-medium text-slate-900">{quantity} units</span>
                </div>
                <div className="text-slate-600">
                  <span className="text-slate-500">Book:</span>{' '}
                  <span className="font-medium text-slate-900">
                    {bookValue === null || bookValue === undefined ? '—' : currency_fmt.format(bookValue)}
                  </span>
                </div>
                <div className="text-slate-600">
                  <span className="text-slate-500">Current:</span>{' '}
                  <span className="font-medium text-slate-900">{currency_fmt.format(currentValue)}</span>
                </div>
              </>
            )}
          </div>

          {/* Transaction Info */}
          <div className="mt-2 space-y-1">
            <Link
              href={`/transactions/${transactionId}`}
              className="text-xs text-slate-500 hover:text-blue-600 transition-colors inline-flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              {new Date(transactionDate).toLocaleString()}
            </Link>
            {transactionDescription && <p className="text-xs text-slate-500 italic">Transaction: {transactionDescription}</p>}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-lg font-semibold text-slate-900">{currency_fmt.format(currentValue)}</div>
          <Link href={`/transactions/${transactionId}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1 inline-block">
            View Transaction →
          </Link>
        </div>
      </div>
    </div>
  );
}
