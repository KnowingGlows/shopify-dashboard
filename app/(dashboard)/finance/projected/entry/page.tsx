'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Loader2, Save, ArrowLeft, Calculator, Megaphone,
  BanknoteIcon, Truck, CreditCard, Plus, X,
} from 'lucide-react';
import { PageTransition } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { formatINR } from '@/lib/currency-converter';

// ── Types & Helpers ──────────────────────────────────────────────────────────

interface BrandEntry {
  sales: number;
  grossMargin: number; // 0-100 display, saved as 0-1
  adSpend: number;
  codSales: number;
  deliveryRate: number; // 0-100
}

function getYesterday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - 86400000));
}

function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const INCOME_CATEGORIES = [
  { value: 'prepaid-settlement', label: 'Prepaid Settlement', icon: '💳' },
  { value: 'affiliate', label: 'Affiliate Income', icon: '🤝' },
  { value: 'refund-received', label: 'Refund Received', icon: '↩️' },
  { value: 'cashback', label: 'Cashback / Reward', icon: '🎁' },
  { value: 'loan-received', label: 'Loan / Credit', icon: '🏦' },
  { value: 'investment', label: 'Investment Inflow', icon: '📈' },
  { value: 'freelance-income', label: 'Freelance / Service', icon: '💼' },
  { value: 'marketplace', label: 'Marketplace Payout', icon: '🛒' },
  { value: 'reimbursement', label: 'Reimbursement', icon: '📋' },
  { value: 'other-income', label: 'Other', icon: '•' },
];


async function loadDeliveryRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch('/api/finance?action=delivery-rates');
    const data = await res.json();
    return data.rates ?? {};
  } catch { return {}; }
}

function saveDeliveryRates(rates: Record<string, number>) {
  fetch('/api/finance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save-delivery-rates', rates }),
  }).catch(() => { /* ignore */ });
}

function loadGrossMargins(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem('orbyt-gross-margins');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

function saveGrossMargins(margins: Record<string, number>) {
  try { localStorage.setItem('orbyt-gross-margins', JSON.stringify(margins)); } catch { /* ignore */ }
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function FinanceEntryPage() {
  const { user } = useAuth();
  const isCMO = user?.role === 'cmo';

  // Core state
  const [dailyDate, setDailyDate] = useState(getYesterday());
  const [salesLoading, setSalesLoading] = useState(false);
  const [savingDaily, setSavingDaily] = useState(false);
  const [dailySaveStatus, setDailySaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [prepaidSettlement, setPrepaidSettlement] = useState<string>('');
  const [showIncomeModal, setShowIncomeModal] = useState(false);

  // Per-brand data
  const [brands, setBrands] = useState<string[]>([]);
  const [brandEntries, setBrandEntries] = useState<Record<string, BrandEntry>>({});
  const [activeBrand, setActiveBrand] = useState<string | null>(null);


  // Auto-fetch sales — only when the date actually changes
  const lastFetchedDate = useRef<string>('');
  const userEdits = useRef<Record<string, Partial<BrandEntry>>>({});

  useEffect(() => {
    if (!dailyDate || dailyDate === lastFetchedDate.current) return;
    lastFetchedDate.current = dailyDate;

    // Reset user edits on date change (new day = fresh entry)
    userEdits.current = {};

    let cancelled = false;
    (async () => {
      setSalesLoading(true);
      try {
        const res = await fetch(`/api/finance?action=fetch-sales&date=${dailyDate}`);
        const data = await res.json();
        if (cancelled) return;
        const salesByBrand: Record<string, number> = data.salesByBrand ?? {};
        const codByBrand: Record<string, number> = data.codSalesByBrand ?? {};
        const brandNames = Object.keys(salesByBrand);

        if (brandNames.length > 0) {
          const savedMargins = loadGrossMargins();
          const savedRates = await loadDeliveryRates();

          const entries: Record<string, BrandEntry> = {};
          for (const brand of brandNames) {
            entries[brand] = {
              sales: salesByBrand[brand] ?? 0,
              grossMargin: savedMargins[brand] ?? 55,
              adSpend: 0,
              codSales: codByBrand[brand] ?? 0,
              deliveryRate: savedRates[brand] ?? 65,
            };
          }
          setBrands(brandNames);
          setBrandEntries(entries);
          setActiveBrand((prev) => (!prev || !brandNames.includes(prev)) ? brandNames[0] : prev);
        }
      } catch { /* silently fail */ }
      finally { if (!cancelled) setSalesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [dailyDate]);

  // Brand field update
  const updateBrandField = (brand: string, field: keyof BrandEntry, value: number) => {
    setBrandEntries((prev) => ({
      ...prev,
      [brand]: { ...prev[brand], [field]: value },
    }));
    // Track user edits so they survive any unexpected re-renders
    userEdits.current[brand] = { ...userEdits.current[brand], [field]: value };
    // Persist margin & delivery rate to localStorage
    if (field === 'grossMargin') {
      const all = { ...Object.fromEntries(Object.entries(brandEntries).map(([b, e]) => [b, e.grossMargin])), [brand]: value };
      saveGrossMargins(all);
    }
    if (field === 'deliveryRate') {
      const all = { ...Object.fromEntries(Object.entries(brandEntries).map(([b, e]) => [b, e.deliveryRate])), [brand]: value };
      saveDeliveryRates(all);
    }
  };

  // Save daily
  const handleSaveDaily = async () => {
    setSavingDaily(true);
    setDailySaveStatus('idle');
    try {
      const brandData: Record<string, { sales: number; grossMargin: number; grossProfit: number; adSpend: number; codSales: number; deliveryRate: number }> = {};
      for (const [brand, entry] of Object.entries(brandEntries)) {
        const margin = normalizeMargin(entry.grossMargin);
        brandData[brand] = {
          sales: entry.sales,
          grossMargin: margin,
          grossProfit: Math.round(entry.sales * margin),
          adSpend: entry.adSpend,
          codSales: entry.codSales,
          deliveryRate: entry.deliveryRate,
        };
      }
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-daily',
          date: dailyDate,
          brandData,
          prepaidSettlement: Number(prepaidSettlement) || 0,
          enteredBy: user?.email ?? '',
        }),
      });
      if (res.ok) {
        setDailySaveStatus('saved');
        setTimeout(() => setDailySaveStatus('idle'), 3000);
      } else setDailySaveStatus('error');
    } catch { setDailySaveStatus('error'); }
    finally { setSavingDaily(false); }
  };


  // Normalize gross margin — if user enters 0.7 treat as 70%, if 70 treat as 70%
  const normalizeMargin = (gm: number) => gm <= 1 ? gm : gm / 100;

  // Computed totals
  const totals = Object.values(brandEntries).reduce(
    (acc, e) => ({
      sales: acc.sales + e.sales,
      grossProfit: acc.grossProfit + Math.round(e.sales * normalizeMargin(e.grossMargin)),
      adSpend: acc.adSpend + e.adSpend,
      codSales: acc.codSales + e.codSales,
    }),
    { sales: 0, grossProfit: 0, adSpend: 0, codSales: 0 }
  );
  const totalActualAdCost = Math.round(totals.adSpend * 1.14);
  const totalNetProfit = totals.grossProfit - totalActualAdCost;

  const currentBrand = activeBrand ? brandEntries[activeBrand] : null;
  const brandGrossProfit = currentBrand ? Math.round(currentBrand.sales * normalizeMargin(currentBrand.grossMargin)) : 0;
  const brandActualAdCost = currentBrand ? Math.round(currentBrand.adSpend * 1.14) : 0;
  const brandNetProfit = brandGrossProfit - brandActualAdCost;

  return (
    <PageTransition className="mx-auto max-w-6xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/finance/projected" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Daily P&L Entry</h1>
          <p className="text-[11px] text-muted-foreground">Sales, margins & ad spend projections</p>
        </div>
        <button
          onClick={() => setShowIncomeModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-2 text-[12px] font-medium text-emerald-400 transition hover:bg-emerald-500/25 hover:border-emerald-500/40 active:scale-[0.97]"
        >
          <Plus className="h-3.5 w-3.5" />
          Missed Income
        </button>
      </div>

      {/* ═══ Daily P&L Entry ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Calculator className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Daily P&L</h2>
          <div className="ml-auto">
            <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="form-input text-[12px] py-1" />
          </div>
        </div>

        {/* Brand Tabs */}
        {brands.length > 0 && (
          <div className="flex items-center gap-1 px-4 pt-3 pb-1 overflow-x-auto">
            {brands.map((brand) => (
              <button
                key={brand}
                onClick={() => setActiveBrand(brand)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition shrink-0 ${
                  activeBrand === brand
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/30 border border-transparent'
                }`}
              >
                {brand}
              </button>
            ))}
            {salesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-2 shrink-0" />}
          </div>
        )}

        {/* Brand-specific form */}
        {activeBrand && currentBrand && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FormField label="Sales (auto)">
                <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                  <p className="text-[14px] font-semibold text-foreground tabular-nums">{formatINR(currentBrand.sales)}</p>
                </div>
              </FormField>
              <FormField label="Gross Margin %">
                <input
                  type="number"
                  value={currentBrand.grossMargin}
                  onChange={(e) => updateBrandField(activeBrand, 'grossMargin', Number(e.target.value) || 0)}
                  placeholder="55"
                  className="form-input"
                />
              </FormField>
              <FormField label={<span className="flex items-center gap-1"><Megaphone className="h-3 w-3 text-blue-400" />Ad Spend{isCMO && <span className="text-amber-400 normal-case text-[9px]">(req)</span>}</span>}>
                <input
                  type="number"
                  value={currentBrand.adSpend || ''}
                  onChange={(e) => updateBrandField(activeBrand, 'adSpend', Number(e.target.value) || 0)}
                  placeholder="0"
                  className="form-input"
                />
              </FormField>
              <FormField label="COD Delivery %">
                <input
                  type="number"
                  value={currentBrand.deliveryRate}
                  onChange={(e) => updateBrandField(activeBrand, 'deliveryRate', Number(e.target.value) || 0)}
                  placeholder="65"
                  className="form-input"
                  min={0}
                  max={100}
                />
              </FormField>
            </div>

            {/* Brand metrics row */}
            <div className="flex items-center gap-3 rounded-lg bg-background/50 border border-border/40 px-3 py-2 overflow-x-auto">
              <PreviewPill label="Sales" value={formatINR(currentBrand.sales)} />
              <span className="text-muted-foreground/20">|</span>
              <PreviewPill label="Gross" value={formatINR(brandGrossProfit)} />
              <span className="text-muted-foreground/30">-</span>
              <PreviewPill label="Ads (14%)" value={formatINR(brandActualAdCost)} negative />
              <span className="text-muted-foreground/30">=</span>
              <PreviewPill label="Net" value={formatINR(brandNetProfit)} highlight positive={brandNetProfit >= 0} />
              <span className="text-muted-foreground/20 ml-auto">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <BanknoteIcon className="h-3 w-3 text-emerald-400" />
                <span className="text-[10px] text-muted-foreground">COD</span>
                <span className="text-[12px] font-semibold text-emerald-400 font-mono">{formatINR(currentBrand.codSales)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Combined Totals */}
        {brands.length > 1 && (
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-4 overflow-x-auto">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">All Brands</span>
              <PreviewPill label="Sales" value={formatINR(totals.sales)} />
              <PreviewPill label="Gross" value={formatINR(totals.grossProfit)} />
              <span className="text-muted-foreground/30">-</span>
              <PreviewPill label="Ads (14%)" value={formatINR(totalActualAdCost)} negative />
              <span className="text-muted-foreground/30">=</span>
              <PreviewPill label="Net" value={formatINR(totalNetProfit)} highlight positive={totalNetProfit >= 0} />
            </div>
          </div>
        )}

        {/* Save */}
        <div className="border-t border-border px-4 py-3 flex items-center gap-3">
          <button onClick={handleSaveDaily} disabled={savingDaily || brands.length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50">
            {savingDaily ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save All Brands
          </button>
          <StatusBadge status={dailySaveStatus} />
        </div>
      </motion.div>

      {/* ═══ COD Overview ═══ */}
      {brands.length > 0 && totals.codSales > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-500/15">
            <Truck className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-foreground">COD Summary</h2>
          </div>
          <div className="p-3">
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_80px_100px_100px] items-center gap-3 px-3 py-1">
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Brand</span>
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60 text-center">Delivery %</span>
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60 text-right">COD Revenue</span>
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60 text-right">Bank Deposit</span>
              </div>
              {brands.map((brand) => {
                const entry = brandEntries[brand];
                if (!entry) return null;
                const projected = Math.round(entry.codSales * (entry.deliveryRate / 100));
                return (
                  <div key={brand} className="grid grid-cols-[1fr_80px_100px_100px] items-center gap-3 rounded-lg bg-card border border-border/40 px-3 py-2.5 hover:border-emerald-500/20 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-[13px] font-medium text-foreground truncate">{brand}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-center text-muted-foreground tabular-nums">{entry.deliveryRate}%</p>
                    <p className="text-[12px] text-muted-foreground text-right font-mono tabular-nums">{formatINR(entry.codSales)}</p>
                    <p className="text-[12px] font-semibold text-emerald-400 text-right font-mono tabular-nums">{formatINR(projected)}</p>
                  </div>
                );
              })}
              <div className="grid grid-cols-[1fr_80px_100px_100px] items-center gap-3 px-3 py-2 border-t border-border/30 mt-1">
                <span className="text-[11px] font-semibold text-foreground">Total</span>
                <span />
                <p className="text-[12px] font-semibold text-foreground text-right font-mono tabular-nums">{formatINR(totals.codSales)}</p>
                <p className="text-[12px] font-bold text-emerald-400 text-right font-mono tabular-nums">
                  {formatINR(Object.values(brandEntries).reduce((s, e) => s + Math.round(e.codSales * (e.deliveryRate / 100)), 0))}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Prepaid Settlement ═══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-violet-500/15">
          <CreditCard className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-foreground">Prepaid Settlement</h2>
        </div>
        <div className="p-4">
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-1.5 flex-1 max-w-xs">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Settlement Received (₹)</label>
              <input
                type="number"
                value={prepaidSettlement}
                onChange={(e) => setPrepaidSettlement(e.target.value)}
                placeholder="0"
                className="form-input"
              />
            </div>
            {Number(prepaidSettlement) > 0 && (
              <div className="flex items-center gap-1.5 pb-2">
                <span className="text-[10px] text-muted-foreground">Adds</span>
                <span className="text-[14px] font-bold text-violet-400 font-mono">{formatINR(Number(prepaidSettlement))}</span>
                <span className="text-[10px] text-muted-foreground">to spending power</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Missed Income Modal */}
      <AnimatePresence>
        {showIncomeModal && (
          <MissedIncomeModal
            onClose={() => setShowIncomeModal(false)}
            onAdd={async (data) => {
              await fetch('/api/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save-income', ...data, enteredBy: user?.email ?? '' }),
              });
              setShowIncomeModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FormField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function PreviewPill({ label, value, negative, highlight, positive }: { label: string; value: string; negative?: boolean; highlight?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-[12px] font-semibold font-mono ${
        highlight ? (positive ? 'text-emerald-400' : 'text-red-400') :
        negative ? 'text-orange-400/80' : 'text-foreground'
      }`}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: 'idle' | 'saved' | 'error' }) {
  return (
    <AnimatePresence>
      {status === 'saved' && (
        <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-emerald-400">Saved</motion.span>
      )}
      {status === 'error' && (
        <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-red-400">Failed</motion.span>
      )}
    </AnimatePresence>
  );
}

// ── Missed Income Modal ──────────────────────────────────────────────────────

function MissedIncomeModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (data: { category: string; description: string; amount: number; date: string; endDate?: string }) => void;
}) {
  const [category, setCategory] = useState('prepaid-settlement');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getToday());
  const [endDate, setEndDate] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!amount || !category) return;
    setSaving(true);
    onAdd({ category, description, amount: Number(amount), date, endDate: isRange && endDate ? endDate : undefined });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <BanknoteIcon className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Missed Income</h2>
              <p className="text-[11px] text-muted-foreground">Log income not captured automatically</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Category */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Source</label>
            <div className="flex flex-wrap gap-1.5">
              {INCOME_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition border ${
                    category === cat.value
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'text-muted-foreground border-border hover:border-border/80 hover:text-foreground'
                  }`}
                >
                  <span className="mr-1">{cat.icon}</span>{cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Amazon affiliate payout for Feb"
              className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-emerald-500/50 focus:outline-none transition"
            />
          </div>

          {/* Amount + Date row */}
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground tabular-nums placeholder:text-muted-foreground/40 focus:border-emerald-500/50 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground focus:border-emerald-500/50 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Date range toggle */}
          <div>
            <button
              onClick={() => setIsRange(!isRange)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium transition border ${
                isRange
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Date range income
            </button>
            <AnimatePresence>
              {isRange && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3">
                    <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={date}
                      className="w-full max-w-[200px] rounded-xl border border-border/50 bg-background/60 px-4 py-2.5 text-[13px] text-foreground focus:border-emerald-500/50 focus:outline-none transition"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 px-6 py-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!amount || !category || saving}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-[12px] font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> : <Plus className="h-3.5 w-3.5 inline mr-1" />}
            Add Income
          </button>
        </div>
      </motion.div>
    </div>
  );
}
