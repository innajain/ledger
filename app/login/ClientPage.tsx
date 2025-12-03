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
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <img src="/favicon.ico" alt="Ledger" className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ledger</h1>
            <p className="text-sm text-slate-600">Sign in to your account</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-sm text-slate-700 mb-2">Status</div>
          <div className="text-sm text-slate-900">
            {user ? (
              <span>Signed in as <strong>{user.username}</strong></span>
            ) : (
              <span className="italic text-slate-600">Not signed in</span>
            )}
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-sm text-slate-700 mb-1">Username</label>
            <input
              name="username"
              placeholder="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="block w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-200 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">Password</label>
            <input
              name="password"
              placeholder="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="block w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-200 outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Login'}
            </button>

            <button
              type="button"
              onClick={handleSignup}
              disabled={loading}
              className="px-4 py-2 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? 'Working...' : 'Sign up'}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="ml-auto px-3 py-2 text-sm text-red-700 bg-red-50 rounded-md border border-red-100 hover:bg-red-100 disabled:opacity-60"
            >
              Logout
            </button>
          </div>
        </form>

        {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
      </div>
    </div>
  );
}
