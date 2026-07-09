import { Prisma } from '@/generated/prisma/client'

export type FifoEntry = {
  id: string
  group_key: string
  qty: Prisma.Decimal
  date: Date
}

export function compute_fifo_remaining(entries: FifoEntry[]): Map<string, Prisma.Decimal> {
  const remaining_by_id = new Map<string, Prisma.Decimal>()
  const chrono = [...entries].sort((a, b) => {
    const cmp = a.date.getTime() - b.date.getTime()
    if (cmp !== 0) return cmp

    return b.qty.comparedTo(a.qty)
  })
  const open_lots = new Map<string, { id: string; remaining: Prisma.Decimal }[]>()
  for (const item of chrono) {
    if (!open_lots.has(item.group_key)) open_lots.set(item.group_key, [])
    const lots = open_lots.get(item.group_key)!
    if (item.qty.greaterThan(0)) {
      lots.push({ id: item.id, remaining: item.qty })
      remaining_by_id.set(item.id, item.qty)
    } else if (item.qty.lessThan(0)) {
      let to_consume = item.qty.neg()
      while (to_consume.greaterThan(0) && lots.length > 0) {
        const lot = lots[0]
        if (lot.remaining.lessThanOrEqualTo(to_consume)) {
          to_consume = to_consume.sub(lot.remaining)
          remaining_by_id.set(lot.id, new Prisma.Decimal(0))
          lots.shift()
        } else {
          lot.remaining = lot.remaining.sub(to_consume)
          remaining_by_id.set(lot.id, lot.remaining)
          to_consume = new Prisma.Decimal(0)
        }
      }
    }
  }
  return remaining_by_id
}
