import ClientPage from './ClientPage'
import { get_current_user } from '@/app/_actions/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login',
  description: 'Sign in to your ledger account',
}

export default async function Page() {
  const user = await get_current_user()
  return <ClientPage user={user} />
}
