'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound, RefreshCw, Settings, Store,
  Check, Loader2, AlertCircle, Pencil,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

interface StoreInfo {
  handle: string;
  domain: string;
  displayName: string | null;
  lastTokenRefresh: string | null;
  tokenExpiresAt: string | null;
}

export default function SettingsPage() {
  const [storeHandle, setStoreHandle] = useState('');
  const [storeDisplayName, setStoreDisplayName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [storeStatus, setStoreStatus] = useState<{
    type: 'idle' | 'saving' | 'success' | 'error';
    message?: string;
  }>({ type: 'idle' });
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [storeEdits, setStoreEdits] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState<string | null>(null);

  const loadStores = async () => {
    try {
      const response = await fetch('/api/stores');
      const result = await response.json();
      setStores(result.stores ?? []);
      const editMap: Record<string, string> = {};
      (result.stores ?? []).forEach((store: StoreInfo) => {
        editMap[store.handle] = store.displayName || store.handle;
      });
      setStoreEdits(editMap);
    } catch (err) {
      console.error('Failed to load stores:', err);
    }
  };

  useEffect(() => { loadStores(); }, []);

  const handleStoreSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStoreStatus({ type: 'saving', message: 'Requesting new access token...' });
    try {
      const response = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: storeHandle,
          displayName: storeDisplayName,
          clientId,
          clientSecret,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to register store.');
      setStoreStatus({ type: 'success', message: 'Access token refreshed successfully.' });
      setStoreHandle(''); setStoreDisplayName(''); setClientId(''); setClientSecret('');
      loadStores();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register store.';
      setStoreStatus({ type: 'error', message });
    }
  };

  const handleStoreNameUpdate = async (handle: string) => {
    setSavingName(handle);
    try {
      const response = await fetch('/api/stores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, displayName: storeEdits[handle] ?? '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update.');
      loadStores();
    } catch (err) {
      console.error('Failed to update store name:', err);
    } finally {
      setSavingName(null);
    }
  };

  const formatTimestamp = (value: string | null) =>
    value ? new Date(value).toLocaleString('en-IN') : '—';

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-[11px] text-muted-foreground">Store integrations & access tokens</p>
      </div>

      {/* Token Refresh Form */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <KeyRound className="h-3.5 w-3.5 text-primary" />
          <div>
            <h2 className="text-sm font-medium text-foreground">Shopify Access Tokens</h2>
            <p className="text-[10px] text-muted-foreground">Enter credentials to refresh the token (auto-refreshes every 23h)</p>
          </div>
        </div>

        <form onSubmit={handleStoreSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Store Handle">
              <input
                value={storeHandle}
                onChange={(e) => setStoreHandle(e.target.value)}
                placeholder="your-store-handle"
                className="form-input"
                autoComplete="off"
              />
            </FormField>
            <FormField label="Display Name">
              <input
                value={storeDisplayName}
                onChange={(e) => setStoreDisplayName(e.target.value)}
                placeholder="Brand name"
                className="form-input"
                autoComplete="off"
              />
            </FormField>
            <FormField label="Client ID">
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Client ID"
                className="form-input"
                autoComplete="off"
              />
            </FormField>
            <FormField label="Client Secret">
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Client secret"
                className="form-input"
                autoComplete="off"
              />
            </FormField>
          </div>

          {storeHandle && (
            <p className="text-[10px] text-muted-foreground/60">
              Token URL: https://{storeHandle}.myshopify.com/admin/oauth/access_token
            </p>
          )}

          <button
            type="submit"
            disabled={storeStatus.type === 'saving'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {storeStatus.type === 'saving' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh Access Token
          </button>

          <AnimatePresence>
            {storeStatus.type !== 'idle' && storeStatus.type !== 'saving' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
                  storeStatus.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-red-500/30 bg-red-500/5'
                }`}
              >
                {storeStatus.type === 'success' ? (
                  <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                )}
                <p className={`text-[11px] ${storeStatus.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {storeStatus.message}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </motion.div>

      {/* Registered Stores */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center gap-2 mb-3">
          <Store className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Registered Stores</p>
          <span className="text-[11px] text-muted-foreground">({stores.length})</span>
        </div>

        {stores.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 py-10 text-center">
            <Store className="mx-auto h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-[12px] text-muted-foreground">No stores registered yet</p>
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stores.map((store) => (
              <StaggerItem key={store.handle}>
                <div className="card-hover-glow rounded-xl border border-border bg-card p-4 space-y-3">
                  {/* Store header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">{store.displayName || store.handle}</p>
                      <p className="text-[11px] text-muted-foreground">{store.domain}</p>
                    </div>
                    <div className={`h-2 w-2 rounded-full ${store.tokenExpiresAt && new Date(store.tokenExpiresAt) > new Date() ? 'bg-emerald-400' : 'bg-amber-400'}`} title={store.tokenExpiresAt && new Date(store.tokenExpiresAt) > new Date() ? 'Token active' : 'Token may be expired'} />
                  </div>

                  {/* Edit name */}
                  <div className="flex items-center gap-2">
                    <input
                      value={storeEdits[store.handle] ?? store.displayName ?? store.handle}
                      onChange={(e) => setStoreEdits((prev) => ({ ...prev, [store.handle]: e.target.value }))}
                      className="form-input flex-1 text-[12px]"
                      placeholder="Display name"
                    />
                    <button
                      onClick={() => handleStoreNameUpdate(store.handle)}
                      disabled={savingName === store.handle}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] font-medium text-foreground hover:bg-accent transition disabled:opacity-50"
                    >
                      {savingName === store.handle ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Pencil className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  {/* Token info */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Last Refresh</p>
                      <p className="text-[11px] text-foreground tabular-nums">{formatTimestamp(store.lastTokenRefresh)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Expires</p>
                      <p className="text-[11px] text-foreground tabular-nums">{formatTimestamp(store.tokenExpiresAt)}</p>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}
      </motion.div>
    </PageTransition>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
