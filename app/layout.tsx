import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from './components/Navbar';

export const metadata: Metadata = {
  title: 'Ledger',
  description: 'My personal finance ledger application',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}

export const dynamic = 'force-dynamic';
