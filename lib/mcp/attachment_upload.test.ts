import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// An in-memory stand-in for the one table this module touches, so the token
// lifecycle (single use, expiry, release-on-failure, concurrent claims) is
// covered without a database — CI reaches none.
type Row = {
  id: string
  token_hash: string
  user_id: string
  transaction_id: string
  filename: string
  content_type: string
  expires_at: Date
  consumed_at: Date | null
}

let rows: Row[] = []
let next_id = 0

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mcp_attachment_upload: {
      create: async ({ data }: { data: Omit<Row, 'id' | 'consumed_at'> }) => {
        const row: Row = { ...data, id: `up_${++next_id}`, consumed_at: null }
        rows.push(row)
        return row
      },
      findUnique: async ({ where }: { where: { token_hash: string } }) => rows.find(r => r.token_hash === where.token_hash) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; consumed_at?: null }; data: { consumed_at: Date | null } }) => {
        const matched = rows.filter(r => r.id === where.id && (!('consumed_at' in where) || r.consumed_at === null))
        for (const r of matched) r.consumed_at = data.consumed_at
        return { count: matched.length }
      },
    },
  },
}))

const { create_upload_grant, claim_upload_grant, release_upload_grant, UPLOAD_TOKEN_TTL_MS } = await import('./attachment_upload')

const GRANT = { user_id: 'u1', transaction_id: 't1', filename: 'note.pdf', content_type: 'application/pdf' }

beforeEach(() => {
  rows = []
  next_id = 0
  vi.useRealTimers()
})

describe('create_upload_grant', () => {
  it('stores the token hashed, never in the clear', async () => {
    const { token } = await create_upload_grant(GRANT)
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).not.toBe(token)
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('mints a distinct token each time', async () => {
    const a = await create_upload_grant(GRANT)
    const b = await create_upload_grant(GRANT)
    expect(a.token).not.toBe(b.token)
  })

  it('binds the grant to one user and transaction', async () => {
    await create_upload_grant(GRANT)
    expect(rows[0]).toMatchObject({ user_id: 'u1', transaction_id: 't1', content_type: 'application/pdf' })
  })

  it('expires within the advertised TTL', async () => {
    const before = Date.now()
    const { expires_at } = await create_upload_grant(GRANT)
    expect(expires_at.getTime()).toBeGreaterThanOrEqual(before + UPLOAD_TOKEN_TTL_MS - 50)
    expect(expires_at.getTime()).toBeLessThanOrEqual(Date.now() + UPLOAD_TOKEN_TTL_MS)
  })
})

describe('claim_upload_grant', () => {
  it('returns the bound grant for a fresh token', async () => {
    const { token } = await create_upload_grant(GRANT)
    const res = await claim_upload_grant(token)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.grant).toMatchObject({ user_id: 'u1', transaction_id: 't1', filename: 'note.pdf' })
  })

  it('refuses an unknown token', async () => {
    const res = await claim_upload_grant('never-issued')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Unknown or already used/)
  })

  it('is single use', async () => {
    const { token } = await create_upload_grant(GRANT)
    expect((await claim_upload_grant(token)).ok).toBe(true)
    const second = await claim_upload_grant(token)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toMatch(/already been used/)
  })

  it('refuses an expired token', async () => {
    const { token } = await create_upload_grant(GRANT)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + UPLOAD_TOKEN_TTL_MS + 1000))
    const res = await claim_upload_grant(token)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/expired/)
  })

  it('lets exactly one of two concurrent claims win', async () => {
    const { token } = await create_upload_grant(GRANT)
    const [a, b] = await Promise.all([claim_upload_grant(token), claim_upload_grant(token)])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
  })
})

describe('release_upload_grant', () => {
  it('makes a claimed-but-failed upload retryable with the same URL', async () => {
    const { token } = await create_upload_grant(GRANT)
    const first = await claim_upload_grant(token)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    // e.g. the bytes failed verification, or blob storage errored
    await release_upload_grant(first.grant.id)

    const retry = await claim_upload_grant(token)
    expect(retry.ok).toBe(true)
  })

  it('does not resurrect an expired grant', async () => {
    const { token } = await create_upload_grant(GRANT)
    const first = await claim_upload_grant(token)
    if (!first.ok) throw new Error('setup failed')
    await release_upload_grant(first.grant.id)

    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + UPLOAD_TOKEN_TTL_MS + 1000))
    const res = await claim_upload_grant(token)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/expired/)
  })
})
