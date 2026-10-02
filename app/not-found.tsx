import type { Metadata } from 'next'
import { NotFound } from '@/app/_components/NotFound'

export const metadata: Metadata = { title: 'Not found' }

export default function RootNotFound() {
  return <NotFound showStatus description="There's nothing at this address. Check the link, or start again from home." />
}
