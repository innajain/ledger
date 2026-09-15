import 'server-only'
import { createHash } from 'node:crypto'
import pino from 'pino'
import * as Sentry from '@sentry/nextjs'
import { isDev } from './env'
import { currentMetrics } from './metrics/context'

function correlationBindings(): Record<string, string> {
  const bindings: Record<string, string> = {}
  const metrics = currentMetrics()
  if (metrics) {
    bindings.request_id = metrics.request_id
    bindings.route = metrics.route
  }

  const span = Sentry.getActiveSpan()
  if (span) {
    const trace = Sentry.spanToJSON(span)
    bindings.trace_id = trace.trace_id
    bindings.span_id = trace.span_id
  }
  return bindings
}

export const logger = pino({
  level: process.env.LEDGER_LOG_LEVEL ?? (isDev() ? 'debug' : 'info'),
  base: {
    service: 'ledger',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  },
  mixin: correlationBindings,
  redact: {
    paths: [
      'authorization',
      'cookie',
      'password',
      'password_hash',
      'current_password',
      'new_password',
      'token',
      'access_token',
      'refresh_token',
      'id_token',
      'secret',
      'auth',
      'p256dh',
      '*.authorization',
      '*.cookie',
      '*.password',
      '*.password_hash',
      '*.current_password',
      '*.new_password',
      '*.token',
      '*.access_token',
      '*.refresh_token',
      '*.id_token',
      '*.secret',
      '*.auth',
      '*.p256dh',
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.set-cookie',
      'req.body.password',
      'req.body.current_password',
      'req.body.new_password',
    ],
    censor: '[Redacted]',
  },
  ...(isDev()
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
})

type AuditValue = string | number | boolean | null | undefined

export function auditRef(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 16)
}

export function audit(action: string, actor_id?: string, details: Record<string, AuditValue> = {}): void {
  logger.info(
    {
      event: 'audit',
      action,
      outcome: 'success',
      ...(actor_id ? { actor_ref: auditRef(actor_id) } : {}),
      ...details,
    },
    `audit: ${action}`,
  )
}
