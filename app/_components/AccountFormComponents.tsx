// components/AccountFormComponents.tsx
import Link from 'next/link';
import type { account_type, Prisma } from '@/generated/prisma/client';

// Page Header with Back Navigation
interface PageHeaderProps {
  backLink: string;
  backText: string;
  title: string;
  description: string;
}

export function PageHeader({ backLink, backText, title, description }: PageHeaderProps) {
  return (
    <div>
      <Link href={backLink} className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {backText}
      </Link>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="text-slate-600 dark:text-slate-400 mt-1">{description}</p>
    </div>
  );
}

// Form Card Wrapper
interface FormCardProps {
  title: string;
  children: React.ReactNode;
}

export function FormCard({ title, children }: FormCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// Text Input Field
interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

export function TextInput({ label, value, onChange, placeholder, required }: TextInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
      />
    </div>
  );
}

// Account Type Select
interface AccountTypeSelectProps {
  label: string;
  value: account_type;
  onChange: (value: account_type) => void;
  disabled?: boolean;
  restrictedTo?: account_type[];
}

export function AccountTypeSelect({ label, value, onChange, disabled, restrictedTo }: AccountTypeSelectProps) {
  const allowedTypes = restrictedTo || ['real', 'allocation', 'nominal'];
  
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as account_type)}
        disabled={disabled}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {allowedTypes.includes('real') && <option value="real">Real</option>}
        {allowedTypes.includes('allocation') && <option value="allocation">Allocation</option>}
        {allowedTypes.includes('nominal') && <option value="nominal">Nominal</option>}
      </select>
    </div>
  );
}

// Parent Account Select
interface ParentSelectProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  parents: Prisma.accountGetPayload<{}>[];
  excludeId?: string;
  helpText?: string;
}

export function ParentSelect({ label, value, onChange, parents, excludeId, helpText }: ParentSelectProps) {
  const filteredParents = excludeId ? parents.filter(p => p.id !== excludeId) : parents;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
      >
        <option value="">-- None (Top Level) --</option>
        {filteredParents.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {helpText && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{helpText}</p>}
    </div>
  );
}

// Asset Type Select
interface AssetTypeSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function AssetTypeSelect({ label, value, onChange }: AssetTypeSelectProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
      >
        <option value="rupees">Rupees</option>
        <option value="mf">Mutual Fund</option>
        <option value="etf">ETF</option>
        <option value="shares">Shares</option>
        <option value="other">Other</option>
      </select>
    </div>
  );
}

// Parent Asset Select
interface ParentAssetSelectProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  parents: Array<{ id: string; name: string }>;
  excludeId?: string;
  helpText?: string;
}

export function ParentAssetSelect({ label, value, onChange, parents, excludeId, helpText }: ParentAssetSelectProps) {
  const filteredParents = excludeId ? parents.filter(p => p.id !== excludeId) : parents;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
      >
        <option value="">-- None (Top Level) --</option>
        {filteredParents.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {helpText && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{helpText}</p>}
    </div>
  );
}

// Form Action Buttons
interface FormActionsProps {
  cancelLink: string;
  submitText: string;
  busy: boolean;
  onDelete?: () => void;
  deleteText?: string;
}

export function FormActions({ cancelLink, submitText, busy, onDelete, deleteText }: FormActionsProps) {
  return (
    <div className="flex justify-between items-center pt-6 border-t border-slate-200 dark:border-slate-700">
      {/* Delete Button - Left Side */}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="px-6 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium border border-red-200 dark:border-red-800"
        >
          {deleteText || 'Delete'}
        </button>
      )}

      {/* Submit/Cancel Buttons - Right Side */}
      <div className={`flex gap-3 ${onDelete ? 'ml-auto' : 'ml-0 w-full justify-end'}`}>
        <Link href={cancelLink} className="px-6 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {submitText}
        </button>
      </div>
    </div>
  );
}
