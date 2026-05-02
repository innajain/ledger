'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import type { account_type, asset_type } from '@/generated/prisma/client'
import { get_latest_etf_or_shares_price, get_nav } from '../_utils/price_fetcher'
import { invalidate_balances } from './compute_balances'

const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty string'),
})

export async function create_account(name: string, type: account_type, parent_id?: string | null): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = createAccountSchema.safeParse({ name })
    if (!parsed.success) throw new Error(parsed.error.issues[0].message)
    name = parsed.data.name

    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('unauthorized')

    await prisma.account.create({
      data: { name, type, user_id, parent_id },
    })
    await invalidate_balances(user_id)
    return { success: true, message: '' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

const updateAccountSchema = z.object({
  id: z.string().min(1, 'id is required'),
  name: z.string().trim().min(1, 'name cannot be empty string').optional(),
})

export async function update_account(
  id: string,
  name?: string | undefined,
  type?: account_type | undefined,
  parent_id?: string | null | undefined,
): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = updateAccountSchema.safeParse({ id, name })
    if (!parsed.success) throw new Error(parsed.error.issues[0].message)
    id = parsed.data.id
    name = parsed.data.name

    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('unauthorized')

    const existing = await prisma.account.findUnique({
      where: { id, user_id },
    })
    if (!existing) throw new Error('account not found')

    // If parent_id provided, validate
    if (parent_id) {
      if (parent_id === id) throw new Error('parent cannot be the account itself')
      // ensure parent exists and belongs to user
      const p = await prisma.account.findUnique({
        where: { id: parent_id, user_id },
        select: { id: true, user_id: true, parent_id: true },
      })
      if (!p) throw new Error('invalid parent account')

      const all_accounts = await prisma.account.findMany({
        where: { user_id },
        select: { id: true, parent_id: true },
      })
      const parentMap = new Map(all_accounts.map(a => [a.id, a.parent_id]))

      // prevent cycles: walk up the parent chain
      let curr_parent_id: string | null = p.parent_id
      while (curr_parent_id) {
        if (curr_parent_id === id) throw new Error('invalid parent: would create cycle')
        curr_parent_id = parentMap.get(curr_parent_id) ?? null
      }
    }

    await prisma.account.update({
      where: { id, user_id },
      data: { name, type, parent_id },
    })
    await invalidate_balances(user_id)
    return { success: true, message: '' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

const deleteAccountSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function delete_account(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = deleteAccountSchema.safeParse({ id })
    if (!parsed.success) throw new Error(parsed.error.issues[0].message)
    id = parsed.data.id

    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('unauthorized')

    await prisma.account.delete({ where: { id, user_id } })
    await invalidate_balances(user_id)
    return { success: true, message: '' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// Assets
const createAssetSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty string'),
  ticker: z.string().trim().min(1, 'ticker cannot be empty string').nullish(),
})

export async function create_asset(
  name: string,
  type: asset_type,
  ticker?: string | null | undefined,
  parent_id?: string | null | undefined,
): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = createAssetSchema.safeParse({ name, ticker })
    if (!parsed.success) throw new Error(parsed.error.issues[0].message)
    name = parsed.data.name
    ticker = parsed.data.ticker

    if (type === 'etf' || type === 'mf' || type === 'shares') {
      if (!ticker || ticker.length === 0) throw new Error('ticker is required for asset type ' + type)
      if (type === 'mf') {
        if ((await get_nav({ code: ticker })) === null) throw new Error('invalid ticker for mutual fund: ' + ticker)
      } else if (type === 'etf' || type === 'shares') {
        if ((await get_latest_etf_or_shares_price(ticker)) === null) throw new Error('invalid ticker for etf/shares: ' + ticker)
      }
    } else if (ticker !== undefined && ticker !== null) {
      throw new Error('ticker cannot be non-null for asset type ' + type)
    }

    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('unauthorized')

    await prisma.asset.create({
      data: { name, type, ticker, user_id, parent_id: parent_id },
    })
    await invalidate_balances(user_id)
    return { success: true, message: '' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

const updateAssetSchema = z.object({
  id: z.string().min(1, 'id is required'),
  name: z.string().trim().min(1, 'name cannot be empty string').optional(),
  ticker: z.string().trim().min(1, 'ticker cannot be empty string').nullish(),
})

export async function update_asset(
  id: string,
  name?: string | undefined,
  type?: asset_type | undefined,
  ticker?: string | null | undefined,
  parent_id?: string | null | undefined,
): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = updateAssetSchema.safeParse({ id, name, ticker })
    if (!parsed.success) throw new Error(parsed.error.issues[0].message)
    id = parsed.data.id
    name = parsed.data.name
    ticker = parsed.data.ticker

    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('unauthorized')

    const existing = await prisma.asset.findUnique({
      where: { id, user_id },
    })
    if (!existing) throw new Error('asset not found')
    if (existing.user_id !== user_id) throw new Error('asset does not belong to current user')

    if (parent_id) {
      if (parent_id === id) throw new Error('parent cannot be the asset itself')
      const p = await prisma.asset.findUnique({
        where: { id: parent_id, user_id },
        select: { id: true, user_id: true, parent_id: true },
      })
      if (!p) throw new Error('invalid parent asset')

      const all_assets = await prisma.asset.findMany({
        where: { user_id },
        select: { id: true, parent_id: true },
      })
      const parentMap = new Map(all_assets.map(a => [a.id, a.parent_id]))

      let curr_parent_id: string | null = p.parent_id
      while (curr_parent_id) {
        if (curr_parent_id === id) throw new Error('invalid parent: would create cycle')
        curr_parent_id = parentMap.get(curr_parent_id) ?? null
      }
    }

    await prisma.$transaction(async prisma => {
      const asset = await prisma.asset.update({
        where: { id, user_id },
        data: { name, type, ticker, parent_id },
      })
      if (type === 'etf' || type === 'mf' || type === 'shares') {
        if (!asset.ticker || asset.ticker.length === 0) throw new Error('ticker is required for asset type ' + type)
        if (type === 'mf') {
          if ((await get_nav({ code: asset.ticker })) === null) throw new Error('invalid ticker for mutual fund: ' + asset.ticker)
        } else if (type === 'etf' || type === 'shares') {
          if ((await get_latest_etf_or_shares_price(asset.ticker)) === null) throw new Error('invalid ticker for etf/shares: ' + asset.ticker)
        }
      } else if (asset.ticker !== null) {
        throw new Error('ticker cannot non-null for asset type ' + type)
      }
    })
    await invalidate_balances(user_id)
    return { success: true, message: '' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

const deleteAssetSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function delete_asset(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = deleteAssetSchema.safeParse({ id })
    if (!parsed.success) throw new Error(parsed.error.issues[0].message)
    id = parsed.data.id

    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('unauthorized')

    await prisma.asset.delete({ where: { id, user_id } })
    await invalidate_balances(user_id)
    return { success: true, message: '' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}
