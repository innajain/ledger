import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import ClientPage from './ClientPage';
import { update_transaction } from '@/app/_actions/transactions_update';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const id = (await params).id;
  const user = await get_current_user();
  if (!user) return <div>Please log in.</div>;

  const tx = await prisma.transaction.findUnique({
    where: { id, user_id: user.id },
    include: { line_items: { include: { asset: true, account: true } } },
  });
  if (!tx) return <div>Transaction not found.</div>;

  // For now reuse the ClientPage to show transaction and provide an Edit entry point.
  const txForClient = {
    id: tx.id,
    date: tx.date,
    description: tx.description,
    total: tx.line_items.reduce((s, li) => s + (li.book_value ? Number(li.book_value.toString()) : 0), 0),
    line_items: tx.line_items.map(li => ({
      id: li.id,
      account_id: li.account.id,
      account_name: li.account.name,
      account_type: li.account.type,
      asset_id: li.asset.id,
      asset_name: li.asset.name,
      quantity: Number(li.quantity.toString()),
      book_value: li.book_value ? Number(li.book_value.toString()) : null,
      current_value: li.book_value ? Number(li.book_value.toString()) : 0,
    })),
  };
  const accounts = await prisma.account.findMany({ where: { user_id: user.id }, orderBy: { name: 'asc' } });
  const assets = await prisma.asset.findMany({ where: { user_id: user.id }, orderBy: { name: 'asc' } });

  const accountsForClient = accounts.map(a => ({ id: a.id, name: a.name, type: a.type }));
  const assetsForClient = assets.map(a => ({ id: a.id, name: a.name, type: a.type }));

  return <ClientPage transaction={txForClient} accounts={accountsForClient} assets={assetsForClient} updateTransaction={update_transaction} />;
}
