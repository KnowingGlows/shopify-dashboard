'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BackgroundDecor } from '@/components/background-decor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';
import {
  Store, Sparkles, Loader2, TrendingUp, Wallet, Plus, ChevronDown,
  Check, AlertCircle, X, KeyRound, Pencil, Trash2,
} from 'lucide-react';

type StoreDetail = {
  handle: string;
  domain: string;
  displayName: string | null;
  lastTokenRefresh: string | null;
  tokenExpiresAt: string | null;
};

type BrandData = {
  brand: string;
  profit: number;
  cashflow: number;
  adspend: number;
};

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [stores, setStores] = useState<StoreDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add store form state
  const [storeHandle, setStoreHandle] = useState('');
  const [storeDisplayName, setStoreDisplayName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [addStatus, setAddStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({ type: 'idle' });

  // Per-store name edit
  const [storeEdits, setStoreEdits] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deletingStore, setDeletingStore] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [storesRes, pnlRes] = await Promise.all([fetch('/api/stores'), fetch('/api/pnl')]);
      const storesData = await storesRes.json();
      const pnlData = await pnlRes.json();

      const storeList: StoreDetail[] = storesData.stores ?? [];
      setStores(storeList);

      const editMap: Record<string, string> = {};
      storeList.forEach((s) => { editMap[s.handle] = s.displayName || s.handle; });
      setStoreEdits(editMap);

      const entries: BrandData[] = pnlData.entries ?? [];
      setBrands(
        storeList.map((s) => {
          const name = s.displayName || s.handle;
          return entries.find((e) => e.brand === name) ?? { brand: name, profit: 0, cashflow: 0, adspend: 0 };
        })
      );
    } catch {
      setBrands([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAddStore = async (e: FormEvent) => {
    e.preventDefault();
    setAddStatus({ type: 'saving', message: 'Registering store...' });
    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: storeHandle, displayName: storeDisplayName, clientId, clientSecret }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to register store.');
      setAddStatus({ type: 'success', message: 'Store added successfully.' });
      setStoreHandle(''); setStoreDisplayName(''); setClientId(''); setClientSecret('');
      await loadData();
      setTimeout(() => { setShowAddModal(false); setAddStatus({ type: 'idle' }); }, 1500);
    } catch (err) {
      setAddStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to register store.' });
    }
  };

  const handleDeleteStore = async (handle: string) => {
    setDeletingStore(handle);
    try {
      const res = await fetch('/api/stores', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      if (!res.ok) throw new Error('Failed to delete store.');
      setConfirmDelete(null);
      setExpandedStore(null);
      await loadData();
    } catch { /* ignore */ } finally {
      setDeletingStore(null);
    }
  };

  const handleNameUpdate = async (handle: string) => {
    setSavingName(handle);
    try {
      const res = await fetch('/api/stores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, displayName: storeEdits[handle] ?? '' }),
      });
      if (!res.ok) throw new Error('Failed to update.');
      await loadData();
    } catch { /* ignore */ } finally {
      setSavingName(null);
    }
  };

  const fmt = (v: string | null) => v ? new Date(v).toLocaleString('en-IN') : '—';
  const tokenActive = (s: StoreDetail) => !!s.tokenExpiresAt && new Date(s.tokenExpiresAt) > new Date();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <PageTransition className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">

        {/* Header */}
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="flex flex-col gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Brand collection
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">Brands</h1>
                <p className="text-muted-foreground mt-2">Monitor every brand pulse from a single command center.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  {brands.length} active brands
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/90 px-4 py-2.5 text-[12px] font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary hover:shadow-md hover:shadow-primary/25 active:scale-[0.97]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Store
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Store cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : brands.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 py-16 text-center">
            <Store className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No stores registered yet.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary/90 px-4 py-2 text-[12px] font-medium text-primary-foreground transition-all hover:bg-primary"
            >
              <Plus className="h-3.5 w-3.5" /> Add your first store
            </button>
          </div>
        ) : (
          <StaggerContainer className="grid gap-4 md:grid-cols-2">
            {brands.map((brand, i) => {
              const store = stores[i];
              const isExpanded = expandedStore === brand.brand;
              return (
                <StaggerItem key={brand.brand}>
                  <Card className="group relative overflow-hidden border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)] transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_40px_rgba(167,139,250,0.15)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(167,139,250,0.06),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    <CardHeader className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/60 text-primary shadow-[0_0_18px_rgba(167,139,250,0.2)]">
                          <Store className="h-6 w-6" />
                        </span>
                        <div>
                          <CardTitle className="text-2xl">{brand.brand}</CardTitle>
                          <CardDescription>{store?.domain ?? 'Shopify store'}</CardDescription>
                        </div>
                      </div>
                      {store && (
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${tokenActive(store) ? 'bg-emerald-400' : 'bg-amber-400'}`} title={tokenActive(store) ? 'Token active' : 'Token expired'} />
                          <button
                            onClick={() => setExpandedStore(isExpanded ? null : brand.brand)}
                            className="flex items-center gap-1 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-[11px] text-muted-foreground transition hover:bg-accent"
                          >
                            Details
                            <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="relative space-y-4">
                      {/* Metrics */}
                      <div className="grid gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground sm:grid-cols-2">
                        <div className="rounded-2xl border border-border/50 bg-background/50 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="h-3 w-3 text-emerald-400" />
                            Net Profit
                          </div>
                          <div className="mt-2 text-lg font-semibold text-foreground">
                            <AnimatedNumber value={brand.profit} formatter={formatINR} />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border/50 bg-background/50 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="h-3 w-3 text-blue-400" />
                            Cashflow
                          </div>
                          <div className="mt-2 text-lg font-semibold text-foreground">
                            <AnimatedNumber value={brand.cashflow} formatter={formatINR} />
                          </div>
                        </div>
                      </div>

                      {/* Expandable details */}
                      <AnimatePresence>
                        {isExpanded && store && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border/50 pt-4 space-y-3">
                              {/* Edit name */}
                              <div className="flex items-center gap-2">
                                <input
                                  value={storeEdits[store.handle] ?? store.displayName ?? store.handle}
                                  onChange={(e) => setStoreEdits((prev) => ({ ...prev, [store.handle]: e.target.value }))}
                                  className="form-input flex-1 text-[12px]"
                                  placeholder="Display name"
                                />
                                <button
                                  onClick={() => handleNameUpdate(store.handle)}
                                  disabled={savingName === store.handle}
                                  className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] font-medium text-foreground hover:bg-accent transition disabled:opacity-50"
                                >
                                  {savingName === store.handle ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                                </button>
                              </div>
                              {/* Token info */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl border border-border/50 bg-background/50 px-3 py-2">
                                  <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Last Refresh</p>
                                  <p className="text-[11px] text-foreground mt-0.5 tabular-nums">{fmt(store.lastTokenRefresh)}</p>
                                </div>
                                <div className="rounded-xl border border-border/50 bg-background/50 px-3 py-2">
                                  <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Expires</p>
                                  <p className={`text-[11px] mt-0.5 tabular-nums ${tokenActive(store) ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(store.tokenExpiresAt)}</p>
                                </div>
                              </div>

                              {/* Delete */}
                              {confirmDelete === store.handle ? (
                                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
                                  <p className="text-[11px] text-red-400 flex-1">Remove this store?</p>
                                  <button
                                    onClick={() => handleDeleteStore(store.handle)}
                                    disabled={deletingStore === store.handle}
                                    className="rounded px-2.5 py-1 text-[11px] bg-red-500/20 text-red-400 hover:bg-red-500/30 transition disabled:opacity-50"
                                  >
                                    {deletingStore === store.handle ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes, remove'}
                                  </button>
                                  <button onClick={() => setConfirmDelete(null)} className="rounded px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent transition">
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(store.handle)}
                                  className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 transition w-fit"
                                >
                                  <Trash2 className="h-3 w-3" /> Remove Store
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}

        <div className="rounded-3xl border border-border/50 bg-card/60 p-6 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          Showing today&apos;s figures from finance data.
        </div>
      </PageTransition>

      {/* Add Store Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowAddModal(false); setAddStatus({ type: 'idle' }); } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Add New Store</p>
                    <p className="text-[10px] text-muted-foreground">Connect a Shopify store with OAuth credentials</p>
                  </div>
                </div>
                <button onClick={() => { setShowAddModal(false); setAddStatus({ type: 'idle' }); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddStore} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Store Handle">
                    <input value={storeHandle} onChange={(e) => setStoreHandle(e.target.value)} placeholder="your-store-handle" className="form-input" autoComplete="off" required />
                  </FormField>
                  <FormField label="Display Name">
                    <input value={storeDisplayName} onChange={(e) => setStoreDisplayName(e.target.value)} placeholder="Brand name" className="form-input" autoComplete="off" />
                  </FormField>
                  <FormField label="Client ID">
                    <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" className="form-input" autoComplete="off" required />
                  </FormField>
                  <FormField label="Client Secret">
                    <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client secret" className="form-input" autoComplete="off" required />
                  </FormField>
                </div>

                {storeHandle && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Token URL: https://{storeHandle}.myshopify.com/admin/oauth/access_token
                  </p>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={addStatus.type === 'saving'}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {addStatus.type === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {addStatus.type === 'saving' ? 'Connecting...' : 'Add Store'}
                  </button>
                  <button type="button" onClick={() => { setShowAddModal(false); setAddStatus({ type: 'idle' }); }} className="rounded-lg border border-border px-4 py-2 text-[12px] text-muted-foreground hover:bg-accent transition">
                    Cancel
                  </button>
                </div>

                <AnimatePresence>
                  {addStatus.type !== 'idle' && addStatus.type !== 'saving' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${addStatus.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}
                    >
                      {addStatus.type === 'success' ? <Check className="h-3 w-3 text-emerald-400 shrink-0" /> : <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />}
                      <p className={`text-[11px] ${addStatus.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{addStatus.message}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
