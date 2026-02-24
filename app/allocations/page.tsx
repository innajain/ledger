import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_price_for_asset } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_line_item_book_value, get_line_item_qty } from '../_utils/validate_line_items'

// Route segment config for performance
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Allocations',
  description: 'View and manage your allocation accounts',
}

export default async function Page() {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Allocations</h1>
        <p>Please log in to view allocations.</p>
      </div>
    )
  }

  // fetch accounts with line_items and asset details
  const allocations = await prisma.account.findMany({
    where: { user_id: user.id, type: 'allocation' },
    include: {
      line_items: {
        include: {
          asset: true,
          account: true,
          transaction: {
            include: {
              line_items: { include: { account: true, asset: true, transaction: { include: { line_items: { include: { account: true } } } } } },
            },
          },
        },
      },
      parent: true,
    },
  })

  // Collect unique assets that need price fetching
  const uniqueAssets = new Map<string, { type: asset_type; ticker: string | null }>()
  for (const acc of allocations) {
    for (const li of acc.line_items) {
      const asset = li.asset
      if (asset.ticker && (asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares')) {
        const key = `${asset.type}:${asset.ticker}`
        if (!uniqueAssets.has(key)) {
          uniqueAssets.set(key, { type: asset.type, ticker: asset.ticker })
        }
      }
    }
  }

  // Fetch all prices in parallel
  const pricePromises = Array.from(uniqueAssets.entries()).map(async ([key, { type, ticker }]) => {
    const price = await get_price_for_asset(type, ticker)
    return { key, price }
  })

  const priceResults = await Promise.all(pricePromises)
  const priceCache = new Map<string, { price: number; date: Date }>()
  for (const { key, price } of priceResults) {
    if (price) priceCache.set(key, price)
  }

  const totalsByAccount: Record<string, number> = {}
  const assetQuantitiesByAccount: Record<string, Record<string, number>> = {}
  let grand_total = new Prisma.Decimal(0)

  for (const acc of allocations) {
    let acc_total = new Prisma.Decimal(0)
    const assetQtyMap: Record<string, Prisma.Decimal> = {}

    for (const li of acc.line_items) {
      const qty = get_line_item_qty(li)
      const asset = li.asset

      if (!assetQtyMap[asset.id]) {
        assetQtyMap[asset.id] = new Prisma.Decimal(0)
      }
      assetQtyMap[asset.id] = assetQtyMap[asset.id].add(qty)

      let current_value = new Prisma.Decimal(0)

      if (asset.type === asset_type.rupees) {
        current_value = qty
      } else if (asset.ticker && (asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares')) {
        const key = `${asset.type}:${asset.ticker}`
        const priceData = priceCache.get(key)
        if (priceData) {
          current_value = new Prisma.Decimal(priceData.price).mul(qty)
        } else {
          current_value = get_line_item_book_value(li)
        }
      } else {
        current_value = get_line_item_book_value(li)
      }

      acc_total = acc_total.add(current_value)
    }
    totalsByAccount[acc.id] = acc_total.toNumber()
    // Filter to only include non-zero quantities and convert to number
    assetQuantitiesByAccount[acc.id] = Object.fromEntries(
      Object.entries(assetQtyMap)
        .filter(([, qty]) => !qty.equals(0))
        .map(([assetId, qty]) => [assetId, qty.toNumber()]),
    )
    grand_total = grand_total.add(acc_total)
  }

  return (
    <ClientPage
      allocations={allocations.map(x => ({
        ...x,
        line_items: x.line_items.map(li => ({
          ...li,
          transaction: undefined,
          quantity: get_line_item_qty(li).toNumber(),
          book_value: undefined,
        })),
      }))}
      totals={totalsByAccount}
      assetQuantities={assetQuantitiesByAccount}
      grand_total={grand_total.toNumber()}
    />
  )
}
