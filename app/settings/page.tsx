'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound, Lock, RefreshCw, ShieldCheck, User, Link2 } from 'lucide-react';

const allowedEmail = 'tsovansh@gmail.com';
const allowedPassword = 'Sovansh@1234';

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState('');
  const [storeHandle, setStoreHandle] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [storeStatus, setStoreStatus] = useState<{
    type: 'idle' | 'saving' | 'success' | 'error';
    message?: string;
  }>({ type: 'idle' });
  const [stores, setStores] = useState<
    Array<{
      handle: string;
      domain: string;
      lastTokenRefresh: string | null;
      tokenExpiresAt: string | null;
    }>
  >([]);
  const [envStores, setEnvStores] = useState<Array<{ name: string; domain: string }>>([]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const matches = email.trim() === allowedEmail && password === allowedPassword;

    if (matches) {
      setIsAuthorized(true);
      setError('');
      return;
    }

    setIsAuthorized(false);
    setError('Access denied. Double check the email and password.');
  };

  const handleSignOut = () => {
    setIsAuthorized(false);
    setEmail('');
    setPassword('');
    setError('');
  };

  const loadStores = async () => {
    try {
      const response = await fetch('/api/stores');
      const result = await response.json();
      setStores(result.stores ?? []);
      setEnvStores(result.envStores ?? []);
    } catch (err) {
      console.error('Failed to load stores:', err);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      loadStores();
    }
  }, [isAuthorized]);

  const handleStoreSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStoreStatus({ type: 'saving', message: 'Requesting new access token...' });

    try {
      const response = await fetch('/api/stores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle: storeHandle,
          clientId,
          clientSecret,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to register store.');
      }
      setStoreStatus({ type: 'success', message: 'Access token refreshed.' });
      setStoreHandle('');
      setClientId('');
      setClientSecret('');
      loadStores();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register store.';
      setStoreStatus({ type: 'error', message });
    }
  };

  const formatTimestamp = (value: string | null) =>
    value ? new Date(value).toLocaleString('en-IN') : '—';

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8">
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Settings access
          </div>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Settings
            </h1>
            <p className="text-muted-foreground mt-2">
              Secure the dashboard before adjusting integrations and access.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Lock className="h-5 w-5 text-primary" />
                Auth gate
              </CardTitle>
              <CardDescription>
                Only approved credentials can view settings controls.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isAuthorized ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    Access granted. Settings are now unlocked.
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                        Sync cadence
                      </div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        Every 10 minutes
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                        Store access
                      </div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        Kairova, Mavric
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                        Alerts
                      </div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        Revenue spikes enabled
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSignOut}
                    className="mt-2 w-full border-border/60 bg-background/60"
                  >
                    Sign out
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Email
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <User className="h-4 w-4" />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Enter your email"
                        className="h-11 w-full rounded-xl border border-border/60 bg-background/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        autoComplete="username"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Password
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <Lock className="h-4 w-4" />
                      </span>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        className="h-11 w-full rounded-xl border border-border/60 bg-background/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                  {error ? (
                    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                      {error}
                    </div>
                  ) : null}
                  <Button type="submit" className="w-full">
                    Unlock settings
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
            <CardHeader>
              <CardTitle>Security notes</CardTitle>
              <CardDescription>Quick reminders for safe access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                Credentials are checked locally for now. Wire this up to a real auth provider
                when you are ready to lock the entire app.
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                Access is currently limited to the approved email and password combination.
              </div>
            </CardContent>
          </Card>
        </div>

        {isAuthorized ? (
          <div className="grid gap-6">
            <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Shopify access tokens
                </CardTitle>
                <CardDescription>
                  Enter the store handle, client ID, and client secret to refresh the token
                  every 23 hours.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleStoreSubmit} className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2 md:col-span-1">
                    <label className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Store handle
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <Link2 className="h-4 w-4" />
                      </span>
                      <input
                        value={storeHandle}
                        onChange={(event) => setStoreHandle(event.target.value)}
                        placeholder="cvcd0m-e6"
                        className="h-11 w-full rounded-xl border border-border/60 bg-background/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        autoComplete="off"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Token URL: https://{storeHandle || 'store'}.myshopify.com/admin/oauth/access_token
                    </p>
                  </div>
                  <div className="space-y-2 md:col-span-1">
                    <label className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Client ID
                    </label>
                    <input
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      placeholder="Client ID"
                      className="h-11 w-full rounded-xl border border-border/60 bg-background/60 px-4 text-sm text-foreground placeholder:text-muted-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-1">
                    <label className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      Client secret
                    </label>
                    <input
                      type="password"
                      value={clientSecret}
                      onChange={(event) => setClientSecret(event.target.value)}
                      placeholder="Client secret"
                      className="h-11 w-full rounded-xl border border-border/60 bg-background/60 px-4 text-sm text-foreground placeholder:text-muted-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      autoComplete="off"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Button type="submit" className="w-full">
                      <RefreshCw className="h-4 w-4" />
                      Refresh access token
                    </Button>
                  </div>
                </form>
                {storeStatus.type !== 'idle' ? (
                  <div
                    className={`rounded-2xl border px-4 py-2 text-xs ${
                      storeStatus.type === 'success'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                        : storeStatus.type === 'error'
                          ? 'border-destructive/40 bg-destructive/10 text-destructive'
                          : 'border-border/50 bg-background/60 text-muted-foreground'
                    }`}
                  >
                    {storeStatus.message}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
              <CardHeader>
                <CardTitle>Registered stores</CardTitle>
                <CardDescription>Tokens auto-refresh on demand every 23 hours.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {stores.length === 0 ? (
                  <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                    No stores registered yet.
                  </div>
                ) : (
                  stores.map((store) => (
                    <div
                      key={store.handle}
                      className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3"
                    >
                      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                        {store.handle}
                      </div>
                      <div className="mt-2 text-sm text-foreground">{store.domain}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Last token refresh: {formatTimestamp(store.lastTokenRefresh)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Expires: {formatTimestamp(store.tokenExpiresAt)}
                      </div>
                    </div>
                  ))
                )}
                {envStores.length > 0 ? (
                  <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3 text-xs text-muted-foreground">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      Environment stores
                    </div>
                    {envStores.map((store) => (
                      <div key={store.domain} className="mt-2 flex items-center justify-between">
                        <span>{store.name}</span>
                        <span className="text-foreground">{store.domain}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
