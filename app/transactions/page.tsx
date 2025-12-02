import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import ClientPage from './ClientPage';
import { Prisma } from '@/generated/prisma/client';

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
    orderBy: { date: 'desc' },
  });

  const txForClient = transactions.map(t => ({
    id: t.id,
    date: t.date.toISOString(),
    description: t.description,
    total_book: t.line_items
      .filter(li => li.account.type === 'nominal')
      .reduce((s, li) => s.add(li.book_value ? li.book_value : li.quantity), new Prisma.Decimal(0))
      .mul(-1)
      .toNumber(),
  }));

  return <ClientPage transactions={txForClient} />;
}
