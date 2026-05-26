// One-shot sync: copies prod Postgres → local Postgres, prod Redis → local Redis
// (if PROD_REDIS_URL set), and prod Vercel Blob → local Blob emulator (if
// PROD_BLOB_READ_WRITE_TOKEN set). Designed to run inside the sync-db
// docker-compose service, where:
//   - postgres, redis, blob are reachable via their compose service names
//   - postgresql-client is installed via apt
//   - @vercel/blob + ioredis are installed via `npm install --no-save`
//
// Local destinations are flushed before the copy so they end up as a true
// snapshot of prod.

import { execSync } from 'node:child_process'
import process from 'node:process'
import { Buffer } from 'node:buffer'

const env = process.env
const required = ['PG_SRC', 'PG_DEST', 'REDIS_DEST', 'DEST_BLOB_TOKEN', 'DEST_BLOB_API_URL']
for (const k of required) {
  if (!env[k]) {
    console.error(`Missing required env var: ${k}`)
    process.exit(1)
  }
}

// ----------------------------- Postgres -----------------------------
console.log('--- Postgres ---')
console.log('Syncing Postgres from prod...')
// Point libpq at Debian's system CA bundle so pg_dump can verify Neon's cert
// (the URL uses sslmode=verify-full, channel_binding=require). The "system"
// keyword for PGSSLROOTCERT is libpq 16+, but the explicit path works on
// every libpq we'd realistically run inside this container.
// Applied only to pg_dump; the local pg_restore connection doesn't use SSL.
execSync(
  `PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt pg_dump "${env.PG_SRC}" --format=custom --no-owner --no-privileges | ` +
    `pg_restore -d "${env.PG_DEST}" --clean --if-exists --no-owner --no-privileges`,
  { stdio: 'inherit', shell: '/bin/bash' },
)

// ----------------------------- Redis -----------------------------
console.log('\n--- Redis ---')
const { default: Redis } = await import('ioredis')
const dest_redis = new Redis(env.REDIS_DEST)
await dest_redis.flushall()
console.log('Flushed local Redis')

if (env.REDIS_SRC) {
  const src_redis = new Redis(env.REDIS_SRC)
  let n = 0
  let cursor = '0'
  do {
    const [next, keys] = await src_redis.scan(cursor, 'COUNT', 500)
    cursor = next
    for (const key of keys) {
      const ttl_ms = await src_redis.pttl(key)
      const dump = await src_redis.dumpBuffer(key)
      if (dump) {
        await dest_redis.restoreBuffer(key, ttl_ms < 0 ? 0 : ttl_ms, dump, 'REPLACE')
        n++
      }
    }
  } while (cursor !== '0')
  await src_redis.quit()
  console.log(`Synced ${n} keys from prod Redis`)
} else {
  console.log('PROD_REDIS_URL not set; skipped Redis copy')
}
await dest_redis.quit()

// ----------------------------- Vercel Blob -----------------------------
console.log('\n--- Vercel Blob ---')

if (!env.PROD_BLOB_TOKEN) {
  console.log('PROD_BLOB_READ_WRITE_TOKEN not set; skipped Blob copy')
} else {
  // The @vercel/blob SDK reads VERCEL_BLOB_API_URL lazily on each call, so we
  // can swap it mid-script: unset for talking to prod, set to the emulator URL
  // for talking to local. Without this, the prod list+download would also be
  // routed to the local emulator with a prod token (HTTP 401).
  delete env.VERCEL_BLOB_API_URL
  const { list, put, del } = await import('@vercel/blob')

  // Phase 1: drain prod into memory (path + bytes + content-type). For large
  // stores this would want streaming-to-disk, but our prod blob is tiny
  // (attachments only) so in-memory is fine.
  /** @type {{pathname: string, body: Buffer, content_type: string | null}[]} */
  const prod_blobs = []
  {
    let cursor
    do {
      const page = await list({ token: env.PROD_BLOB_TOKEN, cursor, limit: 1000 })
      for (const b of page.blobs) {
        const r = await fetch(b.url)
        if (!r.ok) {
          console.warn(`  skip ${b.pathname}: HTTP ${r.status}`)
          continue
        }
        prod_blobs.push({
          pathname: b.pathname,
          body: Buffer.from(await r.arrayBuffer()),
          content_type: r.headers.get('content-type'),
        })
      }
      cursor = page.cursor
    } while (cursor)
  }
  console.log(`Pulled ${prod_blobs.length} blobs from prod`)

  // Phase 2: clear local + upload prod blobs into it.
  env.VERCEL_BLOB_API_URL = env.DEST_BLOB_API_URL

  /** @type {string[]} */
  const stale_local_urls = []
  {
    let cursor
    do {
      const page = await list({ token: env.DEST_BLOB_TOKEN, cursor, limit: 1000 })
      for (const b of page.blobs) stale_local_urls.push(b.url)
      cursor = page.cursor
    } while (cursor)
  }
  if (stale_local_urls.length > 0) {
    await del(stale_local_urls, { token: env.DEST_BLOB_TOKEN })
    console.log(`Cleared ${stale_local_urls.length} stale blobs from local`)
  }

  let copied = 0
  for (const b of prod_blobs) {
    await put(b.pathname, b.body, {
      token: env.DEST_BLOB_TOKEN,
      access: 'public',
      addRandomSuffix: false,
      contentType: b.content_type ?? undefined,
    })
    copied++
  }
  console.log(`Synced ${copied} blobs to local`)
}

console.log('\nDone.')
