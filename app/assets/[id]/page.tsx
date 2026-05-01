import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_price_for_asset } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import ClientPage from './ClientPage'
import { get_line_item_book_value, get_line_item_qty } from '@/app/_utils/validate_line_items'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'

type Props = { params: Promise<{ id: string }> }

export default async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Asset</h1>
        <p>Please log in to view this asset.</p>
      </div>
    )
  }

  const asset = await prisma.asset.findUnique({
    where: { id, user_id: user.id },
    include: {
      line_items: {
        include: {
          account: true,
          asset: true,
          transaction: {
            include: {
              line_items: {
                include: {
                  account: true,
                  asset: true,
                  transaction: {
                    include: { line_items: { include: { account: true } } },
                  },
                },
              },
            },
          },
        },
      },
      parent: true,
    },
  })

  if (!asset) {
    return (
      <div>
        <h1>Asset</h1>
        <p>Asset not found.</p>
      </div>
    )
  }

  // compute total across real accounts and aggregate holdings by account
  let asset_total = new Prisma.Decimal(0)
  const breakdown: {
    account_id: string
    account_name: string
    quantity: number
    book_value: number | null
    current_value: number
  }[] = []

  const real_line_items = asset.line_items.filter(li => li.account.type === 'real')

  // attempt to fetch a price once for the asset (used for all line items)
  const priceResp = await get_price_for_asset(asset.type, asset.ticker ?? null)
  const priceDecimal = priceResp ? new Prisma.Decimal(priceResp.price) : null

  // aggregate per-account
  const map: Record<
    string,
    {
      account_id: string
      account_name: string
      total_qty: Prisma.Decimal
      total_book: Prisma.Decimal
    }
  > = {}
  for (const li of real_line_items) {
    const qty = get_line_item_qty(li)
    const book = get_line_item_book_value(li)
    const aid = li.account.id
    if (!map[aid]) {
      map[aid] = {
        account_id: aid,
        account_name: li.account.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
      }
    }
    map[aid].total_qty = map[aid].total_qty.add(qty)
    map[aid].total_book = map[aid].total_book.add(book)
  }

  for (const k of Object.keys(map)) {
    const entry = map[k]

    let current_value = new Prisma.Decimal(0)
    if (asset.type === asset_type.rupees) {
      current_value = entry.total_qty
    } else if (priceDecimal) {
      current_value = priceDecimal.mul(entry.total_qty)
    } else {
      current_value = entry.total_book
    }

    // Skip if current_value is zero
    if (current_value.equals(0)) continue

    asset_total = asset_total.add(current_value)

    breakdown.push({
      account_id: entry.account_id,
      account_name: entry.account_name,
      quantity: entry.total_qty.toNumber(),
      book_value: entry.total_book.toNumber(),
      current_value: current_value.toNumber(),
    })
  }

  // prepare per-line items for client (keep transaction-level detail)
  const line_items = real_line_items
    .map(li => {
      let current_value = new Prisma.Decimal(0)
      if (asset.type === asset_type.rupees) {
        current_value = get_line_item_qty(li)
      } else if (priceDecimal) {
        current_value = priceDecimal.mul(get_line_item_qty(li))
      } else {
        // fallback to book value, which itself should be treated as qty when null
        current_value = get_line_item_book_value(li)
      }

      return {
        id: li.id,
        account_id: li.account.id,
        account_name: li.account.name,
        quantity: get_line_item_qty(li).toNumber(),
        // fallback to quantity when book_value is null
        book_value: get_line_item_book_value(li).toNumber(),
        current_value: current_value.toNumber(),
        transaction_id: li.transaction.id,
        transaction_date: li.datetime ? li.datetime.toISOString() : li.transaction.datetime.toISOString(),
        transaction_description: li.transaction.description,
        line_item_description: li.description,
        _sortDate: li.datetime ?? li.transaction.datetime,
      }
    })
    .sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime())
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ _sortDate, ...rest }) => rest)

  let xirr_value: number | null = null
  if (asset.type !== asset_type.rupees && real_line_items.length > 0) {
    const cashflows = real_line_items.map(li => {
      const bv = get_line_item_book_value(li)
      return {
        amount: -bv.toNumber(),
        when: li.datetime ?? li.transaction.datetime,
      }
    })

    if (!asset_total.equals(0)) {
      cashflows.push({
        amount: asset_total.toNumber(),
        when: new Date(),
      })
    }
    console.log('Cashflows for XIRR calculation:', cashflows)
    xirr_value = calculate_xirr(cashflows)
  }

  const assetForClient = {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    ticker: asset.ticker,
    parent: asset.parent ? { id: asset.parent.id, name: asset.parent.name } : null,
    total: asset_total.toNumber(),
    price: priceDecimal ? priceDecimal.toNumber() : null,
    xirr: xirr_value,
    breakdown,
    line_items,
  }
  return <ClientPage asset={assetForClient} />
}
