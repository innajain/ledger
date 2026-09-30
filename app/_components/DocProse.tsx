import type { ReactNode } from 'react'
import Link from 'next/link'

// Long-form text for the public /privacy and /docs pages. Server-only markup with no
// state, so these pages skip the ClientPage split: there is nothing to hydrate.

export function DocShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <article className="max-w-3xl mx-auto text-slate-700 dark:text-slate-300 leading-relaxed">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="mt-2 text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </header>
      <div className="space-y-8">{children}</div>
    </article>
  )
}

export function DocSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {children}
    </section>
  )
}

export function DocList({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2 marker:text-slate-400">{children}</ul>
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[0.9em] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 break-all">
      {children}
    </code>
  )
}

const link_class = 'text-blue-600 dark:text-blue-400 hover:underline'

export function DocLink({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith('/') || href.startsWith('#')) {
    return (
      <Link href={href} className={link_class}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} className={link_class} {...(href.startsWith('mailto:') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>
      {children}
    </a>
  )
}

export function SupportContact({ email }: { email: string | undefined }) {
  if (!email) return <>the operator of this Ledger instance</>
  return <DocLink href={`mailto:${email}`}>{email}</DocLink>
}
