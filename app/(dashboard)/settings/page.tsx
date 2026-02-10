'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound, RefreshCw, ShieldCheck, Link2 } from 'lucide-react';

export default function SettingsPage() {
  const [storeHandle, setStoreHandle] = useState('');
  const [storeDisplayName, setStoreDisplayName] = useState('');
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
      displayName: string | null;
      lastTokenRefresh: string | null;
      tokenExpiresAt: string | null;
    }>
  >([]);
  const [storeEdits, setStoreEdits] = useState<Record<string, string>>({});

  const loadStores = async () => {
    try {
      const response = await fetch('/api/stores');
      const result = await response.json();
      setStores(result.stores ?? []);
      const editMap: Record<string, string> = {};
      (result.stores ?? []).forEach((store: { handle: string; displayName?: string }) => {
        editMap[store.handle] = store.displayName || store.handle;
      });
      setStoreEdits(editMap);
    } catch (err) {
      console.error('Failed to load stores:', err);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

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
          displayName: storeDisplayName,
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
      setStoreDisplayName('');
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

  const handleStoreNameUpdate = async (handle: string) => {
    try {
      const response = await fetch('/api/stores', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          handle,
          displayName: storeEdits[handle] ?? '',
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update store name.');
      }
      loadStores();
    } catch (err) {
      console.error('Failed to update store name:', err);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8">
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Settings
          </div>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Settings
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage your store integrations and access tokens.
            </p>
          </div>
        </div>

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
              <form onSubmit={handleStoreSubmit} className="grid gap-4 md:grid-cols-4">
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
                      placeholder="your-store-handle"
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
                    Store name
                  </label>
                  <input
                    value={storeDisplayName}
                    onChange={(event) => setStoreDisplayName(event.target.value)}
                    placeholder="Display name"
                    className="h-11 w-full rounded-xl border border-border/60 bg-background/60 px-4 text-sm text-foreground placeholder:text-muted-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    autoComplete="off"
                  />
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
                <div className="md:col-span-4">
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
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={storeEdits[store.handle] ?? store.displayName ?? store.handle}
                        onChange={(event) =>
                          setStoreEdits((prev) => ({
                            ...prev,
                            [store.handle]: event.target.value,
                          }))
                        }
                        className="h-9 flex-1 rounded-xl border border-border/60 bg-background/70 px-3 text-xs text-foreground shadow-[0_0_18px_rgba(15,23,42,0.2)]"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleStoreNameUpdate(store.handle)}
                        className="h-9 border-border/60 bg-background/70 text-[11px] uppercase tracking-[0.2em]"
                      >
                        Save name
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Last token refresh: {formatTimestamp(store.lastTokenRefresh)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Expires: {formatTimestamp(store.tokenExpiresAt)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
