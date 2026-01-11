'use client';

import { AccountDetailPage, AccountData } from '@/app/_components/AccountDetailPage';
import { asset_type } from '@/generated/prisma/enums';

type LineItem = {
  id: string;
  asset_id: string;
  asset_name: string;
  quantity: number;
  book_value: number | null;
  current_value: number;
  transaction_id: string;
  transaction_date: string;
  transaction_description: string | null;
  line_item_description: string | null;
  asset_type: asset_type;
};

type AccountForClient = {
  id: string;
  name: string;
  type: string;
  parent: { id: string; name: string } | null;
  total: number;
  breakdown: { asset_id: string; asset_name: string; asset_type: asset_type; quantity: number; book_value: number | null; current_value: number }[];
  line_items: LineItem[];
};

const nominalDetailConfig = {
  backLink: '/income_expenses',
  backText: 'Back to Nominal Accounts',
  entityName: 'Account',
};

export default function ClientPage({ account }: { account: AccountForClient }) {
  const accountData: AccountData = {
    ...account,
    breakdown: account.breakdown.map(b => ({
      ...b,
      asset_type: b.asset_type,
    })),
    line_items: account.line_items,
  };

  return <AccountDetailPage account={accountData} config={nominalDetailConfig} />;
}
