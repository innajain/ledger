'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { get_price_for_asset } from '@/app/_utils/price_fetcher'
import { line_item_page } from '@/app/_utils/line_item_paging'
import { ActionResult, ok, err } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'
import type { AssetLineItem } from './ClientPage'
import { build_asset_line_items, fetch_asset_transactions } from './asset_line_items'

// The next page of an asset's line items, for the page's "Show more" button. Only the
// caller's own transactions are read, as on the page itself.
export async function get_more_asset_line_items(asset_id: string, offset: number): Promise<ActionResult<AssetLineItem[]>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    if (line_item_page([], offset) === null) return err('VALIDATION', 'Invalid offset')
    const asset = await prisma.asset.findUnique({ where: { id: asset_id }, select: { id: true, type: true, ticker: true } })
    if (!asset) return err('NOT_FOUND', 'Asset not found')

    const [rawTransactions, priceResp] = await Promise.all([
      fetch_asset_transactions(user_id, asset.id),
      get_price_for_asset(asset.type, asset.ticker ?? null),
    ])
    const { line_items } = build_asset_line_items(asset, rawTransactions, priceResp ? new Prisma.Decimal(priceResp.price) : null)
    return ok(line_item_page(line_items, offset)!)
  } catch (error) {
    return reportActionError(error, { action: 'get_more_asset_line_items', entity: 'asset' })
  }
}
