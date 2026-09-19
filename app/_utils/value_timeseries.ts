import 'server-only'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { get_ancestor_head_ids } from './head_tree'
import { logger } from '@/lib/logger'
import { get_current_user_id } from '@/app/_actions/auth'
import type { NormalizedTransaction } from './normalize_txn'
import { get_price_lookups_for_assets } from './historical_price_fetcher'
import { asset_type } from '@/generated/prisma/client'
import { build_events, walk_events, ist_date_key, prev_day_key, type TimeseriesFilter, type ValuePoint } from './value_timeseries_core'

export { reconcile_timeseries_tail } from './value_timeseries_core'
export type { ValuePoint, TimeseriesFilter } from './value_timeseries_core'

const VERSION_KEY = (user_id: string) => `timeseries_version:${user_id}`
const CASHFLOWS_VERSION_KEY = (user_id: string) => `cashflows_version:${user_id}`
const FROZEN_KEY = (user_id: string, kind: string, id: string) => `timeseries_frozen:${user_id}:${kind}:${id}`
const FROZEN_TTL = 30 * 24 * 60 * 60

/**
 * Heads/assets whose line items a write actually touched — lets invalidation skip unrelated
 * frozen series. earliest_day is the earliest effective IST day (li.datetime ?? txn.datetime)
 * across the write's line items; when it is today, frozen series (which never cover today)
 * are provably unaffected. Absent means unknown — invalidate conservatively.
 */
export type TouchedEntities = { head_ids: Iterable<string>; asset_ids: Iterable<string>; earliest_day?: string }

export function timeseries_version_key(user_id: string): string {
  return VERSION_KEY(user_id)
}

export function cashflows_version_key(user_id: string): string {
  return CASHFLOWS_VERSION_KEY(user_id)
}

/**
 * The touched heads plus every ancestor of each. A line item on a head changes that
 * head's own series *and* the subtree series of every head above it — an ancestor's
 * "including sub-heads" chart covers the write even though the write never names it.
 * One slim read on a write path, which is far rarer than the reads it keeps cacheable.
 */
async function with_ancestors(user_id: string, head_ids: Iterable<string>): Promise<Set<string>> {
  const seeds = new Set(head_ids)
  if (seeds.size === 0) return seeds
  const heads = await prisma.accounting_head.findMany({ where: { user_id }, select: { id: true, parent_id: true } })
  return get_ancestor_head_ids(seeds, heads)
}

export async function invalidate_timeseries(user_id: string, touched?: TouchedEntities): Promise<void> {
  // The cashflows version backs the home-page XIRR cashflow cache, which is keyed by a
  // subtree of account heads we can't enumerate here — always bump it.
  const ops: Promise<unknown>[] = [redis.incr(CASHFLOWS_VERSION_KEY(user_id))]
  if (touched) {
    // Scoped: DEL just the frozen series the write could have changed. A head id is
    // deleted under both kinds since we don't know its type here, and under both the
    // plain and the `:subtree` scope; deleting a nonexistent key is harmless, and an
    // ancestor's own (non-subtree) series being dropped costs one recompute rather than
    // risking a stale one. A frozen series stores points only up to yesterday
    // (upToDate <= yesterday by construction), so a write whose earliest effective day
    // is today cannot change any frozen point — skip the DELs entirely.
    const frozen_unaffected = touched.earliest_day !== undefined && touched.earliest_day >= ist_date_key(new Date())
    if (!frozen_unaffected) {
      const keys: string[] = []
      for (const h of await with_ancestors(user_id, touched.head_ids)) {
        for (const id of [h, subtree_scope_id(h)]) {
          keys.push(FROZEN_KEY(user_id, 'account', id), FROZEN_KEY(user_id, 'allocation', id))
        }
      }
      for (const a of touched.asset_ids) keys.push(FROZEN_KEY(user_id, 'asset', a))
      if (keys.length > 0) ops.push(redis.del(...keys))
    }
  } else {
    // Coarse fallback: version bump invalidates every frozen series for the user.
    ops.push(redis.incr(VERSION_KEY(user_id)))
  }
  await Promise.all(ops)
}

const subtree_scope_id = (head_id: string) => `${head_id}:subtree`

// Cache identity of a series. A head's own series and its "including sub-heads" series
// are different answers for the same head, so they must not share a key.
function entity_id_for_filter(filter: TimeseriesFilter): string {
  if (filter.kind === 'asset') return filter.asset_id
  const id = filter.kind === 'account' ? filter.accounting_head_id : filter.allocation_id
  return filter.head_ids && filter.head_ids.length > 0 ? subtree_scope_id(id) : id
}

async function compute_value_timeseries_uncached(
  transactions: NormalizedTransaction[],
  filter: TimeseriesFilter,
  assets: { id: string; type: asset_type; ticker: string | null }[],
  mode: 'all' | 'today-only' | { since: string },
): Promise<ValuePoint[]> {
  const events = build_events(transactions, filter)
  if (events.length === 0) return []
  const priceLookups = await get_price_lookups_for_assets(assets, events[0].date)
  return walk_events(events, filter, priceLookups, assets, mode)
}

type FrozenCache = { version: number; upToDate: string; points: ValuePoint[] }

export async function compute_value_timeseries(
  transactions: NormalizedTransaction[],
  filter: TimeseriesFilter,
  assets: { id: string; type: asset_type; ticker: string | null }[],
  explicit_user_id?: string,
): Promise<ValuePoint[]> {
  const user_id = explicit_user_id ?? (await get_current_user_id())
  if (!user_id) return compute_value_timeseries_uncached(transactions, filter, assets, 'all')

  try {
    const cacheKey = FROZEN_KEY(user_id, filter.kind, entity_id_for_filter(filter))
    const [versionRaw, cachedRaw] = await redis.mget(VERSION_KEY(user_id), cacheKey)
    const version = versionRaw ? parseInt(versionRaw, 10) : 0

    const todayKey = ist_date_key(new Date())
    const yesterdayKey = prev_day_key(todayKey)

    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as FrozenCache
      // The frozen prefix stays valid for every day it covers even if the user hasn't
      // visited since — extend it from upToDate instead of requiring a visit yesterday.
      if (cached.version === version && cached.upToDate <= yesterdayKey && cached.points.length > 0) {
        const tailPoints = await compute_value_timeseries_uncached(transactions, filter, assets, { since: cached.upToDate })
        if (tailPoints.length > 0) {
          const allPoints = [...cached.points, ...tailPoints]
          // Advance the frozen prefix when we filled a multi-day gap so the next visit
          // starts from yesterday again. Same-day repeat visits skip the write.
          if (cached.upToDate < yesterdayKey && allPoints[allPoints.length - 1].date === todayKey && allPoints.length > 1) {
            const frozen: FrozenCache = {
              version,
              upToDate: allPoints[allPoints.length - 2].date,
              points: allPoints.slice(0, -1),
            }
            await redis.setex(cacheKey, FROZEN_TTL, JSON.stringify(frozen))
          }
          return allPoints
        }
      }
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

        await redis.setex(cacheKey, FROZEN_TTL, JSON.stringify(frozen))
      }
    }
    return allPoints
  } catch (err) {
    logger.warn({ err }, 'timeseries cache failed; falling back to uncached compute')
    return compute_value_timeseries_uncached(transactions, filter, assets, 'all')
  }
}
