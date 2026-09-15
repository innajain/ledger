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

export function isExpectedActionError(error: unknown, fallback: ActionErrorCode = 'SERVER'): boolean {
  if (error instanceof ActionError || error instanceof z.ZodError) return true
  if (fallback !== 'SERVER') return true
  return EXPECTED_PRISMA_CODES.has(String(errorCode(error)))
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown non-Error exception')
}

export function reportUnexpectedError(error: unknown, context: ErrorContext): void {
  logger.error({ err: asError(error), event: 'operation.failed', ...context }, `${context.action} failed`)
}

export function reportActionError(error: unknown, context: ErrorContext, fallback: ActionErrorCode = 'SERVER'): ActionResult<never> {
  if (!isExpectedActionError(error, fallback)) reportUnexpectedError(error, context)
  return fromError(error, fallback)
}
