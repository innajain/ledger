import 'server-only'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  // 'memory' replaces Redis with an in-process cache (lib/memory_redis.ts): for a single-process
  // deployment with no Redis server. REDIS_URL is then unused.
  CACHE_DRIVER: z.enum(['redis', 'memory']).default('redis'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  CRON_SECRET: z.string().min(1).optional(),

  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).default('mailto:admin@ledger.local'),

  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  // 'fs' keeps attachments on local disk under BLOB_FS_DIR instead of Vercel Blob (lib/blob_store.ts).
  // Set NEXT_PUBLIC_BLOB_STORAGE=fs alongside it so the browser uploads through this server too.
  BLOB_STORAGE: z.enum(['vercel', 'fs']).default('vercel'),
  BLOB_FS_DIR: z.string().min(1).default('./.data/blobs'),
  NEXT_PUBLIC_VERCEL_BLOB_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

  // Public contact shown on /privacy and /docs; both connector directories require one.
  SUPPORT_EMAIL: z.string().email().optional(),
  // Token the ChatGPT app-directory portal issues for domain verification, served
  // verbatim at /.well-known/openai-apps-challenge. Only needed while submitting.
  OPENAI_APPS_CHALLENGE_TOKEN: z.string().min(1).optional(),

  // Set by Vercel at build/runtime; tags the MCP serverInfo version so a client's
  // logs say which deploy answered.
  VERCEL_GIT_COMMIT_SHA: z.string().min(1).optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Invalid environment variables:\n${issues}`)
}

export const env = parsed.data
export const isProd = () => env.NODE_ENV === 'production'
export const isDev = () => env.NODE_ENV === 'development'
