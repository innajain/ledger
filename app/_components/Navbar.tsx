'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type NavLeaf = { href: string; label: string }
type NavGroup = { label: string; children: NavLeaf[] }
type NavEntry = NavLeaf | NavGroup

const is_group = (e: NavEntry): e is NavGroup => 'children' in e

// The three head lists collapse into one dropdown — they are the same page with
// a different type, and inlining all three was what pushed the row past the
// breakpoint. Requests is reached from the home page card; Tax from the
// Income & Expenses list, which is the only place its numbers come from.
const NAV_ITEMS: NavEntry[] = [
  { href: '/', label: 'Home' },
  { href: '/assets', label: 'Assets' },
  {
    label: 'Heads',
    children: [
      { href: '/heads/account', label: 'Accounts' },
      { href: '/heads/allocation', label: 'Allocations' },
      { href: '/heads/income_expense', label: 'Income & Expenses' },
    ],
  },
  { href: '/transactions', label: 'Transactions' },
  { href: '/tags', label: 'Tags' },
]

// Settings lives outside NAV_ITEMS: it renders as a gear beside the hamburger, so
// it is reachable at every width without costing a slot in the row.
const SETTINGS_HREF = '/settings'

// Five top-level links: the desktop row fits from the lg breakpoint (tighter px-3
// until 2xl); whitespace-nowrap guarantees a label can never wrap and grow the
// h-16 header. Below lg the overflow menu (hamburger) takes over.
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
}: {
  href: string
  label: string
  active: boolean
  block?: boolean
  onClick?: () => void
}) {
  return (
    <Link href={href} className={`${navLinkClasses(active, block)} inline-flex items-center gap-2`} onClick={onClick}>
      {label}
    </Link>
  )
}

// Desktop-only disclosure for a NavGroup. Closes on outside click and Escape so
// it never strands itself open behind a navigation.
function NavDropdown({ group, isActive }: { group: NavGroup; isActive: (path: string) => boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLLIElement>(null)
  const active = group.children.some(c => isActive(c.href))

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <li ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`${navLinkClasses(active)} inline-flex items-center gap-1`}
      >
        {group.label}
        <svg
          aria-hidden="true"
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="absolute right-0 mt-1 min-w-52 p-1 rounded-lg list-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg">
          {group.children.map(c => (
            <li key={c.href}>
              <NavLink href={c.href} label={c.label} active={isActive(c.href)} block onClick={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Navbar({ isLoggedIn }: { isLoggedIn: boolean }) {
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
              <Image src="/logo-256.png" alt="Ledger" width={24} height={24} />
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
            <ul className="hidden lg:flex flex-nowrap gap-1 2xl:gap-2 list-none p-0 m-0 ml-auto">
              {NAV_ITEMS.map(item =>
                is_group(item) ? (
                  <NavDropdown key={item.label} group={item} isActive={isActive} />
                ) : (
                  <li key={item.href}>
                    <NavLink href={item.href} label={item.label} active={isActive(item.href)} />
                  </li>
                ),
              )}
            </ul>
          )}

          {}
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {isLoggedIn && (
              <Link
                href={SETTINGS_HREF}
                onClick={closeMenu}
                aria-label="Settings"
                aria-current={isActive(SETTINGS_HREF) ? 'page' : undefined}
                className={`p-2 rounded-lg transition-colors ${
                  isActive(SETTINGS_HREF)
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
            )}
            {isLoggedIn && (
              <button
                className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                onClick={toggleMenu}
                aria-label="Toggle menu"
                aria-expanded={isMenuOpen}
              >
                {isMenuOpen ? (
                  <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {}
        {isLoggedIn && isMenuOpen && (
          <div className="lg:hidden pb-4 animate-slide-in-up">
            <ul className="flex flex-col gap-1 list-none p-0 m-0">
              {NAV_ITEMS.map(item =>
                is_group(item) ? (
                  // No disclosure on mobile — the menu is already a list, so the
                  // group just becomes a labelled, indented section.
                  <li key={item.label}>
                    <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {item.label}
                    </div>
                    <ul className="flex flex-col gap-1 list-none p-0 m-0 pl-3">
                      {item.children.map(c => (
                        <li key={c.href}>
                          <NavLink href={c.href} label={c.label} active={isActive(c.href)} block onClick={closeMenu} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : (
                  <li key={item.href}>
                    <NavLink href={item.href} label={item.label} active={isActive(item.href)} block onClick={closeMenu} />
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
      </nav>
    </header>
  )
}
