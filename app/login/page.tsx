import ClientPage from './ClientPage';
import { get_current_user } from '@/app/_actions/auth';

export default async function Page() {
  const user = await get_current_user();
  return <ClientPage user={user} />;
}
