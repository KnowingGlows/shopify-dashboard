'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Lock, Mail, Loader2 } from 'lucide-react';

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#060a12]">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(34,211,238,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.06)_0%,transparent_50%)]" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="flex flex-col items-center gap-8 rounded-3xl border border-border/50 bg-card/40 p-8 shadow-[0_0_60px_rgba(15,23,42,0.5)] backdrop-blur">
          {/* V monogram */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-cyan-400/30 bg-cyan-400/5 shadow-[0_0_30px_rgba(34,211,238,0.15)]">
              <span className="text-3xl font-bold tracking-wider text-cyan-400 select-none">
                V
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <h1 className="text-xl font-semibold uppercase tracking-[0.4em] text-foreground">
                Vaultik
              </h1>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Authenticate to continue
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="h-11 w-full rounded-xl border border-border/60 bg-background/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="h-11 w-full rounded-xl border border-border/60 bg-background/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              <span className="ml-2">
                {loading ? 'Authenticating...' : 'Unlock dashboard'}
              </span>
            </Button>
          </form>

          {/* Footer */}
          <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground/40">
            Secure session · 7-day validity
          </p>
        </div>
      </div>
    </div>
  );
}
