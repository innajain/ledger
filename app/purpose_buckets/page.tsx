import { prisma } from '@/prisma';
import ClientPage from './ClientPage';
import { get_price_for_asset } from '@/utils/price_fetcher';
import { asset, Prisma } from '@/generated/prisma';
import { Decimal } from 'decimal.js';

export default async function Page() {
  const buckets = await prisma.purpose_bucket.findMany({
    include: {
      allocation_to_purpose_buckets: {
        include: { allocation_thru_account_opening: { include: { asset: true } }, allocation_thru_income: { include: { asset: true } } },
      },
      expense_txn: { include: { account: true, asset: true } },
      asset_reallocation_between_purpose_buckets_from: { include: { asset: true, to_purpose_bucket: true } },
      asset_reallocation_between_purpose_buckets_to: { include: { asset: true, from_purpose_bucket: true } },
      asset_replacement_in_purpose_buckets: { include: { asset_trade_txn: { include: { debit_asset: true, credit_asset: true } } } },
    },
  });
  const purpose_buckets_with_asset_balances = await Promise.all(
    buckets.map(async bucket => {
      const asset_balances = calc_asset_balances_in_bucket({ bucket });
      return { ...bucket, asset_balances };
    })
  );
  const purpose_buckets_with_asset_balances_values = await calc_asset_values_in_buckets(purpose_buckets_with_asset_balances);

  const passable_data = purpose_buckets_with_asset_balances_values.map(pb => ({
    ...pb,
    asset_balances: pb.asset_balances.map(ab => ({
      ...ab,
      balance: ab.balance.toNumber(),
    })),
  }));
  return <ClientPage purpose_buckets_with_balances={passable_data} />;
}

export async function calc_asset_values_in_buckets(
  purpose_buckets_with_asset_balances: (Prisma.purpose_bucketGetPayload<{
    include: {
      allocation_to_purpose_buckets: { include: { allocation_thru_account_opening: true; allocation_thru_income: true } };
      expense_txn: { include: { account: true; asset: true } };
      asset_reallocation_between_purpose_buckets_from: { include: { asset: true; to_purpose_bucket: true } };
      asset_reallocation_between_purpose_buckets_to: { include: { asset: true; from_purpose_bucket: true } };
      asset_replacement_in_purpose_buckets: { include: { asset_trade_txn: true } };
    };
  }> & {
    asset_balances: (asset & { balance: Decimal })[];
  })[]
) {
  const asset_to_price = new Map(
    await Promise.all(
      new Map(purpose_buckets_with_asset_balances.flatMap(b => b.asset_balances.map(a => [a.id, a] as [string, asset]))).values().map(async v => {
        const price = await get_price_for_asset(v.type, v.code);
        return [v.id, price] as [
          string,
          {
            price: number;
            date: Date;
          } | null
        ];
      })
    )
  );

  const purpose_buckets_with_asset_balances_values = purpose_buckets_with_asset_balances.map(pb => {
    const asset_balances = pb.asset_balances.map(asset => {
      const price = asset_to_price.get(asset.id);
      const monetary_value = price && asset.balance.mul(price.price).toNumber();
      return { ...asset, monetary_value, price };
    });
    return { ...pb, asset_balances };
  });

  const bucket_with_values = purpose_buckets_with_asset_balances_values.map(pb => {
    const monetary_value = pb.asset_balances.reduce((s, a) => s.plus(a.monetary_value || 0), new Decimal(0)).toNumber();
    return { ...pb, monetary_value };
  });

  return bucket_with_values;
}

export function calc_asset_balances_in_bucket({
  bucket,
}: {
  bucket: Prisma.purpose_bucketGetPayload<{
    include: {
      allocation_to_purpose_buckets: {
        include: { allocation_thru_account_opening: { include: { asset: true } }; allocation_thru_income: { include: { asset: true } } };
      };
      expense_txn: { include: { account: true; asset: true } };
      asset_reallocation_between_purpose_buckets_from: { include: { asset: true; to_purpose_bucket: true } };
      asset_reallocation_between_purpose_buckets_to: { include: { asset: true; from_purpose_bucket: true } };
      asset_replacement_in_purpose_buckets: { include: { asset_trade_txn: { include: { debit_asset: true; credit_asset: true } } } };
    };
  }>;
}) {
  const asset_to_balance = new Map<string, asset & { balance: Decimal }>();

  bucket.allocation_to_purpose_buckets.forEach(r => {
    const asset_id = (r.allocation_thru_account_opening?.asset_id || r.allocation_thru_income?.asset_id)!;
    const asset = (r.allocation_thru_account_opening?.asset || r.allocation_thru_income?.asset)!;
    const existing = asset_to_balance.get(asset_id!);
    if (!existing) {
      asset_to_balance.set(asset_id!, { ...asset, balance: new Decimal(0).plus(r.quantity) });
    } else {
      asset_to_balance.set(asset_id!, { ...existing, balance: existing.balance.plus(r.quantity) });
    }
  });

  bucket.expense_txn.forEach(r => {
    const existing = asset_to_balance.get(r.asset_id);
    if (!existing) {
      asset_to_balance.set(r.asset_id, { ...r.asset, balance: new Decimal(0).minus(r.quantity) });
    } else {
      asset_to_balance.set(r.asset_id, { ...existing, balance: existing.balance.minus(r.quantity) });
    }
  });

  bucket.asset_reallocation_between_purpose_buckets_from.forEach(r => {
    const existing = asset_to_balance.get(r.asset_id);
    if (!existing) {
      asset_to_balance.set(r.asset_id, { ...r.asset, balance: new Decimal(0).minus(r.quantity) });
    } else {
      asset_to_balance.set(r.asset_id, { ...existing, balance: existing.balance.minus(r.quantity) });
    }
  });

  bucket.asset_reallocation_between_purpose_buckets_to.forEach(r => {
    const existing = asset_to_balance.get(r.asset_id);
    if (!existing) {
      asset_to_balance.set(r.asset_id, { ...r.asset, balance: new Decimal(0).plus(r.quantity) });
    } else {
      asset_to_balance.set(r.asset_id, { ...existing, balance: existing.balance.plus(r.quantity) });
    }
  });
  bucket.asset_replacement_in_purpose_buckets.forEach(r => {
    const existingDebit = asset_to_balance.get(r.asset_trade_txn.debit_asset_id);
    if (!existingDebit) {
      asset_to_balance.set(r.asset_trade_txn.debit_asset_id, {
        ...r.asset_trade_txn.debit_asset,
        balance: new Decimal(0).minus(r.asset_trade_txn.debit_quantity),
      });
    } else {
      asset_to_balance.set(r.asset_trade_txn.debit_asset_id, {
        ...existingDebit,
        balance: existingDebit.balance.minus(r.asset_trade_txn.debit_quantity),
      });
    }
    const existingCredit = asset_to_balance.get(r.asset_trade_txn.credit_asset_id);
    if (!existingCredit) {
      asset_to_balance.set(r.asset_trade_txn.credit_asset_id, {
        ...r.asset_trade_txn.credit_asset,
        balance: new Decimal(0).plus(r.asset_trade_txn.credit_quantity),
      });
    } else {
      asset_to_balance.set(r.asset_trade_txn.credit_asset_id, {
        ...existingCredit,
        balance: existingCredit.balance.plus(r.asset_trade_txn.credit_quantity),
      });
    }
  });

  return asset_to_balance.values().toArray();
}
