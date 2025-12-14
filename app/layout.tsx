import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Navbar from './_components/Navbar';
import { get_current_user } from './_actions/auth';
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
  title: 'Ledger App',
  description: 'Professional ledger and asset management',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await get_current_user();
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50`}>
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <Navbar isLoggedIn={!!user} />

          {/* Main Content */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>

          {/* Footer */}
          <footer className="bg-white border-t border-slate-200 mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <p className="text-center text-sm text-slate-500">
                Made with ♥ by
                <Link href="https://github.com/innajain" target="_blank" rel="noopener noreferrer" className="text-slate-700 hover:underline mx-1">
                  Shreyansh Jain
                </Link>
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
