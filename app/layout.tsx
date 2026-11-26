import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Newsreader } from 'next/font/google'
import dynamic from 'next/dynamic'
import Navbar from './_components/Navbar'
import { get_current_user } from './_actions/auth'
import { get_user_preferences } from './_actions/preferences'
import { ThemeProvider } from './_components/ThemeProvider'
import { THEME_COLOR } from './_utils/theme_color'
import { PrivacyProvider } from './_components/PrivacyProvider'
import { ToastProvider } from './_components/Toast'
import { ConfirmProvider } from './_components/Confirm'
import { WebVitalsReporter } from './_components/WebVitalsReporter'
import { ServiceWorkerRegistrar } from './_components/ServiceWorkerRegistrar'
import { ScrollbarAutoHide } from './_components/ScrollbarAutoHide'
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

// Every amount is set in it (the `num` utility), so it is render-critical too.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Headings and a page's one hero figure. Variable, with optical sizing, so the large
// net-worth number gets the display cut and a section heading the text one.
const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  axes: ['opsz'],
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
  applicationName: 'Ledger',
  // Home-screen install on iOS: standalone window, "Ledger" under the icon, and an opaque
  // touch icon (iOS paints a transparent one black).
  appleWebApp: { capable: true, title: 'Ledger', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  // iOS otherwise turns long amounts and account numbers into tappable phone links.
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  // Status/title bar colour of the installed app, matched to the navbar. These follow the
  // OS scheme; ThemeProvider repoints them when the user picks a theme explicitly.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ],
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
      <body className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} font-sans antialiased bg-paper text-ink`}>
        {PROFILING_ENABLED && <WebVitalsReporter />}
        <ServiceWorkerRegistrar />
        <ScrollbarAutoHide />
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
              <ConfirmProvider>
                {DEV_QUERY_TOASTS_ENABLED && <DevQueryToaster />}
                <div className="min-h-screen flex flex-col">
                  <Navbar isLoggedIn={!!user} />
                  {}
                  <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">{children}</main>

                  {}
                  <footer data-site-footer className="bg-paper border-t border-rule mt-auto transition-colors">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                        <p className="text-center sm:text-left text-sm text-ink-3">
                          Built by
                          <Link
                            href="https://github.com/innajain"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink-2 hover:underline ml-1"
                          >
                            Shreyansh Jain
                          </Link>
                        </p>
                        <nav className="flex items-center gap-4 text-sm text-ink-3">
                          <Link href="/docs" className="hover:underline">
                            AI connector
                          </Link>
                          <Link href="/privacy" className="hover:underline">
                            Privacy
                          </Link>
                        </nav>
                      </div>
                    </div>
                  </footer>
                </div>
                <BackToTop />
              </ConfirmProvider>
            </ToastProvider>
          </PrivacyProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
