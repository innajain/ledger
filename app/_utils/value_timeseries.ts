import 'server-only'
import { addDays, parseISO } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { get_current_user_id } from '@/app/_actions/auth'
import type { TransactionFull } from './normalize_txn'
import { get_price_lookups_for_assets } from './historical_price_fetcher'
import { asset_type } from '@/generated/prisma/client'
import { build_events, walk_events, ist_date_key, type TimeseriesFilter, type ValuePoint } from './value_timeseries_core'

// The pure valuation walk lives in ./value_timeseries_core (unit tested). This
// module is the server-only shell: it fetches historical prices and caches the
// frozen historical points in Redis.
export { reconcile_timeseries_tail } from './value_timeseries_core'
export type { ValuePoint, TimeseriesFilter } from './value_timeseries_core'

const VERSION_KEY = (user_id: string) => `timeseries_version:${user_id}`
const FROZEN_KEY = (user_id: string, kind: string, id: string) => `timeseries_frozen:${user_id}:${kind}:${id}`

export async function invalidate_timeseries(user_id: string): Promise<void> {
  await redis.incr(VERSION_KEY(user_id))
}

function entity_id_for_filter(filter: TimeseriesFilter): string {
  if (filter.kind === 'asset') return filter.asset_id
  if (filter.kind === 'account') return filter.accounting_head_id
  return filter.allocation_id
}

async function compute_value_timeseries_uncached(
  transactions: TransactionFull[],
  filter: TimeseriesFilter,
  assets: { id: string; type: asset_type; ticker: string | null }[],
  mode: 'all' | 'today-only',
): Promise<ValuePoint[]> {
  const events = build_events(transactions, filter)
  if (events.length === 0) return []
  const priceLookups = await get_price_lookups_for_assets(assets, events[0].date)
  return walk_events(events, filter, priceLookups, assets, mode)
}

type FrozenCache = { version: number; upToDate: string; points: ValuePoint[] }

/**
 * Indefinite-cache wrapper. Strategy:
 *   - Frozen historical points (everything before today) are stored in Redis
 *     at a stable (version-less) key, with the current user version embedded
 *     in the cached value. A version bump on mutation causes the embedded
 *     `version` to mismatch on the next read, forcing a recompute. This lets
 *     us fetch the version *and* the cache in a single MGET instead of two
 *     sequential GETs (the old per-version key required knowing the version
 *     first).
 *   - Today's point is recomputed each call (cheap). The chart's caller then
 *     overrides this with live values from the InfoCard.
 *   - On a stale cache (user skipped days), discard and recompute fully.
 */
export async function compute_value_timeseries(
  transactions: TransactionFull[],
  filter: TimeseriesFilter,
  assets: { id: string; type: asset_type; ticker: string | null }[],
): Promise<ValuePoint[]> {
  const user_id = await get_current_user_id()
  if (!user_id) return compute_value_timeseries_uncached(transactions, filter, assets, 'all')

  try {
    const cacheKey = FROZEN_KEY(user_id, filter.kind, entity_id_for_filter(filter))
    const [versionRaw, cachedRaw] = await redis.mget(VERSION_KEY(user_id), cacheKey)
    const version = versionRaw ? parseInt(versionRaw, 10) : 0

    const todayKey = ist_date_key(new Date())
    const yesterdayKey = ist_date_key(fromZonedTime(addDays(parseISO(todayKey), -1), USER_TIMEZONE))

    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as FrozenCache
      if (cached.version === version && cached.upToDate === yesterdayKey) {
        // Hot path: only recompute today.
        const todayPoints = await compute_value_timeseries_uncached(transactions, filter, assets, 'today-only')
        return [...cached.points, ...todayPoints]
      }
      // Stale (either invalidated or user skipped days). Fall through.
    }

    const allPoints = await compute_value_timeseries_uncached(transactions, filter, assets, 'all')
    if (allPoints.length > 0) {
      const last = allPoints[allPoints.length - 1]
      if (last.date === todayKey && allPoints.length > 1) {
        const frozen: FrozenCache = {
          version,
          upToDate: allPoints[allPoints.length - 2].date,
          points: allPoints.slice(0, -1),
        }
        // Indefinite cache: no TTL. Invalidated by version bump (mismatch on read).
        await redis.set(cacheKey, JSON.stringify(frozen))
      }
    }
    return allPoints
  } catch (err) {
    logger.warn({ err }, 'timeseries cache failed; falling back to uncached compute')
    return compute_value_timeseries_uncached(transactions, filter, assets, 'all')
  }
}
