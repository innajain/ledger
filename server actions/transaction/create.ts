'use server';

import { prisma } from '@/prisma';
import { get_date_obj_from_indian_date, get_indian_date_from_date_obj } from '@/utils/date';
import { Decimal } from 'decimal.js';

export async function create_income_transaction({
  description,
  date,
  asset_id,
  account_id,
  quantity,
  allocation_to_purpose_buckets,
}: {
  description?: string | undefined | null;
  date: string;
  asset_id: string;
  account_id: string;
  quantity: number;
  allocation_to_purpose_buckets: { purpose_bucket_id: string; quantity: number }[];
}) {
  const allocationSum = allocation_to_purpose_buckets.reduce((s, curr) => s.plus(new Decimal(curr.quantity)), new Decimal(0));
  if (!allocationSum.equals(new Decimal(quantity))) throw new Error('Sum of allocation to purpose buckets must equal the income quantity');

  return prisma.transaction
    .create({
      data: {
        type: 'income',
        description,
        date: get_date_obj_from_indian_date(date),
        income_txn: {
          create: { asset_id, account_id, quantity, allocation_to_purpose_buckets: { createMany: { data: allocation_to_purpose_buckets } } },
        },
      },
    })
    .catch(err => {
      throw new Error(err.message);
    });
}

export async function create_expense_transaction({
  description,
  date,
  asset_id,
  account_id,
  quantity,
  purpose_bucket_id,
}: {
  description?: string | undefined | null;
  date: string;
  asset_id: string;
  account_id: string;
  quantity: number;
  purpose_bucket_id: string;
}) {
  return prisma.transaction
    .create({
      data: {
        type: 'expense',
        description,
        date: get_date_obj_from_indian_date(date),
        expense_txn: { create: { asset_id, account_id, quantity, purpose_bucket_id } },
      },
    })
    .catch(err => {
      throw new Error(err.message);
    });
}

export async function create_self_transfer_or_refundable_or_refund_transaction({
  type,
  description,
  date,
  asset_id,
  from_account_id,
  to_account_id,
  quantity,
}: {
  type: 'self_transfer' | 'refundable' | 'refund';
  description?: string | undefined | null;
  date: string;
  asset_id: string;
  from_account_id: string;
  to_account_id: string;
  quantity: number;
}) {
  return prisma.transaction
    .create({
      data: {
        type,
        description,
        date: get_date_obj_from_indian_date(date),
        self_transfer_or_refundable_or_refund_txn: { create: { asset_id, from_account_id, to_account_id, quantity } },
      },
    })
    .catch(err => {
      throw new Error(err.message);
    });
}

export async function create_asset_trade_transaction({
  description,
  debit_asset_id,
  debit_account_id,
  debit_quantity,
  credit_asset_id,
  credit_account_id,
  credit_quantity,
  asset_replacement_in_purpose_buckets,
  date,
}: {
  description?: string | undefined | null;
  debit_asset_id: string;
  debit_account_id: string;
  debit_quantity: number;
  credit_asset_id: string;
  credit_account_id: string;
  credit_quantity: number;
  asset_replacement_in_purpose_buckets: { purpose_bucket_id: string; debit_quantity: number; credit_quantity: number }[];
  date: string;
}) {
  const total_debit_credit_in_buckets = asset_replacement_in_purpose_buckets.reduce(
    (acc, curr) => {
      acc.debit = acc.debit.plus(new Decimal(curr.debit_quantity));
      acc.credit = acc.credit.plus(new Decimal(curr.credit_quantity));
      return acc;
    },
    { debit: new Decimal(0), credit: new Decimal(0) }
  );

  if (!total_debit_credit_in_buckets.debit.equals(new Decimal(debit_quantity)))
    throw new Error('Sum of debit in purpose buckets must equal the debit quantity');
  if (!total_debit_credit_in_buckets.credit.equals(new Decimal(credit_quantity)))
    throw new Error('Sum of credit in purpose buckets must equal the credit quantity');

  return prisma.transaction
    .create({
      data: {
        type: 'asset_trade',
        description,
        date: get_date_obj_from_indian_date(date),
        asset_trade_txn: {
          create: {
            debit_asset_id,
            debit_account_id,
            debit_quantity,
            credit_asset_id,
            credit_account_id,
            credit_quantity,
            asset_replacement_in_purpose_buckets: { createMany: { data: asset_replacement_in_purpose_buckets } },
          },
        },
      },
    })
    .catch(err => {
      throw new Error(err.message);
    });
}
