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
