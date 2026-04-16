import { NextResponse } from 'next/server'
import axios from 'axios'
import { parse } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { Prisma } from '@/generated/prisma/client'
import { redis } from '@/lib/redis'

export async function GET(request: Request) {
  // Validate request to ensure it's Vercel calling
  const authHeader = request.headers.get('authorization')
  
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error(`Cron Auth Failed: authHeader=${authHeader}, EXPECTED=Bearer \${process.env.CRON_SECRET ? '***' : 'UNDEFINED'}`);
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const url = 'https://www.amfiindia.com/spages/NAVAll.txt'
    const response = await axios.get(url)
    const data = response.data as string

    const lines = data.split('\n')
    const pipeline = redis.pipeline()
    let count = 0

    for (const line of lines) {
      const parts = line.split(';')
      if (parts.length >= 6 && parts[0] && !isNaN(Number(parts[0]))) {
        const schemeCode = parts[0]
        const schemeName = parts[3]
        const nav = new Prisma.Decimal(parseFloat(parts[4]) || parts[4]).toNumber()
        const dateStr = parts[5]?.trim()

        if (dateStr) {
          const localDate = parse(dateStr, 'dd-MMM-yyyy', new Date())
          const istDate = fromZonedTime(localDate, 'Asia/Kolkata')
          const navData = { schemeCode, schemeName, nav, date: istDate }

          const cacheKey = `price:nav:${schemeCode}`
          // Cache in Redis with 2-day TTL
          pipeline.setex(cacheKey, 2 * 24 * 60 * 60, JSON.stringify(navData))
          count++
        }
      }
    }

    await pipeline.exec()

    return NextResponse.json({ success: true, count, message: `Synced ${count} NAVs successfully` })
  } catch (error) {
    console.error('CRON sync-nav failed:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
