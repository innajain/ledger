import 'server-only'
import { z } from 'zod'
import { ActionError, fromError, type ActionErrorCode, type ActionResult } from '@/app/_actions/_result'
import { logger } from '@/lib/logger'

type ErrorContext = {
  action: string
  route?: string
  entity?: string
}

const EXPECTED_PRISMA_CODES = new Set(['P2002', 'P2003', 'P2025'])

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : undefined
}

// Classified on the error itself, never on the caller's fallback code: a caller
// passing fallback: 'VALIDATION' is saying how to render an unknown failure, not
// asserting that every failure it sees is expected.
export function isExpectedActionError(error: unknown): boolean {
  if (error instanceof ActionError || error instanceof z.ZodError) return true
  return EXPECTED_PRISMA_CODES.has(String(errorCode(error)))
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown non-Error exception')
}

export function reportUnexpectedError(error: unknown, context: ErrorContext): void {
  logger.error({ err: asError(error), event: 'operation.failed', ...context }, `${context.action} failed`)
}

export function reportActionError(error: unknown, context: ErrorContext, fallback: ActionErrorCode = 'SERVER'): ActionResult<never> {
  if (!isExpectedActionError(error)) reportUnexpectedError(error, context)
  return fromError(error, fallback)
}
