import { parse } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'

export function get_date_obj_from_indian_date(dateStr: string): Date {
  const parsed = parse(dateStr, 'dd-MM-yyyy', new Date())
  return fromZonedTime(parsed, USER_TIMEZONE)
}

export function get_indian_date_from_date_obj(date: Date): string {
  return formatInTimeZone(date, USER_TIMEZONE, 'dd-MM-yyyy')
}

// Start of the IST day after the given instant's IST day — the exclusive
// cutoff for "on or before this day". IST has no DST, so +24h is exact.
export function next_ist_midnight(date: Date): Date {
  return new Date(get_date_obj_from_indian_date(get_indian_date_from_date_obj(date)).getTime() + 24 * 60 * 60 * 1000)
}
