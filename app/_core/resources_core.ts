import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { accounting_head_type, asset_type } from '@/generated/prisma/client'
import { get_latest_etf_or_shares_price, get_nav } from '@/app/_utils/price_fetcher'
import { invalidate_balances } from '@/app/_core/balances_core'
import { backfill_links_for_account } from '@/app/_utils/links'
import { notify_request_pending } from '@/app/_utils/notify_events'
import { ActionResult, ok, err, fromError, ActionError } from '@/app/_actions/_result'

async function resolve_linked_user(
  user_id: string,
  type: accounting_head_type | undefined,
  linked_user_id: string | null,
  current_head_id: string | null,
): Promise<string | null> {
  if (!linked_user_id) return null
  if (type !== 'account') throw new ActionError('VALIDATION', 'Only account-type heads can be linked to another user')
  if (linked_user_id === user_id) throw new ActionError('VALIDATION', 'You cannot link an account to yourself')
  const target = await prisma.user.findUnique({ where: { id: linked_user_id }, select: { id: true } })
  if (!target) throw new ActionError('NOT_FOUND', 'Linked user not found')
  const dupe = await prisma.accounting_head.findFirst({
    where: { user_id, linked_user_id, ...(current_head_id ? { id: { not: current_head_id } } : {}) },
    select: { id: true },
  })
  if (dupe) throw new ActionError('VALIDATION', 'You already have an account linked to this user')
  return linked_user_id
}

const findUserSchema = z.object({ username: z.string().trim().min(1, 'username is required') })

export async function find_user_by_username_core(me: string, username: string): Promise<ActionResult<{ id: string; username: string }>> {
  try {
    const parsed = findUserSchema.safeParse({ username })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    const user = await prisma.user.findUnique({ where: { username: parsed.data.username }, select: { id: true, username: true } })
    if (!user) return err('NOT_FOUND', 'No user with that username')
    if (user.id === me) return err('VALIDATION', 'That is your own account')
    return ok(user)
  } catch (error) {
    return fromError(error)
  }
}

const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty string').max(120, 'name is too long'),
})

export async function create_account_core(
  user_id: string,
  name: string,
  type: accounting_head_type,
  parent_id?: string | null,
  linked_user_id?: string | null,
): Promise<ActionResult> {
  try {
    const parsed = createAccountSchema.safeParse({ name })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    name = parsed.data.name

    const linked = await resolve_linked_user(user_id, type, linked_user_id ?? null, null)

    if (parent_id) {
      const parent = await prisma.accounting_head.findUnique({ where: { id: parent_id, user_id }, select: { id: true } })
      if (!parent) throw new ActionError('VALIDATION', 'Invalid parent account')
    }

    await prisma.accounting_head.create({
      data: { name, type, user_id, parent_id, linked_user_id: linked },
    })
    await invalidate_balances(user_id)
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const updateAccountSchema = z.object({
  id: z.string().min(1, 'id is required'),
  name: z.string().trim().min(1, 'name cannot be empty string').max(120, 'name is too long').optional(),
})

export async function update_account_core(
  user_id: string,
  id: string,
  name?: string | undefined,
  type?: accounting_head_type | undefined,
  parent_id?: string | null | undefined,
  is_active?: boolean | undefined,
  is_placeholder?: boolean | undefined,
  linked_user_id?: string | null | undefined,
  lock_date?: Date | null | undefined,
): Promise<ActionResult> {
  try {
    const parsed = updateAccountSchema.safeParse({ id, name })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id
    name = parsed.data.name

    const existing = await prisma.accounting_head.findUnique({ where: { id, user_id } })
    if (!existing) throw new ActionError('NOT_FOUND', 'account not found')

    // guard the post-update state, not just the argument — a type change away
    // from 'account' must not strand a live lock on a non-account head
    const effective_lock = lock_date === undefined ? existing.lock_date : lock_date
    if (effective_lock != null && (type ?? existing.type) !== 'account')
      throw new ActionError('VALIDATION', 'A lock date applies to accounts only — clear it before changing the type')

    if (parent_id) {
      if (parent_id === id) throw new ActionError('VALIDATION', 'parent cannot be the account itself')
      const p = await prisma.accounting_head.findUnique({
        where: { id: parent_id, user_id },
        select: { id: true, user_id: true, parent_id: true },
      })
      if (!p) throw new ActionError('VALIDATION', 'Invalid parent account')

      const all_accounts = await prisma.accounting_head.findMany({ where: { user_id }, select: { id: true, parent_id: true } })
      const parentMap = new Map(all_accounts.map(a => [a.id, a.parent_id]))

      let curr_parent_id: string | null = p.parent_id
      while (curr_parent_id) {
        if (curr_parent_id === id) throw new ActionError('VALIDATION', 'invalid parent: would create cycle')
        curr_parent_id = parentMap.get(curr_parent_id) ?? null
      }
    }

    let linked_update: string | null | undefined = undefined
    if (linked_user_id !== undefined) {
      linked_update = await resolve_linked_user(user_id, type ?? existing.type, linked_user_id ?? null, id)
      if (existing.linked_user_id && existing.linked_user_id !== linked_update) {
        const inUse = await prisma.transaction_link.findFirst({
          where: {
            OR: [
              { txn_a: { user_id, line_items: { some: { accounting_head_id: id } } } },
              { txn_b: { user_id, line_items: { some: { accounting_head_id: id } } } },
            ],
          },
          select: { id: true },
        })
        if (inUse) throw new ActionError('VALIDATION', 'Cannot change this account’s linked user while it has shared transactions')
      }
    }

    const newly_linked = linked_update != null && linked_update !== existing.linked_user_id

    const backfilled = await prisma.$transaction(
      async tx => {
        await tx.accounting_head.update({
          where: { id, user_id },
          data: {
            name,
            type,
            parent_id,
            ...(is_active !== undefined ? { is_active } : {}),
            ...(is_placeholder !== undefined ? { is_placeholder } : {}),
            ...(linked_update !== undefined ? { linked_user_id: linked_update } : {}),
            ...(lock_date !== undefined ? { lock_date } : {}),
          },
        })
        return newly_linked ? await backfill_links_for_account(tx, user_id, id, linked_update!) : 0
      },
      { timeout: 30_000 },
    )
    await invalidate_balances(user_id)
    if (newly_linked && backfilled > 0) void notify_request_pending(linked_update!, user_id)
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const deleteAccountSchema = z.object({ id: z.string().min(1, 'id is required') })

export async function delete_account_core(user_id: string, id: string): Promise<ActionResult> {
  try {
    const parsed = deleteAccountSchema.safeParse({ id })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id

    await prisma.accounting_head.delete({ where: { id, user_id } })
    await invalidate_balances(user_id)
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const createAssetSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty string').max(120, 'name is too long'),
  ticker: z.string().trim().min(1, 'ticker cannot be empty string').max(64, 'ticker is too long').nullish(),
})

export async function create_asset_core(
  name: string,
  type: asset_type,
  ticker?: string | null | undefined,
  parent_id?: string | null | undefined,
): Promise<ActionResult> {
  try {
    const parsed = createAssetSchema.safeParse({ name, ticker })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    name = parsed.data.name
    ticker = parsed.data.ticker

    if (type === 'etf' || type === 'mf' || type === 'shares') {
      if (!ticker || ticker.length === 0) throw new ActionError('VALIDATION', 'ticker is required for asset type ' + type)
      if (type === 'mf') {
        if ((await get_nav({ code: ticker })) === null) throw new ActionError('VALIDATION', 'invalid ticker for mutual fund: ' + ticker)
      } else if (type === 'etf' || type === 'shares') {
        if ((await get_latest_etf_or_shares_price(ticker)) === null) throw new ActionError('VALIDATION', 'invalid ticker for etf/shares: ' + ticker)
      }
    } else if (ticker !== undefined && ticker !== null) {
      throw new ActionError('VALIDATION', 'ticker cannot be non-null for asset type ' + type)
    }

    await prisma.asset.create({ data: { name, type, ticker, parent_id } })
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const updateAssetSchema = z.object({
  id: z.string().min(1, 'id is required'),
  name: z.string().trim().min(1, 'name cannot be empty string').max(120, 'name is too long').optional(),
  ticker: z.string().trim().min(1, 'ticker cannot be empty string').max(64, 'ticker is too long').nullish(),
})

export async function update_asset_core(
  id: string,
  name?: string | undefined,
  type?: asset_type | undefined,
  ticker?: string | null | undefined,
  parent_id?: string | null | undefined,
  is_active?: boolean | undefined,
  is_placeholder?: boolean | undefined,
): Promise<ActionResult> {
  try {
    const parsed = updateAssetSchema.safeParse({ id, name, ticker })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id
    name = parsed.data.name
    ticker = parsed.data.ticker

    const existing = await prisma.asset.findUnique({ where: { id } })
    if (!existing) throw new ActionError('NOT_FOUND', 'asset not found')

    if (parent_id) {
      if (parent_id === id) throw new ActionError('VALIDATION', 'parent cannot be the asset itself')
      const p = await prisma.asset.findUnique({ where: { id: parent_id }, select: { id: true, parent_id: true } })
      if (!p) throw new ActionError('VALIDATION', 'invalid parent asset')

      const all_assets = await prisma.asset.findMany({ select: { id: true, parent_id: true } })
      const parentMap = new Map(all_assets.map(a => [a.id, a.parent_id]))

      let curr_parent_id: string | null = p.parent_id
      while (curr_parent_id) {
        if (curr_parent_id === id) throw new ActionError('VALIDATION', 'invalid parent: would create cycle')
        curr_parent_id = parentMap.get(curr_parent_id) ?? null
      }
    }

    await prisma.$transaction(async prisma => {
      const asset = await prisma.asset.update({
        where: { id },
        data: {
          name,
          type,
          ticker,
          parent_id,
          ...(is_active !== undefined ? { is_active } : {}),
          ...(is_placeholder !== undefined ? { is_placeholder } : {}),
        },
      })
      if (type === 'etf' || type === 'mf' || type === 'shares') {
        if (!asset.ticker || asset.ticker.length === 0) throw new ActionError('VALIDATION', 'ticker is required for asset type ' + type)
        if (type === 'mf') {
          if ((await get_nav({ code: asset.ticker })) === null) throw new ActionError('VALIDATION', 'invalid ticker for mutual fund: ' + asset.ticker)
        } else if (type === 'etf' || type === 'shares') {
          if ((await get_latest_etf_or_shares_price(asset.ticker)) === null)
            throw new ActionError('VALIDATION', 'invalid ticker for etf/shares: ' + asset.ticker)
        }
      } else if (asset.ticker !== null) {
        throw new ActionError('VALIDATION', 'ticker cannot non-null for asset type ' + type)
      }
    })
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const deleteAssetSchema = z.object({ id: z.string().min(1, 'id is required') })

export async function delete_asset_core(id: string): Promise<ActionResult> {
  try {
    const parsed = deleteAssetSchema.safeParse({ id })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id

    await prisma.asset.delete({ where: { id } })
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const reorderSchema = z.object({ parent_id: z.string().nullable(), ordered_ids: z.array(z.string().min(1)).min(1) })

export async function reorder_heads_core(user_id: string, parent_id: string | null, ordered_ids: string[]): Promise<ActionResult> {
  try {
    const parsed = reorderSchema.safeParse({ parent_id, ordered_ids })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    const rows = await prisma.accounting_head.findMany({
      where: { id: { in: parsed.data.ordered_ids }, user_id, parent_id: parsed.data.parent_id },
      select: { id: true },
    })
    if (rows.length !== parsed.data.ordered_ids.length) {
      return err('VALIDATION', 'One or more items are not siblings under this parent or do not belong to you')
    }

    await prisma.$transaction(parsed.data.ordered_ids.map((id, i) => prisma.accounting_head.update({ where: { id }, data: { order_index: i } })))
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

export async function reorder_assets_core(parent_id: string | null, ordered_ids: string[]): Promise<ActionResult> {
  try {
    const parsed = reorderSchema.safeParse({ parent_id, ordered_ids })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    const rows = await prisma.asset.findMany({
      where: { id: { in: parsed.data.ordered_ids }, parent_id: parsed.data.parent_id },
      select: { id: true },
    })
    if (rows.length !== parsed.data.ordered_ids.length) {
      return err('VALIDATION', 'One or more items are not siblings under this parent')
    }

    await prisma.$transaction(parsed.data.ordered_ids.map((id, i) => prisma.asset.update({ where: { id }, data: { order_index: i } })))
    return ok()
  } catch (error) {
    return fromError(error)
  }
}
