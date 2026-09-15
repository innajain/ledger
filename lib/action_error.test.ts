import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { ActionError } from '@/app/_actions/_result'

vi.mock('server-only', () => ({}))

const error_log = vi.fn()
vi.mock('@/lib/logger', () => ({ logger: { error: (...args: unknown[]) => error_log(...args) } }))

const { isExpectedActionError, reportActionError, reportUnexpectedError } = await import('./action_error')

beforeEach(() => error_log.mockClear())

describe('isExpectedActionError', () => {
  it('treats ActionError as expected control flow', () => {
    expect(isExpectedActionError(new ActionError('NOT_FOUND', 'missing'))).toBe(true)
  })

  it('treats a Zod failure as expected control flow', () => {
    const parsed = z.object({ a: z.string() }).safeParse({})
    expect(isExpectedActionError(parsed.error)).toBe(true)
  })

  it.each(['P2002', 'P2003', 'P2025'])('treats Prisma %s as expected', code => {
    expect(isExpectedActionError({ code })).toBe(true)
  })

  it('treats an unmapped Prisma code as unexpected', () => {
    expect(isExpectedActionError({ code: 'P1001' })).toBe(false)
  })

  it('treats a plain Error as unexpected', () => {
    expect(isExpectedActionError(new Error('boom'))).toBe(false)
  })

  it('treats a non-Error throw as unexpected', () => {
    expect(isExpectedActionError('boom')).toBe(false)
  })
})

describe('reportActionError', () => {
  it('maps an ActionError without logging it', () => {
    const res = reportActionError(new ActionError('NOT_FOUND', 'missing'), { action: 'a.b' })
    expect(res).toEqual({ success: false, code: 'NOT_FOUND', message: 'missing' })
    expect(error_log).not.toHaveBeenCalled()
  })

  it('maps a Prisma unique violation without logging it', () => {
    const res = reportActionError({ code: 'P2002' }, { action: 'a.b' })
    expect(res).toEqual({ success: false, code: 'VALIDATION', message: 'A record with this name already exists' })
    expect(error_log).not.toHaveBeenCalled()
  })

  it('logs an unexpected failure exactly once', () => {
    const res = reportActionError(new Error('boom'), { action: 'a.b', entity: 'txn' })
    expect(res).toEqual({ success: false, code: 'SERVER', message: 'boom' })
    expect(error_log).toHaveBeenCalledTimes(1)
  })

  // Regression: a non-SERVER fallback says how to render an unknown failure, it
  // does not assert the failure was expected. It must not suppress reporting.
  it('still reports an unexpected failure when the fallback is not SERVER', () => {
    const res = reportActionError(new Error('boom'), { action: 'a.b' }, 'VALIDATION')
    expect(res).toEqual({ success: false, code: 'VALIDATION', message: 'boom' })
    expect(error_log).toHaveBeenCalledTimes(1)
  })

  it('does not report an ActionError even when the fallback is not SERVER', () => {
    reportActionError(new ActionError('VALIDATION', 'bad input'), { action: 'a.b' }, 'VALIDATION')
    expect(error_log).not.toHaveBeenCalled()
  })
})

describe('reportUnexpectedError', () => {
  it('wraps a non-Error throw so the logger always receives an Error', () => {
    reportUnexpectedError('boom', { action: 'a.b' })
    const [payload] = error_log.mock.calls[0] as [{ err: Error; event: string; action: string }]
    expect(payload.err).toBeInstanceOf(Error)
    expect(payload.event).toBe('operation.failed')
    expect(payload.action).toBe('a.b')
  })
})
