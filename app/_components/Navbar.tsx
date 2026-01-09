'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';

export default function Navbar({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 shadow-sm transition-colors">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center space-x-2 text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex-shrink-0" onClick={closeMenu}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
              <img src="/favicon.ico" alt="Ledger" className="w-6 h-6" />
            </div>
            <span className="font-semibold text-lg">Ledger</span>
          </Link>

          {/* Desktop Navigation Links */}
          {isLoggedIn && (
            <ul className="hidden lg:flex gap-2 list-none p-0 m-0 flex-1 justify-center">
              <li>
                <Link
                  href="/"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/assets"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/assets') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Assets
                </Link>
              </li>
              <li>
                <Link
                  href="/accounts"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/accounts') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Accounts
                </Link>
              </li>
              <li>
                <Link
                  href="/allocations"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/allocations') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Allocations
                </Link>
              </li>
              <li>
                <Link
                  href="/income_expenses"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/income_expenses') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Income / Expenses
                </Link>
              </li>
              <li>
                <Link
                  href="/ai-transaction"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/ai-transaction') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  AI Transaction
                </Link>
              </li>
              <li>
                <Link
                  href="/transactions"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/transactions') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Transactions
                </Link>
              </li>
            </ul>
          )}

          {/* Dark Mode Toggle & Mobile Menu Button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="Toggle dark mode"
            >
              {!mounted ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Mobile Menu Button */}
            {isLoggedIn && (
              <button
                className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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
          <div className="lg:hidden pb-4">
            <ul className="flex flex-col gap-1 list-none p-0 m-0">
              <li>
                <Link
                  href="/"
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  onClick={closeMenu}
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/assets"
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/assets') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  onClick={closeMenu}
                >
                  Assets
                </Link>
              </li>
              <li>
                <Link
                  href="/accounts"
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/accounts') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  onClick={closeMenu}
                >
                  Accounts
                </Link>
              </li>
              <li>
                <Link
                  href="/allocations"
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/allocations') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  onClick={closeMenu}
                >
                  Allocations
                </Link>
              </li>
              <li>
                <Link
                  href="/income_expenses"
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/income_expenses') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  onClick={closeMenu}
                >
                  Income / Expenses
                </Link>
              </li>
              <li>
                <Link
                  href="/ai-transaction"
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/ai-transaction') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  onClick={closeMenu}
                >
                  AI Transaction
                </Link>
              </li>
              <li>
                <Link
                  href="/transactions"
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/transactions') ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  onClick={closeMenu}
                >
                  Transactions
                </Link>
              </li>
            </ul>
          </div>
        )}
      </nav>
    </header>
  );
}
