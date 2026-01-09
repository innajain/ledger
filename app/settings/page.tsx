import { redirect } from 'next/navigation';
import { get_current_user } from '@/app/_actions/auth';
import ClientPage from './ClientPage';

export const metadata = {
  title: 'Settings',
};

export default async function SettingsPage() {
  const user = await get_current_user();
  
  if (!user) {
    redirect('/login');
  }

  return <ClientPage user={user} />;
}
