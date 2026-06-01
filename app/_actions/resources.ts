'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { get_current_user_id, require_admin } from '@/app/_actions/auth'
import type { accounting_head_type, asset_type } from '@/generated/prisma/client'
import { get_latest_etf_or_shares_price, get_nav } from '../_utils/price_fetcher'
import { invalidate_balances } from './compute_balances'
import { backfill_links_for_account } from '../_utils/links'
import { notify_request_pending } from '../_utils/notify_events'
import { ActionResult, ok, err, fromError } from './_result'

// Validate and normalize a cross-user account link. Returns the linked user id
// to store (or null to clear), or throws with a user-facing message.
// `current_head_id` excludes the head being edited from the one-link-per-user check.
async function resolve_linked_user(
  user_id: string,
  type: accounting_head_type | undefined,
  linked_user_id: string | null,
  current_head_id: string | null,
): Promise<string | null> {
  if (!linked_user_id) return null
  if (type !== 'account') throw new Error('Only real-account heads can be linked to another user')
  if (linked_user_id === user_id) throw new Error('You cannot link an account to yourself')
  const target = await prisma.user.findUnique({ where: { id: linked_user_id }, select: { id: true } })
  if (!target) throw new Error('Linked user not found')
  const dupe = await prisma.accounting_head.findFirst({
    where: { user_id, linked_user_id, ...(current_head_id ? { id: { not: current_head_id } } : {}) },
    select: { id: true },
  })
  if (dupe) throw new Error('You already have an account linked to this user')
  return linked_user_id
}

const findUserSchema = z.object({ username: z.string().trim().min(1, 'username is required') })

// Resolve a username to a user id for the "link account to another user" picker.
// Returns only id + username — no other PII crosses the boundary.
export async function find_user_by_username(username: string): Promise<ActionResult<{ id: string; username: string }>> {
  try {
    const parsed = findUserSchema.safeParse({ username })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')
    const user = await prisma.user.findUnique({ where: { username: parsed.data.username }, select: { id: true, username: true } })
    if (!user) return err('NOT_FOUND', 'No user with that username')
    if (user.id === me) return err('VALIDATION', 'That is your own account')
    return ok(user)
  } catch (error) {
    return fromError(error)
  }
}

const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be empty string'),
  // Empty / whitespace-only treated as null so the column stays NULL rather
  // than an empty string (clearer downstream "is the UPI ID set?" checks).
  upi_id: z
    .string()
    .trim()
    .transform(v => (v === '' ? null : v))
    .nullish(),
})

export async function create_account(
  name: string,
  type: accounting_head_type,
  parent_id?: string | null,
  upi_id?: string | null,
  linked_user_id?: string | null,
): Promise<ActionResult> {
  try {
    const parsed = createAccountSchema.safeParse({ name, upi_id })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    name = parsed.data.name
    const normalized_upi_id = parsed.data.upi_id ?? null

    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'unauthorized')

    const linked = await resolve_linked_user(user_id, type, linked_user_id ?? null, null)

    await prisma.accounting_head.create({
      data: { name, type, user_id, parent_id, upi_id: normalized_upi_id, linked_user_id: linked },
    })
    await invalidate_balances(user_id)
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const updateAccountSchema = z.object({
  id: z.string().min(1, 'id is required'),
  name: z.string().trim().min(1, 'name cannot be empty string').optional(),
  // Same empty-to-null handling as create.
  upi_id: z
    .string()
    .trim()
    .transform(v => (v === '' ? null : v))
    .nullish(),
})

export async function update_account(
  id: string,
  name?: string | undefined,
  type?: accounting_head_type | undefined,
  parent_id?: string | null | undefined,
  is_active?: boolean | undefined,
  is_placeholder?: boolean | undefined,
  upi_id?: string | null | undefined,
  linked_user_id?: string | null | undefined,
): Promise<ActionResult> {
  try {
    const parsed = updateAccountSchema.safeParse({ id, name, upi_id })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id
    name = parsed.data.name
    // Treat `undefined` (caller didn't pass the arg) as "don't change", but
    // an explicit empty string from the form clears the field via the
    // schema's transform → null.
    const upi_update = upi_id === undefined ? undefined : (parsed.data.upi_id ?? null)

    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'unauthorized')

    const existing = await prisma.accounting_head.findUnique({
      where: { id, user_id },
    })
    if (!existing) throw new Error('account not found')

    // If parent_id provided, validate
    if (parent_id) {
      if (parent_id === id) throw new Error('parent cannot be the account itself')
      // ensure parent exists and belongs to user
      const p = await prisma.accounting_head.findUnique({
        where: { id: parent_id, user_id },
        select: { id: true, user_id: true, parent_id: true },
      })
      if (!p) throw new Error('invalid parent account')

      const all_accounts = await prisma.accounting_head.findMany({
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

    // Cross-user link change. Block changing/clearing a link that already has
    // shared transactions (would orphan their approval links).
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
        if (inUse) throw new Error('Cannot change this account’s linked user while it has shared transactions')
      }
    }

    // Newly linking an existing account retroactively turns its transactions
    // into pending requests for the counterparty.
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
            ...(upi_update !== undefined ? { upi_id: upi_update } : {}),
            ...(linked_update !== undefined ? { linked_user_id: linked_update } : {}),
          },
        })
        return newly_linked ? await backfill_links_for_account(tx, user_id, id, linked_update!) : 0
      },
      { timeout: 30_000 },
    )
    await invalidate_balances(user_id)
    // Linking retroactively opened approval requests for the counterparty — ping them once.
    if (newly_linked && backfilled > 0) void notify_request_pending(linked_update!, user_id)
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const deleteAccountSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function delete_account(id: string): Promise<ActionResult> {
  try {
    const parsed = deleteAccountSchema.safeParse({ id })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id

    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'unauthorized')

    await prisma.accounting_head.delete({ where: { id, user_id } })
    await invalidate_balances(user_id)
    return ok()
  } catch (error) {
    return fromError(error)
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
): Promise<ActionResult> {
  try {
    const parsed = createAssetSchema.safeParse({ name, ticker })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
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

    await require_admin()

    await prisma.asset.create({
      data: { name, type, ticker, parent_id },
    })
    return ok()
  } catch (error) {
    return fromError(error)
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
  is_active?: boolean | undefined,
  is_placeholder?: boolean | undefined,
): Promise<ActionResult> {
  try {
    const parsed = updateAssetSchema.safeParse({ id, name, ticker })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id
    name = parsed.data.name
    ticker = parsed.data.ticker

    await require_admin()

    const existing = await prisma.asset.findUnique({
      where: { id },
    })
    if (!existing) throw new Error('asset not found')

    if (parent_id) {
      if (parent_id === id) throw new Error('parent cannot be the asset itself')
      const p = await prisma.asset.findUnique({
        where: { id: parent_id },
        select: { id: true, parent_id: true },
      })
      if (!p) throw new Error('invalid parent asset')

      const all_assets = await prisma.asset.findMany({
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
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const deleteAssetSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function delete_asset(id: string): Promise<ActionResult> {
  try {
    const parsed = deleteAssetSchema.safeParse({ id })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id

    await require_admin()

    await prisma.asset.delete({ where: { id } })
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const updateHierarchyOrderSchema = z.object({
  scope: z.enum(['account', 'asset']),
  parent_id: z.string().nullable(),
  ordered_ids: z.array(z.string().min(1)).min(1),
})

export async function update_hierarchy_order(input: {
  scope: 'account' | 'asset'
  parent_id: string | null
  ordered_ids: string[]
}): Promise<ActionResult> {
  try {
    const parsed = updateHierarchyOrderSchema.safeParse(input)
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    const { scope, parent_id, ordered_ids } = parsed.data

    // Verify all rows are siblings under the same parent. Accounts are
    // user-scoped; assets are global and admin-managed.
    if (scope === 'account') {
      const user_id = await get_current_user_id()
      if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
      const rows = await prisma.accounting_head.findMany({
        where: { id: { in: ordered_ids }, user_id, parent_id },
        select: { id: true },
      })
      if (rows.length !== ordered_ids.length) {
        return err('VALIDATION', 'One or more items are not siblings under this parent or do not belong to you')
      }
    } else {
      await require_admin()
      const rows = await prisma.asset.findMany({
        where: { id: { in: ordered_ids }, parent_id },
        select: { id: true },
      })
      if (rows.length !== ordered_ids.length) {
        return err('VALIDATION', 'One or more items are not siblings under this parent')
      }
    }

    // Reassign order_index sequentially. Wrap in a transaction so partial
    // failures don't leave the ordering inconsistent.
    await prisma.$transaction(
      ordered_ids.map((id, i) =>
        scope === 'account'
          ? prisma.accounting_head.update({ where: { id }, data: { order_index: i } })
          : prisma.asset.update({ where: { id }, data: { order_index: i } }),
      ),
    )
    return ok()
  } catch (error) {
    return fromError(error)
  }
}
