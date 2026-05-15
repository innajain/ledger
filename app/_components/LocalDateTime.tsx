'use client'

import { useEffect, useState } from 'react'

function ordinal(n: number): string {
  const k = n % 100
  if (k >= 11 && k <= 13) return n + 'th'
  switch (n % 10) {
    case 1:
      return n + 'st'
    case 2:
      return n + 'nd'
    case 3:
      return n + 'rd'
    default:
      return n + 'th'
  }
}

function format(d: Date): string {
  const day = ordinal(d.getDate())
  const month = d.toLocaleString('en-US', { month: 'long' })
  const year = d.getFullYear()
  const h = d.getHours()
  const minutes = d.getMinutes().toString().padStart(2, '0')
  const period = h < 12 ? 'AM' : 'PM'
  // midnight renders as "0", noon as "12"
  const hour12 = h === 0 ? 0 : h <= 12 ? h : h - 12
  return `${day} ${month} ${year}, ${hour12}:${minutes} ${period}`
}

export function LocalDateTime({ value }: { value: string | Date }) {
  const [text, setText] = useState('')

  useEffect(() => {
    // Format client-side to avoid SSR/CSR timezone mismatches.
    const d = new Date(value)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(isNaN(d.getTime()) ? '' : format(d))
  }, [value])

  return <span suppressHydrationWarning>{text}</span>
}
