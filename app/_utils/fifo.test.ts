import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { compute_fifo_remaining, type FifoEntry } from './fifo'

const d = (n: number) => new Prisma.Decimal(n)

const day = (n: number) => new Date(2024, 0, n)

const asNumbers = (m: Map<string, Prisma.Decimal>) => Object.fromEntries([...m].map(([k, v]) => [k, v.toNumber()]))

describe('compute_fifo_remaining', () => {
  it('leaves a lone buy fully open', () => {
    const entries: FifoEntry[] = [{ id: 'b1', group_key: 'A', qty: d(10), date: day(1) }]
    expect(asNumbers(compute_fifo_remaining(entries))).toEqual({ b1: 10 })
  })

  it('reduces the buy lot by a partial sell', () => {
    const entries: FifoEntry[] = [
      { id: 'b1', group_key: 'A', qty: d(10), date: day(1) },
      { id: 's1', group_key: 'A', qty: d(-4), date: day(2) },
    ]
    expect(asNumbers(compute_fifo_remaining(entries))).toEqual({ b1: 6 })
  })

  it('zeroes a lot fully consumed by a sell', () => {
    const entries: FifoEntry[] = [
      { id: 'b1', group_key: 'A', qty: d(10), date: day(1) },
      { id: 's1', group_key: 'A', qty: d(-10), date: day(2) },
    ]
    expect(asNumbers(compute_fifo_remaining(entries))).toEqual({ b1: 0 })
  })

  it('consumes oldest lots first (FIFO) across multiple buys', () => {
    const entries: FifoEntry[] = [
      { id: 'b1', group_key: 'A', qty: d(10), date: day(1) },
      { id: 'b2', group_key: 'A', qty: d(10), date: day(2) },
      { id: 's1', group_key: 'A', qty: d(-15), date: day(3) },
    ]
    expect(asNumbers(compute_fifo_remaining(entries))).toEqual({ b1: 0, b2: 5 })
  })

  it('over-selling beyond holdings empties every lot (excess ignored)', () => {
    const entries: FifoEntry[] = [
      { id: 'b1', group_key: 'A', qty: d(5), date: day(1) },
      { id: 's1', group_key: 'A', qty: d(-8), date: day(2) },
    ]
    expect(asNumbers(compute_fifo_remaining(entries))).toEqual({ b1: 0 })
  })

  it('tracks groups independently', () => {
    const entries: FifoEntry[] = [
      { id: 'a1', group_key: 'A', qty: d(10), date: day(1) },
      { id: 'b1', group_key: 'B', qty: d(10), date: day(1) },
      { id: 'aSell', group_key: 'A', qty: d(-7), date: day(2) },
    ]
    expect(asNumbers(compute_fifo_remaining(entries))).toEqual({ a1: 3, b1: 10 })
  })

  it('processes a buy before a sell that share the same instant', () => {
    const t = day(1)
    const entries: FifoEntry[] = [
      { id: 's1', group_key: 'A', qty: d(-6), date: t },
      { id: 'b1', group_key: 'A', qty: d(10), date: t },
    ]

    expect(asNumbers(compute_fifo_remaining(entries))).toEqual({ b1: 4 })
  })

  it('applies multiple sells cumulatively across lots', () => {
    const entries: FifoEntry[] = [
      { id: 'b1', group_key: 'A', qty: d(10), date: day(1) },
      { id: 'b2', group_key: 'A', qty: d(5), date: day(2) },
      { id: 's1', group_key: 'A', qty: d(-3), date: day(3) },
      { id: 's2', group_key: 'A', qty: d(-9), date: day(4) },
    ]

    expect(asNumbers(compute_fifo_remaining(entries))).toEqual({ b1: 0, b2: 3 })
  })
})
