import Link from 'next/link'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * The one button. Every clickable rectangle in the app renders through this so rank is
 * carried by variant, not by a per-page colour choice:
 *
 * - `primary`   — the single most important action on a view (blue, filled)
 * - `secondary` — everything else of button rank (quiet slate fill)
 * - `danger`    — destructive and filled (delete confirmations)
 * - `dangerOutline` — destructive but not the point of the page (delete next to edit)
 * - `ghost`     — text-level actions (clear, dismiss)
 *
 * Defaults to `type="button"` — a submit must say so, which kills the accidental-submit
 * class of bug (see the ErrorAlert dismiss regression).
 */
type Variant = 'primary' | 'secondary' | 'danger' | 'dangerOutline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const VARIANT_CLS: Record<Variant, string> = {
  primary: 'bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600 shadow-sm',
  secondary: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  dangerOutline:
    'bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-slate-700',
  ghost: 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700',
}

const SIZE_CLS: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5',
}

const BASE_CLS =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export function buttonClasses(variant: Variant = 'secondary', size: Size = 'md', extra = ''): string {
  return `${BASE_CLS} ${VARIANT_CLS[variant]} ${SIZE_CLS[size]}${extra ? ' ' + extra : ''}`
}

type ButtonProps = {
  variant?: Variant
  size?: Size
  children: ReactNode
  className?: string
} & Omit<ComponentPropsWithoutRef<'button'>, 'className'>

export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  )
}

type ButtonLinkProps = {
  href: string
  variant?: Variant
  size?: Size
  children: ReactNode
  className?: string
} & Omit<ComponentPropsWithoutRef<typeof Link>, 'href' | 'className'>

export function ButtonLink({ href, variant = 'secondary', size = 'md', className = '', children, ...rest }: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  )
}
