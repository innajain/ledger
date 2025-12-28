import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import ClientPage from './ClientPage';
import { Prisma } from '@/generated/prisma/client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Transactions',
  description: 'View and manage all your financial transactions',
};

export default async function Page() {
  const user = await get_current_user();
  if (!user) {
    return (
      <div>
        <h1>Transactions</h1>
        <p>Please log in to view transactions.</p>
      </div>
    );
  }

  const transactions = await prisma.transaction.findMany({
    where: { user_id: user.id },
    include: { line_items: { include: { asset: true, account: true } } },
    orderBy: { datetime: 'desc' },
  });

  const txForClient = transactions.map(t => ({
    id: t.id,
    date: t.datetime,
    description: t.description,
    total_book: t.line_items
      .filter(li => li.account.type === 'nominal')
      .reduce((s, li) => s.add(li.book_value ? li.book_value : li.quantity), new Prisma.Decimal(0))
      .toNumber(),
  }));

  return <ClientPage transactions={txForClient} />;
}
