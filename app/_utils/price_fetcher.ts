import 'server-only'
import yahooFinance from 'yahoo-finance2'
import { parse } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { get_indian_date_from_date_obj, get_date_obj_from_indian_date } from './date'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'
import { asset_type } from '@/generated/prisma/client'
import { AMFI_NAVALL_URL, parse_navall } from './amfi_nav'

type NAVData = {
  isin: string
  schemeName: string
  nav: number
  date: Date
}

type PriceData = {
  price: number
  date: Date
}

const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] })

// 3 days (not 2) so one missed daily cron run doesn't expire every key at once.
const ETF_SPOT_TTL = 3 * 24 * 60 * 60
const ETF_SPOT_NEGATIVE_TTL = 60 * 60

const inFlightQuotes = new Map<string, Promise<{ date: Date; close: number } | null>>()

async function fetch_and_cache_etf_quote(symbol: string): Promise<{ date: Date; close: number } | null> {
  const cacheKey = `price:etf:${symbol}`
  try {
    const result = await yf.quote(symbol)
    let date = result.regularMarketTime as Date
    date.setHours(0, 0, 0, 0)
    date = fromZonedTime(date, USER_TIMEZONE)
    const priceData = { price: result.regularMarketPrice!, date }

    await redis.setex(cacheKey, ETF_SPOT_TTL, JSON.stringify(priceData))

    return { date, close: result.regularMarketPrice as number }
  } catch (err) {
    logger.error({ err, symbol }, 'Error fetching latest price')
    // Negative-cache briefly so a dead symbol doesn't cost a Yahoo call per page load.
    try {
      await redis.setex(cacheKey, ETF_SPOT_NEGATIVE_TTL, 'null')
    } catch {}
    return null
  }
}

export async function get_latest_etf_or_shares_price(symbol: string) {
  const cacheKey = `price:etf:${symbol}`

  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      if (cached === 'null') return null
      const data = JSON.parse(cached) as PriceData
      return { date: new Date(data.date), close: data.price }
    }

    const existing = inFlightQuotes.get(cacheKey)
    if (existing) return existing

    const fetchPromise = fetch_and_cache_etf_quote(symbol).finally(() => {
      inFlightQuotes.delete(cacheKey)
    })

    inFlightQuotes.set(cacheKey, fetchPromise)
    return fetchPromise
  } catch (err) {
    logger.error({ err, symbol }, 'Error fetching latest price')
    return null
  }
}

// Cron pre-warm: refresh every held ETF/shares spot quote so page loads stop paying
// the first blocking Yahoo round trip after the cache expires. Per-symbol errors are
// isolated (and negative-cached by fetch_and_cache_etf_quote).
export async function sync_etf_quotes(): Promise<{ synced: number; failed: number }> {
  const assets = await prisma.asset.findMany({
    where: { type: { in: [asset_type.etf, asset_type.shares] }, ticker: { not: null } },
    select: { ticker: true },
  })
  const symbols = Array.from(new Set(assets.flatMap(a => (a.ticker ? [a.ticker] : []))))

  let synced = 0
  let failed = 0
  const CONCURRENCY = 4
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    await Promise.all(
      symbols.slice(i, i + CONCURRENCY).map(async symbol => {
        const quote = await fetch_and_cache_etf_quote(symbol)
        if (quote) synced++
        else failed++
      }),
    )
  }
  return { synced, failed }
}

export async function sync_nav() {
  const assets = await prisma.asset.findMany({
    where: { type: 'mf', ticker: { not: null } },
    select: { ticker: true },
  })
  const isinSet = new Set(assets.map(a => a.ticker))

  const response = await fetch(AMFI_NAVALL_URL)
  if (!response.ok) throw new Error(`AMFI NAV fetch failed: ${response.status}`)

  const text = await response.text()
  const { rows, skipped } = parse_navall(text)

  // A layout change upstream shows up as zero parsed rows; fail loudly rather
  // than quietly caching nothing and serving null prices for every fund.
  if (rows.length === 0) throw new Error(`AMFI NAV parse yielded no rows (${text.length} bytes, ${skipped} skipped)`)
  if (skipped > 0) logger.warn({ skipped, parsed: rows.length }, 'Skipped malformed rows in AMFI NAV feed')

  let pipeline = redis.pipeline()
  let count = 0
  let queuedCount = 0

  // The feed is ~15k schemes but only a handful are held, so filter before the
  // (comparatively expensive) date parse; kept rows share 1-2 distinct date
  // strings, so memoize the parse on the verbatim string.
  const dateCache = new Map<string, Date>()

  for (const row of rows) {
    const wanted = [row.isin_growth, row.isin_reinvestment].filter((isin): isin is string => !!isin && isinSet.has(isin))
    if (wanted.length === 0) continue

    let istDate = dateCache.get(row.date)
    if (!istDate) {
      istDate = fromZonedTime(parse(row.date, 'dd-MMM-yyyy', new Date()), USER_TIMEZONE)
      dateCache.set(row.date, istDate)
    }

    for (const isin of wanted) {
      const navData = { isin, schemeName: row.scheme_name, nav: row.nav, date: istDate }
      pipeline.setex(`price:nav:${isin}`, 2 * 24 * 60 * 60, JSON.stringify(navData))
      count++
      queuedCount++
    }

    if (queuedCount >= 1000) {
      await pipeline.exec()
      pipeline = redis.pipeline()
      queuedCount = 0
    }
  }

  if (queuedCount > 0) {
    await pipeline.exec()
  }
  return count
}

let syncPromise: Promise<number> | null = null

export async function get_nav({ code }: { code: string }): Promise<NAVData | null> {
  const cacheKey = `price:nav:${code}`

  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      if (cached === 'null') return null
      const data = JSON.parse(cached) as NAVData
      return { ...data, date: new Date(data.date) }
    }

    logger.warn({ code }, 'Cache miss for NAV code; attempting manual sync (cron may be delayed)')

    try {
      if (!syncPromise) {
        syncPromise = sync_nav().finally(() => {
          syncPromise = null
        })
      }
      await syncPromise

      const cachedRetry = await redis.get(cacheKey)
      if (cachedRetry && cachedRetry !== 'null') {
        const data = JSON.parse(cachedRetry) as NAVData
        return { ...data, date: new Date(data.date) }
      } else {
        await redis.setex(cacheKey, 60 * 60, 'null')
      }
    } catch (retryError) {
      logger.error({ err: retryError, code }, 'Failed to run sync_nav manually')
    }

    return null
  } catch (error) {
    logger.error({ err: error, code }, 'Failed to fetch NAV from cache')
    return null
  }
}

export async function get_prices_for_assets(
  assets: { id: string; type: asset_type; ticker: string | null }[],
): Promise<Map<string, { price: number; date: Date } | null>> {
  const uniqueKeys = new Map<string, { type: asset_type; ticker: string | null }>()
  for (const a of assets) {
    const key = `${a.type}|${a.ticker ?? ''}`
    if (!uniqueKeys.has(key)) uniqueKeys.set(key, { type: a.type, ticker: a.ticker })
  }

  const fetched = new Map<string, { price: number; date: Date } | null>()
  const cacheable: { dedupKey: string; type: asset_type; ticker: string; redisKey: string }[] = []
  const today = get_date_obj_from_indian_date(get_indian_date_from_date_obj(new Date()))

  for (const [dedupKey, { type, ticker }] of uniqueKeys) {
    if (type === asset_type.rupees) {
      fetched.set(dedupKey, { price: 1, date: today })
    } else if (!ticker) {
      fetched.set(dedupKey, null)
    } else if (type === 'mf') {
      cacheable.push({ dedupKey, type, ticker, redisKey: `price:nav:${ticker}` })
    } else if (type === 'etf' || type === 'shares') {
      cacheable.push({ dedupKey, type, ticker, redisKey: `price:etf:${ticker}` })
    } else {
      fetched.set(dedupKey, null)
    }
  }

  if (cacheable.length > 0) {
    let values: (string | null)[] = []
    try {
      values = await redis.mget(...cacheable.map(c => c.redisKey))
    } catch (err) {
      logger.error({ err }, 'redis.mget failed in get_prices_for_assets; falling back per-key')
      values = cacheable.map(() => null)
    }

    const misses: typeof cacheable = []
    for (let i = 0; i < cacheable.length; i++) {
      const c = cacheable[i]
      const raw = values[i]
      if (raw === null) {
        misses.push(c)
        continue
      }
      if (raw === 'null') {
        fetched.set(c.dedupKey, null)
        continue
      }
      try {
        if (c.type === 'mf') {
          const data = JSON.parse(raw) as NAVData
          fetched.set(c.dedupKey, { price: data.nav, date: new Date(data.date) })
        } else {
          const data = JSON.parse(raw) as PriceData
          fetched.set(c.dedupKey, { price: data.price, date: new Date(data.date) })
        }
      } catch (err) {
        logger.error({ err, redisKey: c.redisKey }, 'Failed to parse cached price; refetching')
        misses.push(c)
      }
    }

    await Promise.all(
      misses.map(async c => {
        fetched.set(c.dedupKey, await get_price_for_asset(c.type, c.ticker))
      }),
    )
  }

  const byAssetId = new Map<string, { price: number; date: Date } | null>()
  for (const a of assets) {
    byAssetId.set(a.id, fetched.get(`${a.type}|${a.ticker ?? ''}`) ?? null)
  }
  return byAssetId
}

export async function get_price_for_asset(type: asset_type, code: string | null): Promise<{ price: number; date: Date } | null> {
  try {
    if (type === asset_type.rupees)
      return {
        price: 1,
        date: get_date_obj_from_indian_date(get_indian_date_from_date_obj(new Date())),
      }
    if (!code) return null

    if (type === 'mf') {
      const nav_data = await get_nav({ code })
      if (nav_data) {
        return { price: nav_data.nav, date: nav_data.date }
      } else return null
    } else if (type === 'etf' || type === 'shares') {
      const price_data = await get_latest_etf_or_shares_price(code)
      if (price_data) {
        return { price: price_data.close, date: price_data.date }
      } else return null
    } else {
      return null
    }
  } catch (error) {
    logger.error({ err: error, type, code }, 'Error fetching price for asset')
  }
  return null
}
