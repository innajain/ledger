import yahooFinance from 'yahoo-finance2'
import { parse } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { get_indian_date_from_date_obj, get_date_obj_from_indian_date } from './date'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'
import { asset_type, Prisma } from '@/generated/prisma/client'

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

// In-flight dedup: when several callers race for the same uncached symbol,
// only one Yahoo request fires and everyone shares its result.
const inFlightQuotes = new Map<string, Promise<{ date: Date; close: number } | null>>()

export async function get_latest_etf_or_shares_price(symbol: string) {
  const cacheKey = `price:etf:${symbol}`

  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      const data = JSON.parse(cached) as PriceData
      return { date: new Date(data.date), close: data.price }
    }

    const existing = inFlightQuotes.get(cacheKey)
    if (existing) return existing

    const fetchPromise = (async () => {
      try {
        const result = await yf.quote(symbol)
        let date = result.regularMarketTime as Date
        date.setHours(0, 0, 0, 0) // Normalize to start of the day
        date = fromZonedTime(date, USER_TIMEZONE)
        const priceData = { price: result.regularMarketPrice!, date }

        await redis.setex(cacheKey, 2 * 24 * 60 * 60, JSON.stringify(priceData))

        return { date, close: result.regularMarketPrice as number }
      } catch (err) {
        logger.error({ err, symbol }, 'Error fetching latest price')
        return null
      }
    })().finally(() => {
      inFlightQuotes.delete(cacheKey)
    })

    inFlightQuotes.set(cacheKey, fetchPromise)
    return fetchPromise
  } catch (err) {
    logger.error({ err, symbol }, 'Error fetching latest price')
    return null
  }
}

export async function sync_nav() {
  const assets = await prisma.asset.findMany({
    where: { type: 'mf', ticker: { not: null } },
    select: { ticker: true },
  })
  const isinSet = new Set(assets.map(a => a.ticker))

  const url = 'https://www.amfiindia.com/spages/NAVAll.txt'
  const response = await fetch(url)
  if (!response.ok) throw new Error(`AMFI NAV fetch failed: ${response.status}`)

  const text = await response.text()
  const lines = text.split('\n')

  let pipeline = redis.pipeline()
  let count = 0
  let queuedCount = 0

  for (const line of lines) {
    const parts = line.split(';')
    if (parts.length >= 6 && parts[0] && !isNaN(Number(parts[0]))) {
      const isinGrowth = parts[1]?.trim()
      const isinReinvestment = parts[2]?.trim()
      const schemeName = parts[3]?.trim()
      const navStr = parts[4]?.trim()
      const nav = navStr ? new Prisma.Decimal(parseFloat(navStr) || navStr).toNumber() : 0
      const dateStr = parts[5]?.trim()

      if (dateStr) {
        const localDate = parse(dateStr, 'dd-MMM-yyyy', new Date())
        const istDate = fromZonedTime(localDate, USER_TIMEZONE)

        if (isinGrowth && isinGrowth !== '-' && isinSet.has(isinGrowth)) {
          const navData = { isin: isinGrowth, schemeName, nav, date: istDate }
          const cacheKey = `price:nav:${isinGrowth}`
          pipeline.setex(cacheKey, 2 * 24 * 60 * 60, JSON.stringify(navData))
          count++
          queuedCount++
        }

        if (isinReinvestment && isinReinvestment !== '-' && isinSet.has(isinReinvestment)) {
          const navData = { isin: isinReinvestment, schemeName, nav, date: istDate }
          const cacheKey = `price:nav:${isinReinvestment}`
          pipeline.setex(cacheKey, 2 * 24 * 60 * 60, JSON.stringify(navData))
          count++
          queuedCount++
        }

        if (queuedCount >= 1000) {
          await pipeline.exec()
          pipeline = redis.pipeline()
          queuedCount = 0
        }
      }
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
    // Check Redis cache (populated by a daily cron job)
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
        // Code is invalid or not in AMFI. Cache the miss for 1 hour to prevent spamming
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

// Dedups by (type, ticker) and fetches all unique prices in parallel.
// Returns a Map keyed by asset.id, so callers can look up O(1) inside loops
// without each iteration paying for a Redis round-trip.
export async function get_prices_for_assets(
  assets: { id: string; type: asset_type; ticker: string | null }[],
): Promise<Map<string, { price: number; date: Date } | null>> {
  const uniqueKeys = new Map<string, { type: asset_type; ticker: string | null }>()
  for (const a of assets) {
    const key = `${a.type}|${a.ticker ?? ''}`
    if (!uniqueKeys.has(key)) uniqueKeys.set(key, { type: a.type, ticker: a.ticker })
  }

  const fetched = new Map<string, { price: number; date: Date } | null>()
  await Promise.all(
    Array.from(uniqueKeys.entries()).map(async ([key, { type, ticker }]) => {
      fetched.set(key, await get_price_for_asset(type, ticker))
    }),
  )

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
