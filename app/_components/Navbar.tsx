'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Suspense, use, useEffect, useRef, useState } from 'react'

type NavLeaf = { href: string; label: string }
type NavGroup = { label: string; children: NavLeaf[] }
type NavEntry = NavLeaf | NavGroup

const is_group = (e: NavEntry): e is NavGroup => 'children' in e

// The three head lists collapse into one dropdown — they are the same page with
// a different type, and inlining all three was what pushed the row past the
// breakpoint. Seven top-level entries fit at xl.
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
  { href: '/requests', label: 'Requests' },
  { href: '/tax', label: 'Tax' },
  { href: '/settings', label: 'Settings' },
]

// Seven top-level links: the desktop row fits at the xl breakpoint (tighter px-3
// until 2xl); whitespace-nowrap guarantees a label can never wrap and grow the
// h-16 header. Below xl the overflow menu (hamburger) takes over.
const navLinkClasses = (active: boolean, block = false) =>
  `${block ? 'block px-4 ' : 'px-3 2xl:px-4 '}py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
    active
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
  }`

// The count may arrive as a promise so the layout can stream the shell without
// waiting on the inbox query — the badge fills in when the count resolves.
function Badge({ value }: { value: number | Promise<number> }) {
  const n = typeof value === 'number' ? value : use(value)
  if (n <= 0) return null
  return (
    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold rounded-full bg-red-600 text-white">{n}</span>
  )
}

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
  badge?: number | Promise<number>
}) {
  return (
    <Link href={href} className={`${navLinkClasses(active, block)} inline-flex items-center gap-2`} onClick={onClick}>
      {label}
      <Suspense fallback={null}>
        <Badge value={badge} />
      </Suspense>
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

export default function Navbar({ isLoggedIn, requestCount = 0 }: { isLoggedIn: boolean; requestCount?: number | Promise<number> }) {
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
            <ul className="hidden xl:flex flex-nowrap gap-1 2xl:gap-2 list-none p-0 m-0 ml-auto">
              {NAV_ITEMS.map(item =>
                is_group(item) ? (
                  <NavDropdown key={item.label} group={item} isActive={isActive} />
                ) : (
                  <li key={item.href}>
                    <NavLink href={item.href} label={item.label} active={isActive(item.href)} badge={item.href === '/requests' ? requestCount : 0} />
                  </li>
                ),
              )}
            </ul>
          )}

          {}
          <div className="flex items-center gap-2 shrink-0">
            {isLoggedIn && (
              <button
                className="xl:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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
          <div className="xl:hidden pb-4 animate-slide-in-up">
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
                    <NavLink
                      href={item.href}
                      label={item.label}
                      active={isActive(item.href)}
                      block
                      onClick={closeMenu}
                      badge={item.href === '/requests' ? requestCount : 0}
                    />
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
