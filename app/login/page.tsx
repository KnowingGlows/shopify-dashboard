'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Lock, Mail, Loader2, Globe } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    if (!result.success) {
      setError(result.error || 'Login failed.');
    }
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#09090b]">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(167,139,250,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.10)_0%,transparent_60%)]" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="flex flex-col items-center gap-7 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-[0_0_80px_rgba(167,139,250,0.06)] backdrop-blur-xl">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-[0_0_30px_rgba(167,139,250,0.2)]">
              <Globe className="h-8 w-8 text-primary" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <h1 className="text-xl font-semibold tracking-[0.3em] text-white">
                ORBIT
              </h1>
              <p className="text-[11px] tracking-wide text-zinc-400">
                Sign in to your workspace
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-zinc-400">
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 transition focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white/[0.06]"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-medium text-zinc-400">
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 transition focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white/[0.06]"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[12px] text-red-400">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11 mt-1 text-[13px] font-medium" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              <span className="ml-2">
                {loading ? 'Signing in...' : 'Sign in'}
              </span>
            </Button>
          </form>

          <div className="flex flex-col items-center gap-3">
            <Link
              href="/signup"
              className="text-[12px] font-medium text-zinc-400 transition hover:text-primary"
            >
              Don&apos;t have access? <span className="text-primary">Request it</span>
            </Link>
            <p className="text-[10px] text-zinc-600">
              Secure session &middot; 7-day validity
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
