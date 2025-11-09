'use server';

import { prisma } from '@/prisma';
import { get_date_obj_from_indian_date } from '@/utils/date';
import { Decimal } from 'decimal.js';

export async function update_income_transaction(
  id: string,
  {
    description,
    date,
    asset_id,
    account_id,
    quantity,
    allocation_to_purpose_buckets_creates,
    allocation_to_purpose_buckets_deletes,
    allocation_to_purpose_buckets_updates,
  }: {
    description?: string | undefined | null;
    date?: string | undefined;
    asset_id?: string | undefined;
    account_id?: string | undefined;
    quantity?: number | undefined;
    allocation_to_purpose_buckets_creates: { purpose_bucket_id: string; quantity: number }[];
    allocation_to_purpose_buckets_deletes: { id: string }[];
    allocation_to_purpose_buckets_updates: { id: string; purpose_bucket_id?: string | undefined; quantity?: number | undefined }[];
  }
) {
  const parsedDate = date && get_date_obj_from_indian_date(date);
  return prisma
    .$transaction(async tx => {
      const txn = await tx.transaction.update({
        where: { id },
        data: {
          description,
          date: parsedDate,
          income_txn: {
            update: {
              asset_id,
              account_id,
              quantity,
              allocation_to_purpose_buckets: {
                createMany: { data: allocation_to_purpose_buckets_creates },
                deleteMany: { id: { in: allocation_to_purpose_buckets_deletes.map(d => d.id) } },
                updateMany: allocation_to_purpose_buckets_updates.map(update => ({
                  where: { id: update.id },
                  data: { purpose_bucket_id: update.purpose_bucket_id, quantity: update.quantity },
                })),
              },
            },
          },
        },
        include: { income_txn: { include: { allocation_to_purpose_buckets: true } } },
      });

      const allocSum = txn.income_txn!.allocation_to_purpose_buckets.reduce((s, curr) => s.plus(new Decimal(curr.quantity)), new Decimal(0));
      if (!new Decimal(txn.income_txn!.quantity).equals(allocSum))
        throw new Error('Sum of allocation to purpose buckets must equal the income quantity');

      return txn;
    })
    .catch(err => {
      throw new Error(err.message);
    });
}

export async function update_expense_transaction(
  id: string,
  {
    description,
    date,
    asset_id,
    account_id,
    quantity,
    purpose_bucket_id,
  }: {
    description?: string | undefined | null;
    date?: string | undefined;
    asset_id?: string | undefined;
    account_id?: string | undefined;
    quantity?: number | undefined;
    purpose_bucket_id?: string | undefined;
  }
) {
  const parsedDate = date && get_date_obj_from_indian_date(date);
  return prisma.transaction
    .update({
      where: { id },
      data: {
        description,
        date: parsedDate,
        expense_txn: { update: { asset_id, account_id, quantity, purpose_bucket_id } },
      },
    })
    .catch(err => {
      throw new Error(err.message);
    });
}

export async function update_self_transfer_or_refundable_or_refund_transaction(
  id: string,
  {
    type,
    description,
    date,
    asset_id,
    from_account_id,
    to_account_id,
    quantity,
  }: {
    type?: 'self_transfer' | 'refundable' | 'refund' | undefined;
    description?: string | undefined | null;
    date?: string | undefined;
    asset_id?: string | undefined;
    from_account_id?: string | undefined;
    to_account_id?: string | undefined;
    quantity?: number | undefined;
  }
) {
  const parsedDate = date && get_date_obj_from_indian_date(date);
  return prisma.transaction
    .update({
      where: { id },
      data: {
        type,
        description,
        date: parsedDate,
        self_transfer_or_refundable_or_refund_txn: {
          update: { asset_id, from_account_id, to_account_id, quantity },
        },
      },
    })
    .catch(err => {
      throw new Error(err.message);
    });
}

export async function update_asset_trade_transaction(
  id: string,
  {
    description,
    debit_asset_id,
    debit_account_id,
    debit_quantity,
    credit_asset_id,
    credit_account_id,
    credit_quantity,
    asset_replacement_in_purpose_buckets_creates,
    asset_replacement_in_purpose_buckets_deletes,
    asset_replacement_in_purpose_buckets_updates,
    date,
  }: {
    description?: string | undefined | null;
    debit_asset_id?: string | undefined;
    debit_account_id?: string | undefined;
    debit_quantity?: number | undefined;
    credit_asset_id?: string | undefined;
    credit_account_id?: string | undefined;
    credit_quantity?: number | undefined;
    asset_replacement_in_purpose_buckets_creates: { purpose_bucket_id: string; debit_quantity: number; credit_quantity: number }[];
    asset_replacement_in_purpose_buckets_deletes: { id: string }[];
    asset_replacement_in_purpose_buckets_updates: {
      id: string;
      purpose_bucket_id?: string | undefined;
      debit_quantity?: number | undefined;
      credit_quantity?: number | undefined;
    }[];
    date?: string | undefined;
  }
) {
  const parsedDate = date && get_date_obj_from_indian_date(date);
  return prisma
    .$transaction(async tx => {
      const txn = await tx.transaction.update({
        where: { id },
        data: {
          description,
          date: parsedDate,
          asset_trade_txn: {
            update: {
              debit_asset_id,
              debit_account_id,
              debit_quantity,
              credit_asset_id,
              credit_account_id,
              credit_quantity,
              asset_replacement_in_purpose_buckets: {
                createMany: { data: asset_replacement_in_purpose_buckets_creates },
                deleteMany: { id: { in: asset_replacement_in_purpose_buckets_deletes.map(d => d.id) } },
                updateMany: asset_replacement_in_purpose_buckets_updates.map(update => ({
                  where: { id: update.id },
                  data: {
                    purpose_bucket_id: update.purpose_bucket_id,
                    debit_quantity: update.debit_quantity,
                    credit_quantity: update.credit_quantity,
                  },
                })),
              },
            },
          },
        },
        include: { asset_trade_txn: { include: { asset_replacement_in_purpose_buckets: true } } },
      });

      const total_debit_credit_in_buckets = txn.asset_trade_txn!.asset_replacement_in_purpose_buckets.reduce(
        (acc, curr) => {
          acc.debit = acc.debit.plus(new Decimal(curr.debit_quantity));
          acc.credit = acc.credit.plus(new Decimal(curr.credit_quantity));
          return acc;
        },
        { debit: new Decimal(0), credit: new Decimal(0) }
      );

      if (!new Decimal(txn.asset_trade_txn!.debit_quantity).equals(total_debit_credit_in_buckets.debit))
        throw new Error('Sum of debit in purpose buckets must equal the debit quantity');
      if (!new Decimal(txn.asset_trade_txn!.credit_quantity).equals(total_debit_credit_in_buckets.credit))
        throw new Error('Sum of credit in purpose buckets must equal the credit quantity');
    })
    .catch(err => {
      throw new Error(err.message);
    });
}
