import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import dynamic from 'next/dynamic'
import Navbar from './_components/Navbar'
import { get_current_user } from './_actions/auth'
import { get_user_preferences } from './_actions/preferences'
import { ThemeProvider } from './_components/ThemeProvider'
import { PrivacyProvider } from './_components/PrivacyProvider'
import { ToastProvider } from './_components/Toast'
import { WebVitalsReporter } from './_components/WebVitalsReporter'
import { ServiceWorkerRegistrar } from './_components/ServiceWorkerRegistrar'
import { DevQueryToaster } from './_components/DevQueryToaster'
import { PROFILING_ENABLED } from '@/lib/metrics/profile'
import { DEV_QUERY_TOASTS_ENABLED } from '@/lib/dev/query-bus'
import './globals.css'
import Link from 'next/link'
import { headers } from 'next/headers'

const BackToTop = dynamic(() => import('./_components/BackToTop').then(m => m.BackToTop))

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  // Only used for reference chips and a couple of textareas — never above the fold,
  // so don't compete with the render-critical font for bandwidth.
  preload: false,
})

export const metadata: Metadata = {
  title: {
    default: 'Ledger App',
    template: '%s | Ledger App',
  },
  description: 'Professional ledger and asset management system for tracking investments, accounts, and financial transactions',
  keywords: ['ledger', 'asset management', 'portfolio', 'finance', 'investments', 'accounting'],
  authors: [{ name: 'Shreyansh Jain', url: 'https://github.com/innajain' }],
  creator: 'Shreyansh Jain',
  metadataBase: new URL('https://ledger4-woad.vercel.app/'), // Update with your actual domain
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'Ledger App',
    description: 'Track your investments, accounts, and financial transactions',
    siteName: 'Ledger App',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

const THEME_INIT_SCRIPT = `(function(){try{var t=document.documentElement.getAttribute('data-theme');if(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark');}}catch(e){}})();`

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Only the user row (theme + masking prefs stamp the <html> element) blocks the first
  // flush.
  const [user, prefs, nonce] = await Promise.all([get_current_user(), get_user_preferences(), headers().then(h => h.get('x-nonce') || undefined)])
  const persist = !!user
  const htmlClassName = prefs.theme === 'dark' ? 'dark' : ''
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" data-theme={prefs.theme} className={htmlClassName}>
      <head>
        {}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 dark:bg-slate-900 transition-colors`}>
        {PROFILING_ENABLED && <WebVitalsReporter />}
        <ServiceWorkerRegistrar />
        <ThemeProvider initial={prefs.theme} persist={persist}>
          <PrivacyProvider
            initial={{
              masking_enabled: prefs.masking_enabled,
              mask_threshold: prefs.mask_threshold,
              graphs_visible: prefs.graphs_visible,
            }}
            persist={persist}
          >
            <ToastProvider>
              {DEV_QUERY_TOASTS_ENABLED && <DevQueryToaster />}
              <div className="min-h-screen flex flex-col">
                <Navbar isLoggedIn={!!user} />
                {}
                <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>

                {}
                <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 mt-auto transition-colors">
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                      <p className="text-center sm:text-left text-sm text-slate-500 dark:text-slate-400">
                        Made with <span className="text-red-500">♥</span> by
                        <Link
                          href="https://github.com/innajain"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-700 dark:text-slate-300 hover:underline mx-1"
                        >
                          Shreyansh Jain
                        </Link>
                      </p>
                    </div>
                  </div>
                </footer>
              </div>
              <BackToTop />
            </ToastProvider>
          </PrivacyProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
