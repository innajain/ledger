'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { name: 'Home', path: '/' },
  { name: 'Assets', path: '/assets' },
  { name: 'Accounts', path: '/accounts' },
  { name: 'Purpose Buckets', path: '/purpose_buckets' },
  { name: 'Transactions', path: '/transactions' },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(path: string) {
    if (path === '/') return pathname === '/';

    return pathname.startsWith(path);
  }

  return (
    <div className="bg-gray-800 text-white">
      <div className="container mx-auto flex items-center justify-between p-3">
        <Link href="/" className="text-lg font-semibold">
          Ledger
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex gap-6">
          {NAV_ITEMS.map(item => (
            <Link key={item.name} href={item.path} className={isActive(item.path) ? 'text-blue-400 font-semibold' : 'text-white hover:text-gray-300'}>
              {item.name}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-controls="mobile-menu"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          className="sm:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-200 hover:bg-gray-700"
        >
          <span className="sr-only">Open main menu</span>
          {open ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu - shown when open */}
      {open && (
        <div id="mobile-menu" className="sm:hidden border-t border-gray-700">
          <div className="container mx-auto px-3 py-2 flex flex-col gap-2">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.name}
                href={item.path}
                className={isActive(item.path) ? 'text-blue-400 font-semibold' : 'text-gray-200 hover:text-white'}
                onClick={() => setOpen(false)}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
