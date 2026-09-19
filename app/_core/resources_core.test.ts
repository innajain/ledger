import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    accounting_head: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/app/_utils/price_fetcher', () => ({ get_latest_etf_or_shares_price: vi.fn(), get_nav: vi.fn() }))
vi.mock('@/app/_core/balances_core', () => ({ invalidate_balances: vi.fn() }))
vi.mock('@/app/_utils/links', () => ({ backfill_links_for_account: vi.fn() }))
vi.mock('@/app/_utils/notify_events', () => ({ notify_request_pending: vi.fn() }))
vi.mock('@/lib/logger', () => ({ audit: vi.fn(), logger: { error: vi.fn() } }))

const { prisma } = await import('@/lib/prisma')
const { invalidate_balances } = await import('./balances_core')
const { update_account_core } = await import('./resources_core')

const update = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async callback => {
    const result = await (callback as (tx: unknown) => Promise<unknown>)({ accounting_head: { update } })
    // Invalidation must wait until the write commits.
    expect(invalidate_balances).not.toHaveBeenCalled()
    return result
  })
})

function mock_head(parent_id: string | null, type: 'account' | 'allocation' | 'income_expense' = 'account') {
  vi.mocked(prisma.accounting_head.findUnique).mockResolvedValueOnce({
    id: 'demat',
    user_id: 'owner',
    parent_id,
    type,
    lock_date: null,
    tax_treatment: null,
    linked_user_id: null,
  } as Awaited<ReturnType<typeof prisma.accounting_head.findUnique>>)
  vi.mocked(prisma.accounting_head.findUnique).mockResolvedValue({
    id: 'zerodha',
    user_id: 'owner',
    parent_id: null,
  } as Awaited<ReturnType<typeof prisma.accounting_head.findUnique>>)
  vi.mocked(prisma.accounting_head.findMany).mockResolvedValue([])
}

describe('update_account_core cache invalidation', () => {
  it.each(['account', 'allocation', 'income_expense'] as const)('invalidates old and new ancestor series when reparenting a %s', async type => {
    mock_head('groww', type)

    expect(await update_account_core('owner', 'demat', undefined, undefined, 'zerodha')).toEqual({ success: true })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'demat', user_id: 'owner' } }))
    // A full-user flush also covers the old ancestors, which a climb from demat would miss.
    expect(vi.mocked(invalidate_balances).mock.calls).toEqual([['owner']])
  })

  it.each([
    { from: 'groww', to: null },
    { from: null, to: 'zerodha' },
  ])('invalidates when changing parent from $from to $to', async ({ from, to }) => {
    mock_head(from)

    expect(await update_account_core('owner', 'demat', undefined, undefined, to)).toEqual({ success: true })
    expect(vi.mocked(invalidate_balances).mock.calls).toEqual([['owner']])
  })

  it.each([
    { from: 'zerodha', to: 'zerodha' },
    { from: null, to: null },
    { from: 'groww', to: undefined },
  ])('preserves caches on a rename with unchanged parent ($from → $to)', async ({ from, to }) => {
    mock_head(from)

    expect(await update_account_core('owner', 'demat', 'Renamed', undefined, to)).toEqual({ success: true })
    expect(invalidate_balances).not.toHaveBeenCalled()
  })

  it('still invalidates on a type change', async () => {
    mock_head('groww')

    expect(await update_account_core('owner', 'demat', undefined, 'allocation')).toEqual({ success: true })
    expect(vi.mocked(invalidate_balances).mock.calls).toEqual([['owner']])
  })

  it('does not invalidate when the write fails', async () => {
    mock_head('groww')
    update.mockRejectedValueOnce(new Error('write failed'))

    expect(await update_account_core('owner', 'demat', undefined, undefined, 'zerodha')).toMatchObject({ success: false })
    expect(invalidate_balances).not.toHaveBeenCalled()
  })
})
