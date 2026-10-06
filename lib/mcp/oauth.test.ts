import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

const { classify_refresh } = await import('./oauth')

const NOW = Date.parse('2026-10-06T00:00:00Z')
const live = { revoked: false, client_id: 'c1', refresh_expires_at: new Date(NOW + 1000) }

describe('classify_refresh', () => {
  it('accepts a live, unrevoked token for its own client', () => {
    expect(classify_refresh(live, 'c1', NOW)).toBe('ok')
  })

  it('treats an unknown token as invalid', () => {
    expect(classify_refresh(null, 'c1', NOW)).toBe('invalid')
  })

  it('treats another client presenting the token as invalid, not reuse', () => {
    expect(classify_refresh({ ...live, revoked: true }, 'c2', NOW)).toBe('invalid')
  })

  it('flags a second use of an already-rotated token as reuse', () => {
    expect(classify_refresh({ ...live, revoked: true }, 'c1', NOW)).toBe('reused')
  })

  it('flags reuse even after the refresh window has lapsed', () => {
    expect(classify_refresh({ ...live, revoked: true, refresh_expires_at: new Date(NOW - 1) }, 'c1', NOW)).toBe('reused')
  })

  it('rejects an expired refresh token', () => {
    expect(classify_refresh({ ...live, refresh_expires_at: new Date(NOW - 1) }, 'c1', NOW)).toBe('invalid')
  })

  it('accepts a token with no refresh expiry', () => {
    expect(classify_refresh({ ...live, refresh_expires_at: null }, 'c1', NOW)).toBe('ok')
  })
})
