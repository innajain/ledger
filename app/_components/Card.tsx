import { ReactNode } from 'react'

// A page section: a rule above, no box (see `sheet` in globals.css).
const baseClasses = 'sheet'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${baseClasses}${className ? ' ' + className : ''}`}>{children}</div>
}
