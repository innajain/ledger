'use client'

import { useEffect, useState } from 'react'
import { format_datetime } from '@/app/_utils/format_date'

/**
 * Hydration-safe client rendering of the app's one date style ("23 Aug 2026, 5:40 PM"):
 * the text is filled in after mount so the server never guesses the viewer's clock.
 */
export function LocalDateTime({ value }: { value: string | Date }) {
  const [text, setText] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(format_datetime(value))
  }, [value])

  return <span>{text}</span>
}
