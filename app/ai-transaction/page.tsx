import { get_current_user } from '@/app/_actions/auth';
import { redirect } from 'next/navigation';
import ClientPage from './ClientPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Transaction',
  description: 'Create transactions using AI assistance',
};

export default async function AITransactionPage() {
  const user = await get_current_user();
  
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">AI Transaction Entry</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">Use natural language to create transactions</p>
      </div>
      
      <ClientPage />
    </div>
  );
}
