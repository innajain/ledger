import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Navbar from './_components/Navbar';
import { get_current_user } from './_actions/auth';
import { ThemeProvider } from './_components/ThemeProvider';
import { ToastProvider } from './_components/Toast';
import { BackToTop } from './_components/BackToTop';
import './globals.css';
import Link from 'next/link';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Ledger App',
    template: '%s | Ledger App',
  },
  description: 'Professional ledger and asset management system for tracking investments, accounts, and financial transactions',
  keywords: ['ledger', 'asset management', 'portfolio', 'finance', 'investments', 'accounting'],
  authors: [{ name: 'Shreyansh Jain', url: 'https://github.com/innajain' }],
  creator: 'Shreyansh Jain',
  metadataBase: new URL('https://ledger.shreyansh.space'), // Update with your actual domain
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'Ledger App',
    description: 'Track your investments, accounts, and financial transactions',
    siteName: 'Ledger App',
  },
  robots: {
    index: false, // Set to true when ready for production
    follow: false,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await get_current_user();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 dark:bg-slate-900 transition-colors`}>
        <ThemeProvider>
          <ToastProvider>
            <div className="min-h-screen flex flex-col">
              {/* Header */}
              <Navbar isLoggedIn={!!user} />

              {/* Main Content */}
              <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">{children}</main>

              {/* Footer */}
              <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 mt-auto transition-colors">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                  <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                    Made with ♥ by
                    <Link href="https://github.com/innajain" target="_blank" rel="noopener noreferrer" className="text-slate-700 dark:text-slate-300 hover:underline mx-1">
                      Shreyansh Jain
                    </Link>
                  </p>
                </div>
              </footer>
            </div>
            <BackToTop />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
