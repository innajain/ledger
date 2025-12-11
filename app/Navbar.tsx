'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export default function Navbar({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

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
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center space-x-2 text-slate-900 hover:text-slate-700 transition-colors" onClick={closeMenu}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
              <img src="/favicon.ico" alt="Ledger" className="w-6 h-6" />
            </div>
            <span className="font-semibold text-lg">Ledger</span>
          </Link>

          {/* Mobile Menu Button */}
          {isLoggedIn && (
            <button
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
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

          {/* Desktop Navigation Links */}
          {isLoggedIn && (
            <ul className="hidden lg:flex gap-2 list-none p-0 m-0">
            <li>
              <Link
                href="/"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                href="/assets"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/assets') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Assets
              </Link>
            </li>
            <li>
              <Link
                href="/accounts"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/accounts') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Accounts
              </Link>
            </li>
            <li>
              <Link
                href="/allocations"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/allocations') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Allocations
              </Link>
            </li>
            <li>
              <Link
                href="/income_expenses"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/income_expenses') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Income / Expenses
              </Link>
            </li>
            <li>
              <Link
                href="/transactions"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive('/transactions') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Transactions
              </Link>
            </li>
            </ul>
          )}
        </div>

        {/* Mobile Navigation Menu */}
        {isLoggedIn && isMenuOpen && (
          <div className="lg:hidden pb-4">
            <ul className="flex flex-col gap-1 list-none p-0 m-0">
              <li>
                <Link
                  href="/"
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
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
                    isActive('/assets') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
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
                    isActive('/accounts') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
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
                    isActive('/allocations') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
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
                    isActive('/income_expenses') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  onClick={closeMenu}
                >
                  Income / Expenses
                </Link>
              </li>
              <li>
                <Link
                  href="/transactions"
                  className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/transactions') ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
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
