import { describe, it, expect } from 'vitest'
import { ok, err, fromError, ActionError } from './_result'

describe('ok / err', () => {
  it('builds a success result with data and message', () => {
    expect(ok({ a: 1 }, 'done')).toEqual({ success: true, data: { a: 1 }, message: 'done' })
  })

  it('omits data/message when not provided', () => {
    expect(ok()).toEqual({ success: true })
  })

  it('builds a typed error result', () => {
    expect(err('VALIDATION', 'bad')).toEqual({ success: false, code: 'VALIDATION', message: 'bad' })
  })
})

describe('fromError', () => {
  it('preserves the code carried by an ActionError', () => {
    expect(fromError(new ActionError('NOT_FOUND', 'missing'))).toEqual({ success: false, code: 'NOT_FOUND', message: 'missing' })
  })

  it('maps Prisma P2002 (unique violation) to VALIDATION', () => {
    expect(fromError({ code: 'P2002' })).toEqual({ success: false, code: 'VALIDATION', message: 'A record with this name already exists' })
  })

  it('maps Prisma P2025 (not found) to NOT_FOUND', () => {
    expect(fromError({ code: 'P2025' })).toEqual({ success: false, code: 'NOT_FOUND', message: 'Record not found' })
  })

  it('defaults an unknown Error to SERVER, preserving the message', () => {
    expect(fromError(new Error('boom'))).toEqual({ success: false, code: 'SERVER', message: 'boom' })
  })

  it('honors the fallback code for plain errors', () => {
    expect(fromError(new Error('boom'), 'VALIDATION')).toEqual({ success: false, code: 'VALIDATION', message: 'boom' })
  })
})
