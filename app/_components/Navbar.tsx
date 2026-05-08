'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/assets', label: 'Assets' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/allocations', label: 'Allocations' },
  { href: '/income_expenses', label: 'Income / Expenses' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/settings', label: 'Settings' },
]

const navLinkClasses = (active: boolean, block = false) =>
  `${block ? 'block ' : ''}px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    active
      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
  }`

function NavLink({ href, label, active, block = false, onClick }: { href: string; label: string; active: boolean; block?: boolean; onClick?: () => void }) {
  return (
    <Link href={href} className={navLinkClasses(active, block)} onClick={onClick}>
      {label}
    </Link>
  )
}

export default function Navbar({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const pathname = usePathname()

  const toggleMenu = () => setIsMenuOpen(o => !o)
  const closeMenu = () => setIsMenuOpen(false)

  const isActive = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path))

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 shadow-sm transition-all backdrop-blur-sm">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <Link
            href="/"
            className="flex items-center space-x-2 text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300 transition-all shrink-0 group"
            onClick={closeMenu}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform">
              <Image src="/favicon.ico" alt="Ledger" width={24} height={24} />
            </div>
            <span className="font-semibold text-lg">Ledger</span>
          </Link>

          {/* Desktop Navigation Links */}
          {isLoggedIn && (
            <ul className="hidden lg:flex gap-2 list-none p-0 m-0 ml-auto">
              {NAV_ITEMS.map(item => (
                <li key={item.href}>
                  <NavLink href={item.href} label={item.label} active={isActive(item.href)} />
                </li>
              ))}
            </ul>
          )}

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 shrink-0">
            {isLoggedIn && (
              <button
                className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all hover:scale-110"
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

        {/* Mobile Navigation Menu */}
        {isLoggedIn && isMenuOpen && (
          <div className="lg:hidden pb-4 animate-slide-in-up">
            <ul className="flex flex-col gap-1 list-none p-0 m-0">
              {NAV_ITEMS.map(item => (
                <li key={item.href}>
                  <NavLink href={item.href} label={item.label} active={isActive(item.href)} block onClick={closeMenu} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </header>
  )
}
