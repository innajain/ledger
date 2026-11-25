import type { ReactNode } from 'react'
import Link from 'next/link'

// Long-form text for the public /privacy and /docs pages. Server-only markup with no
// state, so these pages skip the ClientPage split: there is nothing to hydrate.

export function DocShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <article className="max-w-3xl mx-auto text-ink-2 leading-relaxed">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-medium text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-ink-3">{subtitle}</p>}
      </header>
      <div className="space-y-8">{children}</div>
    </article>
  )
}

export function DocSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="text-xl sm:text-2xl font-medium text-ink">{title}</h2>
      {children}
    </section>
  )
}

export function DocList({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2 marker:text-slate-400">{children}</ul>
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.9em] px-1.5 py-0.5 rounded bg-sunken text-ink break-all">{children}</code>
}

const link_class = 'text-accent hover:underline'

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
