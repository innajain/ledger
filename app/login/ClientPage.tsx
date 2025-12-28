'use client';
import React, { useState } from 'react';
import type { user } from '@/generated/prisma/client';
import { log_in, sign_up, log_out } from '@/app/_actions/auth';
import { useRouter } from 'next/navigation';

type Props = { user: user | null };

export default function ClientPage({ user }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await log_in({ username, password });
      // navigate to homepage after login
      router.push('/');
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sign_up({ username, password });
      router.push('/');
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    try {
      await log_out();
      window.location.reload();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
            <img src="/favicon.ico" alt="Ledger" className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Ledger</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">Sign in to your account</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-sm text-slate-700 dark:text-slate-300 mb-2">Status</div>
          <div className="text-sm text-slate-900 dark:text-slate-100">
            {user ? (
              <span>Signed in as <strong>{user.username}</strong></span>
            ) : (
              <span className="italic text-slate-600 dark:text-slate-400">Not signed in</span>
            )}
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Username</label>
            <input
              name="username"
              placeholder="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-md focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 dark:text-slate-300 mb-1">Password</label>
            <input
              name="password"
              placeholder="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-md focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Signing in...' : 'Login'}
            </button>

            <button
              type="button"
              onClick={handleSignup}
              disabled={loading}
              className="px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Working...' : 'Sign up'}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="ml-auto px-3 py-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-md border border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-60 transition-colors"
            >
              Logout
            </button>
          </div>
        </form>

        {error ? <div className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
      </div>
    </div>
  );
}
