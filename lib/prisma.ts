import 'server-only'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'
import { env, isDev, isProd } from './env'
import { logger } from './logger'
import { currentMetrics, SLOW_QUERY_THRESHOLD_MS } from './metrics/context'
import { publishQueryEvent } from './dev/query-bus'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof buildPrisma> | undefined
}

const globalForPrismaConnection = globalThis as unknown as {
  prismaConnectionLogged: boolean | undefined
}

const PROFILING_MODELS = new Set(['server_metric', 'slow_query', 'web_vital'])

function buildPrisma() {
  const base = new PrismaClient({
    adapter,
    log: isDev() ? ['error', 'warn'] : ['error'],
  })

  return base.$extends({
    name: 'profiling',
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        if (model && PROFILING_MODELS.has(model)) return query(args)
        const ctx = currentMetrics()
        const start = performance.now()
        let errored = false
        try {
          return await query(args)
        } catch (err) {
          errored = true
          throw err
        } finally {
          const ms = performance.now() - start
          if (ctx) {
            ctx.db_query_count += 1
            ctx.db_query_ms += ms
            if (ms >= SLOW_QUERY_THRESHOLD_MS) {
              ctx.slow_queries.push({
                model: model ?? undefined,
                action: operation,
                duration_ms: ms,
              })
            }
          }
          publishQueryEvent({
            kind: 'db',
            model: model ?? undefined,
            action: operation,
            duration_ms: ms,
            error: errored || undefined,
          })
        }
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? buildPrisma()

if (!globalForPrismaConnection.prismaConnectionLogged) {
  globalForPrismaConnection.prismaConnectionLogged = true
  prisma
    .$connect()
    .then(() => {
      logger.info('Database connected')
    })
    .catch(error => {
      globalForPrismaConnection.prismaConnectionLogged = false
      logger.error({ err: error }, 'Database connection failed')
    })
}

if (!isProd()) globalForPrisma.prisma = prisma
