import 'server-only'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  CRON_SECRET: z.string().min(1).optional(),
  // Web Push (VAPID). Optional — when unset, push sending is a no-op so the app
  // still runs. The public key is also exposed to the client as
  // NEXT_PUBLIC_VAPID_PUBLIC_KEY (Next inlines NEXT_PUBLIC_* at build time).
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).default('mailto:admin@ledger.local'),
  // Vercel Blob. The token is optional — when unset, attachment upload/serving
  // is disabled. The API URL points the SDK at the local Blob emulator in dev.
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  NEXT_PUBLIC_VERCEL_BLOB_API_URL: z.string().url().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Invalid environment variables:\n${issues}`)
}

export const env = parsed.data
export const isProd = () => env.NODE_ENV === 'production'
export const isDev = () => env.NODE_ENV === 'development'
