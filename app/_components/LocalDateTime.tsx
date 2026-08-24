import { format_datetime } from '@/app/_utils/format_date'

/**
 * The app's one date style ("23 Aug 2026, 5:40 PM"), pinned to USER_TIMEZONE so the
 * server and client render the same string — dates appear in the SSR HTML instead of
 * filling in after hydration (which blanked every date cell and caused layout shift).
 */
export function LocalDateTime({ value }: { value: string | Date }) {
  return <span>{format_datetime(value)}</span>
}
