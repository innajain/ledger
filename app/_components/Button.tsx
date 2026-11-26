import Link from 'next/link'
import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ReactNode } from 'react'

/**
 * The one button. Every clickable rectangle in the app renders through this so rank is
 * carried by variant, not by a per-page colour choice:
 *
 * - `primary`   — the single most important action on a view (accent, filled)
 * - `secondary` — everything else of button rank (ruled outline)
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
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-rule-strong text-ink hover:bg-sunken',
  danger: 'bg-neg text-paper hover:opacity-90',
  dangerOutline: 'text-neg border border-neg/40 hover:bg-sunken',
  ghost: 'text-ink-2 hover:text-ink hover:bg-sunken',
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
} & Omit<ComponentPropsWithRef<'button'>, 'className'>

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
