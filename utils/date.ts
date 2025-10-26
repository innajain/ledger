import { parse } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export function get_date_obj_from_indian_date(dateStr: string): Date {
  const parsed = parse(dateStr, 'dd-MM-yyyy', new Date());
  return fromZonedTime(parsed, 'Asia/Kolkata');
}

export function get_indian_date_from_date_obj(date: Date): string {
  return formatInTimeZone(date, 'Asia/Kolkata', 'dd-MM-yyyy');
}

export function getCurrentIndianDate(): string {
  return formatInTimeZone(new Date(), 'Asia/Kolkata', 'dd-MM-yyyy');
}
