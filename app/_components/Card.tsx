import { ReactNode } from 'react'

const baseClasses = 'bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-colors'

/**
 * Standard card wrapper. Pass `className` to add padding (e.g. `p-6`),
 * `overflow-hidden`, or other variant classes.
 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${baseClasses}${className ? ' ' + className : ''}`}>{children}</div>
}
