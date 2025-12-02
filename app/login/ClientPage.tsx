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
    <div>
      <h1>Login</h1>
      <div>{user ? `Signed in: ${user.username}` : 'Not signed in'}</div>

      <form onSubmit={handleLogin}>
        <input name="username" placeholder="username" value={username} onChange={e => setUsername(e.target.value)} />
        <input name="password" placeholder="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit" disabled={loading}>
          Login
        </button>
      </form>

      <form onSubmit={handleSignup}>
        <input name="username" placeholder="username" value={username} onChange={e => setUsername(e.target.value)} />
        <input name="password" placeholder="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit" disabled={loading}>
          Sign up
        </button>
      </form>

      <div>
        <button type="button" onClick={handleLogout} disabled={loading}>
          Logout
        </button>
      </div>

      {error ? <div style={{ color: 'red' }}>{error}</div> : null}
    </div>
  );
}
