'use server';

import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import type { account_type, asset_type } from '@/generated/prisma/client';
import { get_latest_etf_or_shares_price, get_nav } from '../_utils/price_fetcher';

export async function create_account(name: string, type: account_type, parent_id?: string | null) {
  name = name.trim();
  if (name.length === 0) throw new Error('name cannot be empty string');

  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  await prisma.account.create({ data: { name, type, user_id: user.id, parent_id } });
}

export async function update_account(id: string, name?: string | undefined, type?: account_type | undefined, parent_id?: string | null | undefined) {
  if (id.length === 0) throw new Error('id is required');
  name = name?.trim();
  if (name !== undefined && name.length === 0) throw new Error('name cannot be empty string');

  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  const existing = await prisma.account.findUnique({ where: { id, user_id: user.id } });
  if (!existing) throw new Error('account not found');

  // If parent_id provided, validate
  if (parent_id) {
    if (parent_id === id) throw new Error('parent cannot be the account itself');
    // ensure parent exists and belongs to user
    let p = await prisma.account.findUnique({ where: { id: parent_id, user_id: user.id }, select: { id: true, user_id: true, parent_id: true } });
    if (!p) throw new Error('invalid parent account');

    // prevent cycles: walk up the parent chain
    let curr_parent_id: string | null = p.parent_id;
    while (curr_parent_id) {
      if (curr_parent_id === id) throw new Error('invalid parent: would create cycle');
      const next: { id: string; parent_id: string | null } | null = await prisma.account.findUnique({
        where: { id: curr_parent_id, user_id: user.id },
        select: { id: true, parent_id: true },
      });
      curr_parent_id = next?.parent_id ?? null;
    }
  }

  await prisma.account.update({ where: { id, user_id: user.id }, data: { name, type, parent_id } });
}

export async function delete_account(id: string): Promise<void> {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  await prisma.account.delete({ where: { id, user_id: user.id } });
}

// Assets
export async function create_asset(name: string, type: asset_type, ticker?: string | null | undefined, parent_id?: string | null | undefined) {
  if (name.length === 0) throw new Error('name cannot be empty string');

  if (type === 'etf' || type === 'mf' || type === 'shares') {
    if (!ticker || ticker.length === 0) throw new Error('ticker is required for asset type ' + type);
    if (type === 'mf') {
      if ((await get_nav({ code: ticker })) === null) throw new Error('invalid ticker for mutual fund: ' + ticker);
    } else if (type === 'etf' || type === 'shares') {
      if ((await get_latest_etf_or_shares_price(ticker)) === null) throw new Error('invalid ticker for etf/shares: ' + ticker);
    }
  } else if (ticker !== undefined && ticker !== null) {
    throw new Error('ticker cannot be non-null for asset type ' + type);
  }

  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  await prisma.asset.create({ data: { name, type, ticker, user_id: user.id, parent_id: parent_id } });
}

export async function update_asset(
  id: string,
  name?: string | undefined,
  type?: asset_type | undefined,
  ticker?: string | null | undefined,
  parent_id?: string | null | undefined
) {
  if (id.length === 0) throw new Error('id is required');
  if (name !== undefined && name.length === 0) throw new Error('name cannot be empty string');
  if (ticker !== undefined && ticker !== null && ticker.length === 0) throw new Error('ticker cannot be empty string');

  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  const existing = await prisma.asset.findUnique({ where: { id, user_id: user.id } });
  if (!existing) throw new Error('asset not found');
  if (existing.user_id !== user.id) throw new Error('asset does not belong to current user');

  if (parent_id) {
    if (parent_id === id) throw new Error('parent cannot be the asset itself');
    const p = await prisma.asset.findUnique({ where: { id: parent_id, user_id: user.id }, select: { id: true, user_id: true, parent_id: true } });
    if (!p) throw new Error('invalid parent asset');

    let curr_parent_id: string | null = p.parent_id;
    while (curr_parent_id) {
      if (curr_parent_id === id) throw new Error('invalid parent: would create cycle');
      const next: { id: string; parent_id: string | null } | null = await prisma.asset.findUnique({
        where: { id: curr_parent_id, user_id: user.id },
        select: { id: true, parent_id: true },
      });
      curr_parent_id = next?.parent_id ?? null;
    }
  }

  await prisma.$transaction(async prisma => {
    const asset = await prisma.asset.update({ where: { id, user_id: user.id }, data: { name, type, ticker, parent_id } });
    if (type === 'etf' || type === 'mf' || type === 'shares') {
      if (!asset.ticker || asset.ticker.length === 0) throw new Error('ticker is required for asset type ' + type);
      if (type === 'mf') {
        if ((await get_nav({ code: asset.ticker })) === null) throw new Error('invalid ticker for mutual fund: ' + asset.ticker);
      } else if (type === 'etf' || type === 'shares') {
        if ((await get_latest_etf_or_shares_price(asset.ticker)) === null) throw new Error('invalid ticker for etf/shares: ' + asset.ticker);
      }
    } else if (asset.ticker !== null) {
      throw new Error('ticker cannot non-null for asset type ' + type);
    }
  });
}

export async function delete_asset(id: string): Promise<void> {
  if (id.length === 0) throw new Error('id is required');

  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  await prisma.asset.delete({ where: { id, user_id: user.id } });
}
