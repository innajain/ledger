const baseClasses = 'w-8 h-8 text-slate-400'
const baseProps = { fill: 'none' as const, stroke: 'currentColor' as const, viewBox: '0 0 24 24', 'aria-hidden': true }
const pathProps = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 }

export const AccountEmptyIcon = () => (
  <svg className={baseClasses} {...baseProps}>
    <path {...pathProps} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
)

export const IncomeExpenseEmptyIcon = AccountEmptyIcon

export const TransactionEmptyIcon = () => (
  <svg className={baseClasses} {...baseProps}>
    <path {...pathProps} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

export const AllocationEmptyIcon = () => (
  <svg className={baseClasses} {...baseProps}>
    <path {...pathProps} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
    <path {...pathProps} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
  </svg>
)

export const AssetEmptyIcon = () => (
  <svg className={baseClasses} {...baseProps}>
    <path
      {...pathProps}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
)

export const GroupEmptyIcon = () => (
  <svg className={baseClasses} {...baseProps}>
    <path
      {...pathProps}
      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
    />
  </svg>
)
