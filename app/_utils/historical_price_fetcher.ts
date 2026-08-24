import 'server-only'
import yahooFinance from 'yahoo-finance2'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { redis } from '@/lib/redis'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'
import { asset_type } from '@/generated/prisma/client'
import { AMFI_NAVALL_URL, parse_navall } from './amfi_nav'

function ist_date_key(date: Date): string {
  return formatInTimeZone(date, USER_TIMEZONE, 'yyyy-MM-dd')
}

const yf = new yahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

const SCHEME_MAP_TTL = 30 * 24 * 60 * 60
const NAV_HISTORY_TTL = 7 * 24 * 60 * 60
// Envelope entries refresh once per IST day via the fetched_on check; the TTL only
// garbage-collects abandoned symbols.
const ETF_HISTORY_TTL = 2 * 24 * 60 * 60

// One stable key per symbol. The old scheme keyed on the requested from-date, so the
// home sparkline's daily-moving 90-day window rotated the key every day and never hit.
const etf_history_key = (symbol: string) => `price:etf_history2:${symbol}`

type EtfHistoryEnvelope = { from: string; fetched_on: string; prices: Record<string, number> }

function etf_envelope_hit(env: EtfHistoryEnvelope, fromKey: string, todayKey: string): boolean {
  // Serve only same-day data (preserves daily freshness) that reaches at least as far
  // back as requested — a truncated range would silently fall back to book values.
  return env.fetched_on === todayKey && env.from <= fromKey
}

const inFlightSchemeMap = new Map<string, Promise<Record<string, string>>>()
const inFlightNavHistory = new Map<string, Promise<Map<string, number>>>()
const inFlightEtfHistory = new Map<string, Promise<Map<string, number>>>()

async function get_isin_to_scheme_code_map(): Promise<Record<string, string>> {
  const cacheKey = 'amfi:isin_to_scheme_code'
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached) as Record<string, string>

  const existing = inFlightSchemeMap.get(cacheKey)
  if (existing) return existing

  const fetchPromise = (async () => {
    const response = await fetch(AMFI_NAVALL_URL)
    if (!response.ok) throw new Error(`AMFI NAVAll fetch failed: ${response.status}`)
    const text = await response.text()
    const { rows } = parse_navall(text)
    if (rows.length === 0) throw new Error(`AMFI NAVAll parse yielded no rows (${text.length} bytes)`)
    const map: Record<string, string> = {}
    for (const row of rows) {
      if (row.isin_growth) map[row.isin_growth] = row.scheme_code
      if (row.isin_reinvestment) map[row.isin_reinvestment] = row.scheme_code
    }
    await redis.setex(cacheKey, SCHEME_MAP_TTL, JSON.stringify(map))
    return map
  })().finally(() => inFlightSchemeMap.delete(cacheKey))

  inFlightSchemeMap.set(cacheKey, fetchPromise)
  return fetchPromise
}

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

async function get_full_etf_history(symbol: string, from: Date): Promise<Map<string, number>> {
  const todayKey = ist_date_key(new Date())
  const fromKey = ist_date_key(from)
  const cacheKey = etf_history_key(symbol)

  let fetchFromKey = fromKey
  const cached = await redis.get(cacheKey)
  if (cached) {
    try {
      const env = JSON.parse(cached) as EtfHistoryEnvelope
      if (etf_envelope_hit(env, fromKey, todayKey)) return new Map(Object.entries(env.prices))
      // Only ever widen the stored range so a page needing deeper history than a
      // previous caller never gets a truncated blob.
      if (env.from < fetchFromKey) fetchFromKey = env.from
    } catch (err) {
      logger.error({ err, symbol }, 'Failed to parse cached ETF history envelope; refetching')
    }
  }

  const inFlightKey = `${cacheKey}:${fetchFromKey}`
  const existing = inFlightEtfHistory.get(inFlightKey)
  if (existing) return existing

  const fetchPromise = (async () => {
    try {
      const period1 = fromZonedTime(fetchFromKey, USER_TIMEZONE)
      const result = await yf.chart(symbol, { period1, period2: new Date(), interval: '1d' })
      const map = new Map<string, number>()
      for (const row of result.quotes ?? []) {
        if (row.close == null || !row.date) continue
        const dateKey = ist_date_key(row.date)
        map.set(dateKey, row.close)
      }
      const envelope: EtfHistoryEnvelope = { from: fetchFromKey, fetched_on: todayKey, prices: Object.fromEntries(map) }
      await redis.setex(cacheKey, ETF_HISTORY_TTL, JSON.stringify(envelope))
      return map
    } catch (err) {
      logger.error({ err, symbol }, 'Error fetching ETF history')
      return new Map<string, number>()
    }
  })().finally(() => inFlightEtfHistory.delete(inFlightKey))

  inFlightEtfHistory.set(inFlightKey, fetchPromise)
  return fetchPromise
}

export type PriceLookup = (date: Date) => number | null

function build_lookup_from_history(history: Map<string, number> | null): PriceLookup {
  if (!history || history.size === 0) return () => null

  const sortedKeys = Array.from(history.keys()).sort()
  const prices = sortedKeys.map(k => history.get(k)!)

  return (date: Date): number | null => {
    const dateKey = ist_date_key(date)
    const exact = history.get(dateKey)
    if (exact !== undefined) return exact

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
      cacheable.push({ dedupKey, type, ticker, redisKey: etf_history_key(ticker) })
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

    const todayKey = ist_date_key(new Date())
    const earliestKey = ist_date_key(earliestDate)
    const misses: Cacheable[] = []
    for (let i = 0; i < cacheable.length; i++) {
      const c = cacheable[i]
      const raw = values[i]
      if (raw === null) {
        misses.push(c)
        continue
      }
      if (raw === 'null') {
        lookups.set(c.dedupKey, () => null)
        continue
      }
      try {
        if (c.type === 'mf') {
          const obj = JSON.parse(raw) as Record<string, number>
          lookups.set(c.dedupKey, build_lookup_from_history(new Map(Object.entries(obj))))
        } else {
          // ETF/shares entries are envelopes; stale or too-shallow blobs go through the
          // miss path, which widens and refreshes the stored range.
          const env = JSON.parse(raw) as EtfHistoryEnvelope
          if (etf_envelope_hit(env, earliestKey, todayKey)) {
            lookups.set(c.dedupKey, build_lookup_from_history(new Map(Object.entries(env.prices))))
          } else {
            misses.push(c)
          }
        }
      } catch (err) {
        logger.error({ err, redisKey: c.redisKey }, 'Failed to parse cached history; refetching')
        misses.push(c)
      }
    }

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
