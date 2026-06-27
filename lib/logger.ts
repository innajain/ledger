import 'server-only'
import pino from 'pino'
import { isDev } from './env'

/**
 * Server-side base logger. Use `logger.child({ ... })` at each entry point
 * (server action, route handler, cron) to attach request context (userId,
 * route, etc.). Do not import from edge runtime / client components.
 */
export const logger = pino({
  // LEDGER_LOG_LEVEL overrides when set (the CLI sets it to 'warn' to keep info
  // chatter off stdout so piped `--json` output stays clean); web leaves it unset.
  level: process.env.LEDGER_LOG_LEVEL ?? (isDev() ? 'debug' : 'info'),
  ...(isDev()
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
})
