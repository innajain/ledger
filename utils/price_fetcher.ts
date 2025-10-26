import yahooFinance from 'yahoo-finance2';
import axios from 'axios';
import { parse } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { get_indian_date_from_date_obj, get_date_obj_from_indian_date } from './date';
import redis from './redis';
import { asset_type } from '@/generated/prisma';

type NAVData = {
  schemeCode: string;
  schemeName: string;
  nav: number;
  date: Date;
};

type PriceData = {
  price: number;
  date: Date;
};

const CACHE_DURATION = 60 * 60; // 1 hour in seconds

export async function get_latest_etf_price(symbol: string) {
  const cacheKey = `price:etf:${symbol}`;

  try {
    // Check Redis cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached) as PriceData;
      return { date: new Date(data.date), close: data.price };
    }

    // Fetch from Yahoo Finance
    const result = await new yahooFinance().quote(symbol);
    let date = result.regularMarketTime as Date;
    date.setHours(0, 0, 0, 0); // Normalize to start of the day
    date = fromZonedTime(date, 'Asia/Kolkata');
    const priceData = { price: result.regularMarketPrice!, date };

    // Cache in Redis with TTL
    await redis.setex(cacheKey, CACHE_DURATION, JSON.stringify(priceData));

    return { date, close: result.regularMarketPrice as number };
  } catch (err) {
    console.error('Error fetching latest price:', err);
    return null;
  }
}

export async function get_nav({ code }: { code: string }): Promise<NAVData | null> {
  const cacheKey = `price:nav:${code}`;

  try {
    // Check Redis cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached) as NAVData;
      return { ...data, date: new Date(data.date) };
    }

    // Fetch from AMFI
    const url = 'https://www.amfiindia.com/spages/NAVAll.txt';
    const response = await axios.get(url);
    const data = response.data as string;

    const lines = data.split('\n');
    for (const line of lines) {
      if (line.includes(code)) {
        const parts = line.split(';');
        const schemeCode = parts[0];
        const schemeName = parts[3];
        const nav = parseFloat(parts[4]);
        const dateStr = parts[5]?.trim(); // format: 25-Jun-2025
        const localDate = parse(dateStr, 'dd-MMM-yyyy', new Date());
        // Convert to UTC treating the parsed date as IST
        const istDate = fromZonedTime(localDate, 'Asia/Kolkata');
        const navData = { schemeCode, schemeName, nav, date: istDate };

        // Cache in Redis with TTL
        await redis.setex(cacheKey, CACHE_DURATION, JSON.stringify(navData));

        return navData;
      }
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch NAV for CODE ${code}:`, error);
    return null;
  }
}

export async function get_price_for_asset(type: asset_type, code: string | null): Promise<{ price: number; date: Date } | null> {
  try {
    if (type === 'rupees') return { price: 1, date: get_date_obj_from_indian_date(get_indian_date_from_date_obj(new Date())) };
    if (!code) return null;

    if (type === 'mf') {
      const nav_data = await get_nav({ code });
      if (nav_data) {
        return { price: nav_data.nav, date: nav_data.date };
      } else return null;
    } else if (type === 'etf') {
      const price_data = await get_latest_etf_price(code);
      if (price_data) {
        return { price: price_data.close, date: price_data.date };
      } else return null;
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Error fetching price for ${type} with CODE ${code}:`, error);
  }
  return null;
}
