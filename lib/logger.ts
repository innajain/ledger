import 'server-only'
import pino from 'pino'
import { isDev } from './env'

export const logger = pino({
  level: process.env.LEDGER_LOG_LEVEL ?? (isDev() ? 'debug' : 'info'),
  redact: {
    paths: [
      'authorization',
      'cookie',
      'password',
      'token',
      'secret',
      '*.authorization',
      '*.cookie',
      '*.password',
      '*.token',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie',
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
