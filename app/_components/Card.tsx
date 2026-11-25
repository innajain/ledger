import { ReactNode } from 'react'

const baseClasses = 'bg-paper rounded-lg shadow-sm border border-rule transition-colors'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${baseClasses}${className ? ' ' + className : ''}`}>{children}</div>
}
