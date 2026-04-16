import yahooFinance from 'yahoo-finance2'
import axios from 'axios'
import { parse } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { get_indian_date_from_date_obj, get_date_obj_from_indian_date } from './date'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
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

export async function get_latest_etf_or_shares_price(symbol: string) {
  const cacheKey = `price:etf:${symbol}`

  try {
    // Check Redis cache
    const cached = await redis.get(cacheKey)
    if (cached) {
      const data = JSON.parse(cached) as PriceData
      return { date: new Date(data.date), close: data.price }
    }

    // Fetch from Yahoo Finance
    const result = await yf.quote(symbol)
    let date = result.regularMarketTime as Date
    date.setHours(0, 0, 0, 0) // Normalize to start of the day
    date = fromZonedTime(date, 'Asia/Kolkata')
    const priceData = { price: result.regularMarketPrice!, date }

    // Cache in Redis with 2-day TTL
    await redis.setex(cacheKey, 2 * 24 * 60 * 60, JSON.stringify(priceData))

    return { date, close: result.regularMarketPrice as number }
  } catch (err) {
    console.error('Error fetching latest price:', err)
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
  const response = await axios.get(url)
  const data = response.data as string

  const lines = data.split('\n')
  const pipeline = redis.pipeline()
  let count = 0

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
        const istDate = fromZonedTime(localDate, 'Asia/Kolkata')

        if (isinGrowth && isinGrowth !== '-' && isinSet.has(isinGrowth)) {
          const navData = { isin: isinGrowth, schemeName, nav, date: istDate }
          const cacheKey = `price:nav:${isinGrowth}`
          // Cache in Redis with 2-day TTL
          pipeline.setex(cacheKey, 2 * 24 * 60 * 60, JSON.stringify(navData))
          count++
        }

        if (isinReinvestment && isinReinvestment !== '-' && isinSet.has(isinReinvestment)) {
          const navData = { isin: isinReinvestment, schemeName, nav, date: istDate }
          const cacheKey = `price:nav:${isinReinvestment}`
          // Cache in Redis with 2-day TTL
          pipeline.setex(cacheKey, 2 * 24 * 60 * 60, JSON.stringify(navData))
          count++
        }
      }
    }
  }

  await pipeline.exec()
  return count
}

export async function get_nav({ code }: { code: string }): Promise<NAVData | null> {
  const cacheKey = `price:nav:${code}`

  try {
    // Check Redis cache (populated by a daily cron job)
    const cached = await redis.get(cacheKey)
    if (cached) {
      const data = JSON.parse(cached) as NAVData
      return { ...data, date: new Date(data.date) }
    }

    console.warn(
      `Cache miss for NAV code: ${code}. The daily cron sync might be delayed or the code is invalid. Attempting to run cron job manually...`,
    )

    try {
      await sync_nav()

      const cachedRetry = await redis.get(cacheKey)
      if (cachedRetry) {
        const data = JSON.parse(cachedRetry) as NAVData
        return { ...data, date: new Date(data.date) }
      }
    } catch (retryError) {
      console.error('Failed to run sync_nav manually:', retryError)
    }

    return null
  } catch (error) {
    console.error(`Failed to fetch NAV for CODE ${code} from cache:`, error)
    return null
  }
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
    console.error(`Error fetching price for ${type} with CODE ${code}:`, error)
  }
  return null
}
