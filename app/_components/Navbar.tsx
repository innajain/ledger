'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RevealToggle } from './RevealToggle'

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/assets', label: 'Assets' },
  { href: '/heads/account', label: 'Accounts' },
  { href: '/heads/allocation', label: 'Allocations' },
  { href: '/heads/income_expense', label: 'Income & Expenses' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/requests', label: 'Requests' },
  { href: '/settings', label: 'Settings' },
]

// Desktop links sit at the tighter px-3 until 2xl so all eight fit on one row at the xl breakpoint;
// whitespace-nowrap guarantees a label can never wrap and grow the h-16 header.
const navLinkClasses = (active: boolean, block = false) =>
  `${block ? 'block px-4 ' : 'px-3 2xl:px-4 '}py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
    active
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
  }`

function NavLink({
  href,
  label,
  active,
  block = false,
  onClick,
  badge = 0,
}: {
  href: string
  label: string
  active: boolean
  block?: boolean
  onClick?: () => void
  badge?: number
}) {
  return (
    <Link href={href} className={`${navLinkClasses(active, block)} inline-flex items-center gap-2`} onClick={onClick}>
      {label}
      {badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold rounded-full bg-red-600 text-white">
          {badge}
        </span>
      )}
    </Link>
  )
}

export default function Navbar({ isLoggedIn, requestCount = 0 }: { isLoggedIn: boolean; requestCount?: number }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const pathname = usePathname()

  const toggleMenu = () => setIsMenuOpen(o => !o)
  const closeMenu = () => setIsMenuOpen(false)

  useEffect(() => {
    if (!isMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isMenuOpen])

  const isActive = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path))

  return (
    <header
      className={`sticky top-0 z-50 shadow-sm transition-all backdrop-blur-sm border-b ${process.env.NODE_ENV === 'development' ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between h-16">
          {}
          <Link
            href="/"
            className="flex items-center space-x-2 text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300 transition-all shrink-0 group"
            onClick={closeMenu}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
              <Image src="/favicon.ico" alt="Ledger" width={24} height={24} />
            </div>
            <span className="font-semibold text-lg">Ledger</span>
            {process.env.NODE_ENV === 'development' && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
                dev
              </span>
            )}
          </Link>

          {}
          {isLoggedIn && (
            <ul className="hidden xl:flex flex-nowrap gap-1 2xl:gap-2 list-none p-0 m-0 ml-auto">
              {NAV_ITEMS.map(item => (
                <li key={item.href}>
                  <NavLink href={item.href} label={item.label} active={isActive(item.href)} badge={item.href === '/requests' ? requestCount : 0} />
                </li>
              ))}
            </ul>
          )}

          {}
          <div className="flex items-center gap-2 shrink-0">
            {/* Session-only "show every masked amount" switch. Sits left of the hamburger on
                small screens and is the lone right-hand control once the desktop list appears. */}
            {isLoggedIn && <RevealToggle />}
            {isLoggedIn && (
              <button
                className="xl:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                onClick={toggleMenu}
                aria-label="Toggle menu"
                aria-expanded={isMenuOpen}
              >
                {isMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {}
        {isLoggedIn && isMenuOpen && (
          <div className="xl:hidden pb-4 animate-slide-in-up">
            <ul className="flex flex-col gap-1 list-none p-0 m-0">
              {NAV_ITEMS.map(item => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    label={item.label}
                    active={isActive(item.href)}
                    block
                    onClick={closeMenu}
                    badge={item.href === '/requests' ? requestCount : 0}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </header>
  )
}
