import 'server-only'
import pino from 'pino'
import { isDev } from './env'

export const logger = pino({
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
