import { prisma } from './lib/prisma';
import { get_price_for_asset, get_latest_etf_or_shares_price, get_nav } from './app/_utils/price_fetcher';
import { asset_type, Prisma } from '@/generated/prisma/client';
import { fileURLToPath } from 'url';

type Issue = { kind: 'error' | 'warning'; message: string };

async function checkNoCycles(model: 'account' | 'asset'): Promise<Issue[]> {
  const issues: Issue[] = [];
  const items = await (model === 'account'
    ? prisma.account.findMany({ select: { id: true, parent_id: true, name: true } })
    : prisma.asset.findMany({ select: { id: true, parent_id: true, name: true } }));

  const byId = new Map(items.map(i => [i.id, i]));

  for (const it of items) {
    const seen = new Set<string>();
    let pid: string | null = it.parent_id ?? null;
    while (pid) {
      if (seen.has(pid)) {
        issues.push({ kind: 'error', message: `${model} cycle detected starting at ${it.id} (${it.name})` });
        break;
      }
      seen.add(pid);
      const next = byId.get(pid);
      if (!next) break; // parent outside set (shouldn't happen for same-user scoped check)
      pid = next.parent_id ?? null;
    }
  }

  return issues;
}

async function checkAssetTickersAndPrices(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const assets = await prisma.asset.findMany({ select: { id: true, name: true, type: true, ticker: true } });

  for (const a of assets) {
    if (a.type === 'mf' || a.type === 'etf') {
      if (!a.ticker) {
        issues.push({ kind: 'error', message: `asset ${a.id} (${a.name}) of type ${a.type} missing ticker` });
        continue;
      }
      try {
        const p = await get_price_for_asset(a.type, a.ticker ?? null);
        if (!p || p.price == null) {
          // try nav for mf as extra
          if (a.type === 'mf') {
            const nav = await get_nav({ code: a.ticker ?? '' });
            if (!nav || nav.nav == null)
              issues.push({ kind: 'error', message: `could not fetch price for asset ${a.id} (${a.name}) ticker=${a.ticker}` });
          } else {
            issues.push({ kind: 'error', message: `could not fetch price for asset ${a.id} (${a.name}) ticker=${a.ticker}` });
          }
        }
      } catch (e) {
        issues.push({ kind: 'error', message: `price fetch error for asset ${a.id} (${a.name}) ticker=${a.ticker}: ${(e as Error).message}` });
      }
    } else if (a.type === 'shares') {
      if (!a.ticker) {
        issues.push({ kind: 'error', message: `asset ${a.id} (${a.name}) of type shares missing ticker` });
        continue;
      }
      try {
        const p = await get_latest_etf_or_shares_price(a.ticker ?? '');
        if (!p || p.close == null)
          issues.push({ kind: 'error', message: `could not fetch price for shares asset ${a.id} (${a.name}) ticker=${a.ticker}` });
      } catch (e) {
        issues.push({ kind: 'error', message: `price fetch error for shares asset ${a.id} (${a.name}) ticker=${a.ticker}: ${(e as Error).message}` });
      }
    }
  }

  return issues;
}

async function checkLineItemsBookValue(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const line_items = await prisma.line_item.findMany({ include: { asset: true, transaction: true } });
  for (const li of line_items) {
    if (!(li.asset.type === asset_type.rupees) && li.book_value == null) {
      issues.push({
        kind: 'error',
        message: `line_item ${li.id} (tx=${li.transaction_id}) asset ${li.asset.id} (${li.asset.name}) is of type rupees but book_value is null`,
      });
    } else if (li.asset.type === asset_type.rupees && li.book_value != null) {
      issues.push({
        kind: 'error',
        message: `line_item ${li.id} (tx=${li.transaction_id}) asset ${li.asset.id} (${li.asset.name}) is of type rupees but book_value is not null`,
      });
    }
  }
  return issues;
}

async function checkNonEmptyDescriptions(): Promise<Issue[]> {
  const issues: Issue[] = [];

  const txs = await prisma.transaction.findMany({ select: { id: true, description: true } });
  for (const t of txs) {
    if (t.description === '') {
      issues.push({ kind: 'error', message: `transaction ${t.id} has empty description` });
    }
  }

  const lis = await prisma.line_item.findMany({ select: { id: true, description: true, transaction_id: true } });
  for (const li of lis) {
    if (li.description === '') {
      issues.push({ kind: 'error', message: `line_item ${li.id} (tx=${li.transaction_id}) has empty description` });
    }
  }

  return issues;
}

async function checkTransactionsInvariants(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const txs = await prisma.transaction.findMany({ include: { line_items: { include: { account: true, asset: true } } } });

  for (const tx of txs) {
    const qty_by_asset_real = new Map<string, Prisma.Decimal>();
    const qty_by_asset_alloc = new Map<string, Prisma.Decimal>();
    const qty_by_asset_nominal = new Map<string, Prisma.Decimal>();

    const ZERO = new Prisma.Decimal(0);
    let sum_value_real = ZERO;
    let sum_value_alloc = ZERO;
    let sum_value_nominal = ZERO;

    for (const li of tx.line_items) {
      const acc_type = li.account.type;
      const qty = new Prisma.Decimal(li.quantity.toString());
      const book_val = new Prisma.Decimal((li.book_value ?? li.quantity).toString());

      if (acc_type === 'real') {
        const prev = qty_by_asset_real.get(li.asset_id) ?? ZERO;
        qty_by_asset_real.set(li.asset_id, prev.add(qty));
      } else if (acc_type === 'allocation') {
        const prev = qty_by_asset_alloc.get(li.asset_id) ?? ZERO;
        qty_by_asset_alloc.set(li.asset_id, prev.add(qty));
      } else {
        const prev = qty_by_asset_nominal.get(li.asset_id) ?? ZERO;
        qty_by_asset_nominal.set(li.asset_id, prev.add(qty));
      }

      if (acc_type === 'real') sum_value_real = sum_value_real.add(book_val);
      else if (acc_type === 'allocation') sum_value_alloc = sum_value_alloc.add(book_val);
      else if (acc_type === 'nominal') sum_value_nominal = sum_value_nominal.add(book_val);
    }

    // check per-asset qty equality
    const asset_ids = Array.from(new Set(tx.line_items.map(li => li.asset_id)));
    for (const aid of asset_ids) {
      const real_qty = qty_by_asset_real.get(aid) ?? ZERO;
      const alloc_qty = qty_by_asset_alloc.get(aid) ?? ZERO;
      const nomin_qty = qty_by_asset_nominal.get(aid) ?? ZERO;
      if (!real_qty.equals(alloc_qty) || !real_qty.equals(nomin_qty)) {
        const assetName = tx.line_items.find(li => li.asset_id === aid)?.asset.name ?? aid;
        issues.push({
          kind: 'error',
          message: `transaction ${
            tx.id
          }: quantity mismatch for asset ${aid} (${assetName}) real=${real_qty.toString()} allocation=${alloc_qty.toString()} nominal=${nomin_qty.toString()}`,
        });
      }
    }

    // check book value sums
    if (!sum_value_real.equals(sum_value_nominal) || !sum_value_alloc.equals(sum_value_nominal)) {
      issues.push({
        kind: 'error',
        message: `transaction ${
          tx.id
        }: invariant failed: book_value in real (${sum_value_real.toString()}), allocation (${sum_value_alloc.toString()}), nominal (${sum_value_nominal.toString()}) do not match`,
      });
    }
  }

  return issues;
}

export async function runIntegrityChecks(): Promise<{ ok: boolean; issues: Issue[] }> {
  const issues: Issue[] = [];

  issues.push(...(await checkNoCycles('account')));
  issues.push(...(await checkNoCycles('asset')));
  issues.push(...(await checkAssetTickersAndPrices()));
  issues.push(...(await checkNonEmptyDescriptions()));
  issues.push(...(await checkLineItemsBookValue()));
  issues.push(...(await checkTransactionsInvariants()));

  return { ok: issues.length === 0, issues };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  (async () => {
    try {
      const res = await runIntegrityChecks();
      if (res.issues.length === 0) {
        console.log('Integrity check: OK — no issues found');
        process.exit(0);
      }
      console.error('Integrity check: found issues:');
      for (const it of res.issues) console.error(`[${it.kind}] ${it.message}`);
      process.exit(2);
    } catch (e) {
      console.error('Integrity check failed with exception:', (e as Error).stack ?? (e as Error).message);
      process.exit(3);
    } finally {
      await prisma.$disconnect();
    }
  })();
}
