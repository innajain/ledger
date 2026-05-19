import 'server-only'
import yahooFinance from 'yahoo-finance2'
import { formatInTimeZone } from 'date-fns-tz'
import { redis } from '@/lib/redis'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'
import { asset_type } from '@/generated/prisma/client'

// Use IST date as the canonical lookup key. Indian NAVs and Indian stock
// closes are published once per Indian calendar day; aligning everything to
// IST avoids off-by-one from UTC midnight crossings.
function ist_date_key(date: Date): string {
  return formatInTimeZone(date, USER_TIMEZONE, 'yyyy-MM-dd')
}

const yf = new yahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

// Cache TTLs. Historical price data is immutable for past dates; only "today"
// can be in flux. The chart's last point is overridden with the live price by
// the detail page anyway, so a slightly stale full-history cache is fine.
const SCHEME_MAP_TTL = 30 * 24 * 60 * 60 // 30 days (AMFI master changes rarely)
const NAV_HISTORY_TTL = 7 * 24 * 60 * 60 // 7 days
const ETF_HISTORY_TTL = 7 * 24 * 60 * 60 // 7 days

// In-flight dedup
const inFlightSchemeMap = new Map<string, Promise<Record<string, string>>>()
const inFlightNavHistory = new Map<string, Promise<Map<string, number>>>()
const inFlightEtfHistory = new Map<string, Promise<Map<string, number>>>()

/**
 * Build a map of ISIN → AMFI scheme code by parsing AMFI's NAVAll.txt.
 * Cached in Redis. Used to bridge our ticker (ISIN) with mfapi.in (scheme code).
 */
async function get_isin_to_scheme_code_map(): Promise<Record<string, string>> {
  const cacheKey = 'amfi:isin_to_scheme_code'
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached) as Record<string, string>

  const existing = inFlightSchemeMap.get(cacheKey)
  if (existing) return existing

  const fetchPromise = (async () => {
    const url = 'https://www.amfiindia.com/spages/NAVAll.txt'
    const response = await fetch(url)
    if (!response.ok) throw new Error(`AMFI NAVAll fetch failed: ${response.status}`)
    const text = await response.text()
    const lines = text.split('\n')
    const map: Record<string, string> = {}
    for (const line of lines) {
      const parts = line.split(';')
      if (parts.length >= 6 && parts[0] && !isNaN(Number(parts[0]))) {
        const schemeCode = parts[0].trim()
        const isinGrowth = parts[1]?.trim()
        const isinReinvestment = parts[2]?.trim()
        if (isinGrowth && isinGrowth !== '-') map[isinGrowth] = schemeCode
        if (isinReinvestment && isinReinvestment !== '-') map[isinReinvestment] = schemeCode
      }
    }
    await redis.setex(cacheKey, SCHEME_MAP_TTL, JSON.stringify(map))
    return map
  })().finally(() => inFlightSchemeMap.delete(cacheKey))

  inFlightSchemeMap.set(cacheKey, fetchPromise)
  return fetchPromise
}

/**
 * Fetch the full NAV history for a single MF scheme from mfapi.in.
 * Returns a Map keyed by 'yyyy-MM-dd' (in user timezone) → NAV.
 */
async function get_full_nav_history(isin: string): Promise<Map<string, number> | null> {
  const cacheKey = `price:nav_history:${isin}`
  const cached = await redis.get(cacheKey)
  if (cached) {
    if (cached === 'null') return null
    const obj = JSON.parse(cached) as Record<string, number>
    return new Map(Object.entries(obj))
  }

  const existing = inFlightNavHistory.get(cacheKey)
  if (existing) return existing

  const fetchPromise = (async () => {
    try {
      const schemeMap = await get_isin_to_scheme_code_map()
      const schemeCode = schemeMap[isin]
      if (!schemeCode) {
        logger.warn({ isin }, 'No AMFI scheme code found for ISIN')
        await redis.setex(cacheKey, 60 * 60, 'null')
        return new Map<string, number>()
      }

      const url = `https://api.mfapi.in/mf/${schemeCode}`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`mfapi fetch failed: ${response.status}`)
      const json = (await response.json()) as { data: { date: string; nav: string }[] }

      const map = new Map<string, number>()
      for (const entry of json.data) {
        // mfapi returns date as 'DD-MM-YYYY' in IST; flip to 'yyyy-MM-dd' string-only.
        const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(entry.date)
        if (!m) continue
        const dateKey = `${m[3]}-${m[2]}-${m[1]}`
        const nav = parseFloat(entry.nav)
        if (!isNaN(nav)) map.set(dateKey, nav)
      }
      await redis.setex(cacheKey, NAV_HISTORY_TTL, JSON.stringify(Object.fromEntries(map)))
      return map
    } catch (err) {
      logger.error({ err, isin }, 'Error fetching NAV history')
      return new Map<string, number>()
    }
  })().finally(() => inFlightNavHistory.delete(cacheKey))

  inFlightNavHistory.set(cacheKey, fetchPromise)
  return fetchPromise
}

/**
 * Fetch the daily price history for an ETF/share from yahoo.
 * Returns a Map keyed by 'yyyy-MM-dd' → close price.
 */
async function get_full_etf_history(symbol: string, from: Date): Promise<Map<string, number>> {
  const cacheKey = `price:etf_history:${symbol}:${ist_date_key(from)}`
  const cached = await redis.get(cacheKey)
  if (cached) {
    const obj = JSON.parse(cached) as Record<string, number>
    return new Map(Object.entries(obj))
  }

  const existing = inFlightEtfHistory.get(cacheKey)
  if (existing) return existing

  const fetchPromise = (async () => {
    try {
      const today = new Date()
      // Use chart() directly (historical() is deprecated and trips on partial-null rows
      // — chart() returns the same shape under `quotes` and we filter nulls ourselves).
      const result = await yf.chart(symbol, { period1: from, period2: today, interval: '1d' })
      const map = new Map<string, number>()
      for (const row of result.quotes ?? []) {
        if (row.close == null || !row.date) continue
        const dateKey = ist_date_key(row.date)
        map.set(dateKey, row.close)
      }
      await redis.setex(cacheKey, ETF_HISTORY_TTL, JSON.stringify(Object.fromEntries(map)))
      return map
    } catch (err) {
      logger.error({ err, symbol }, 'Error fetching ETF history')
      return new Map<string, number>()
    }
  })().finally(() => inFlightEtfHistory.delete(cacheKey))

  inFlightEtfHistory.set(cacheKey, fetchPromise)
  return fetchPromise
}

/**
 * Returns a price-lookup function for the given asset that can resolve
 * the price on any given date. For dates without a recorded price (weekends,
 * holidays), the most recent prior price is returned.
 *
 * For rupees, always returns 1.
 * For non-rupees with no ticker or fetch failure, returns null.
 */
export type PriceLookup = (date: Date) => number | null

function build_lookup_from_history(history: Map<string, number> | null): PriceLookup {
  if (!history || history.size === 0) return () => null
  // Build a sorted array of [dateKey, price] for fallback (last-known) lookups.
  const sortedKeys = Array.from(history.keys()).sort()
  const prices = sortedKeys.map(k => history.get(k)!)

  return (date: Date): number | null => {
    const dateKey = ist_date_key(date)
    const exact = history.get(dateKey)
    if (exact !== undefined) return exact
    // Binary search for the largest key ≤ dateKey.
    let lo = 0
    let hi = sortedKeys.length - 1
    let result = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (sortedKeys[mid] <= dateKey) {
        result = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return result >= 0 ? prices[result] : null
  }
}

export async function get_price_lookup_for_asset(type: asset_type, ticker: string | null, earliestDate: Date): Promise<PriceLookup> {
  if (type === asset_type.rupees) return () => 1
  if (!ticker) return () => null

  let history: Map<string, number> | null = null
  if (type === 'mf') {
    history = await get_full_nav_history(ticker)
  } else if (type === 'etf' || type === 'shares') {
    history = await get_full_etf_history(ticker, earliestDate)
  }
  return build_lookup_from_history(history)
}

/**
 * Batch convenience: build price lookups for many assets at once.
 * Dedups by (type, ticker) and uses a single MGET for the history blobs so
 * an N-asset call costs one Redis round-trip on the happy path instead of N.
 */
export async function get_price_lookups_for_assets(
  assets: { id: string; type: asset_type; ticker: string | null }[],
  earliestDate: Date,
): Promise<Map<string, PriceLookup>> {
  const uniqueKeys = new Map<string, { type: asset_type; ticker: string | null }>()
  for (const a of assets) {
    const key = `${a.type}|${a.ticker ?? ''}`
    if (!uniqueKeys.has(key)) uniqueKeys.set(key, { type: a.type, ticker: a.ticker })
  }

  const lookups = new Map<string, PriceLookup>()
  type Cacheable = { dedupKey: string; type: asset_type; ticker: string; redisKey: string }
  const cacheable: Cacheable[] = []

  for (const [dedupKey, { type, ticker }] of uniqueKeys) {
    if (type === asset_type.rupees) {
      lookups.set(dedupKey, () => 1)
    } else if (!ticker) {
      lookups.set(dedupKey, () => null)
    } else if (type === 'mf') {
      cacheable.push({ dedupKey, type, ticker, redisKey: `price:nav_history:${ticker}` })
    } else if (type === 'etf' || type === 'shares') {
      cacheable.push({ dedupKey, type, ticker, redisKey: `price:etf_history:${ticker}:${ist_date_key(earliestDate)}` })
    } else {
      lookups.set(dedupKey, () => null)
    }
  }

  if (cacheable.length > 0) {
    let values: (string | null)[] = []
    try {
      values = await redis.mget(...cacheable.map(c => c.redisKey))
    } catch (err) {
      logger.error({ err }, 'redis.mget failed in get_price_lookups_for_assets; falling back per-key')
      values = cacheable.map(() => null)
    }

    const misses: Cacheable[] = []
    for (let i = 0; i < cacheable.length; i++) {
      const c = cacheable[i]
      const raw = values[i]
      if (raw === null) {
        misses.push(c)
        continue
      }
      if (raw === 'null') {
        // Cached "no data" sentinel (written by get_full_nav_history for unknown ISINs).
        lookups.set(c.dedupKey, () => null)
        continue
      }
      try {
        const obj = JSON.parse(raw) as Record<string, number>
        lookups.set(c.dedupKey, build_lookup_from_history(new Map(Object.entries(obj))))
      } catch (err) {
        logger.error({ err, redisKey: c.redisKey }, 'Failed to parse cached history; refetching')
        misses.push(c)
      }
    }

    // Misses fall through to the per-asset path, which repopulates the cache.
    await Promise.all(
      misses.map(async c => {
        lookups.set(c.dedupKey, await get_price_lookup_for_asset(c.type, c.ticker, earliestDate))
      }),
    )
  }

  const byAssetId = new Map<string, PriceLookup>()
  for (const a of assets) {
    byAssetId.set(a.id, lookups.get(`${a.type}|${a.ticker ?? ''}`)!)
  }
  return byAssetId
}

export { ist_date_key }
