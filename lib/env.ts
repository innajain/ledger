import 'server-only'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  CRON_SECRET: z.string().min(1).optional(),

  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).default('mailto:admin@ledger.local'),

  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  NEXT_PUBLIC_VERCEL_BLOB_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Invalid environment variables:\n${issues}`)
}

export const env = parsed.data
export const isProd = () => env.NODE_ENV === 'production'
export const isDev = () => env.NODE_ENV === 'development'
