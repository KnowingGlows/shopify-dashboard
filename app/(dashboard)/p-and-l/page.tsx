'use client';

import { useEffect, useState } from 'react';
import { formatINR } from '@/lib/currency-converter';
import {
  ArrowDownRight,
  ArrowUpRight,
  Megaphone,
  Save,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const BRANDS = ['Kairova', 'Mavric'];

type BrandEntry = {
  brand: string;
  profit: number;
  cashflow: number;
  adspend: number;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDateLabel(dateStr: string): string {
  const today = getTodayIST();
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const label = date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (dateStr === today) return `${label} (Today)`;
  return label;
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function PandLPage() {
  const [date, setDate] = useState(getTodayIST);
  const [entries, setEntries] = useState<Record<string, BrandEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});

  const fetchEntries = async (targetDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pnl?date=${targetDate}`);
      const data = await res.json();
      const map: Record<string, BrandEntry> = {};
      for (const brand of BRANDS) {
        const existing = (data.entries ?? []).find(
          (e: BrandEntry) => e.brand === brand
        );
        map[brand] = existing ?? { brand, profit: 0, cashflow: 0, adspend: 0 };
      }
      setEntries(map);
    } catch {
      const map: Record<string, BrandEntry> = {};
      for (const brand of BRANDS) {
        map[brand] = { brand, profit: 0, cashflow: 0, adspend: 0 };
      }
      setEntries(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries(date);
  }, [date]);

  const updateField = (brand: string, field: keyof BrandEntry, value: string) => {
    const num = value === '' ? 0 : Number(value);
    if (isNaN(num)) return;
    setEntries((prev) => ({
      ...prev,
      [brand]: { ...prev[brand], [field]: num },
    }));
    setSaveStatus((prev) => ({ ...prev, [brand]: 'idle' }));
  };

  const saveEntry = async (brand: string) => {
    setSaveStatus((prev) => ({ ...prev, [brand]: 'saving' }));
    try {
      const entry = entries[brand];
      const res = await fetch('/api/pnl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, date }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus((prev) => ({ ...prev, [brand]: 'saved' }));
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [brand]: 'idle' }));
      }, 2000);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [brand]: 'error' }));
    }
  };

  const totalProfit = BRANDS.reduce((sum, b) => sum + (entries[b]?.profit ?? 0), 0);
  const totalCashflow = BRANDS.reduce((sum, b) => sum + (entries[b]?.cashflow ?? 0), 0);
  const totalAdspend = BRANDS.reduce((sum, b) => sum + (entries[b]?.adspend ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Daily P&amp;L</h1>
          <p className="text-[11px] text-muted-foreground">Profit, cashflow, and ad spend per brand</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
            {formatDateLabel(date)}
          </span>
          <button
            onClick={() => {
              const next = shiftDate(date, 1);
              if (next <= getTodayIST()) setDate(next);
            }}
            disabled={date >= getTodayIST()}
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ArrowUpRight className="h-3 w-3 text-emerald-400" /> Net Profit
          </p>
          <p className="mt-0.5 text-xl font-semibold text-foreground">{formatINR(totalProfit)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ArrowDownRight className="h-3 w-3 text-blue-400" /> Cashflow
          </p>
          <p className="mt-0.5 text-xl font-semibold text-foreground">{formatINR(totalCashflow)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Megaphone className="h-3 w-3 text-amber-400" /> Ad Spend
          </p>
          <p className="mt-0.5 text-xl font-semibold text-foreground">{formatINR(totalAdspend)}</p>
        </div>
      </div>

      {/* Brand cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {BRANDS.map((brand) => {
            const entry = entries[brand] ?? { brand, profit: 0, cashflow: 0, adspend: 0 };
            const status = saveStatus[brand] ?? 'idle';

            return (
              <div key={brand} className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-medium text-foreground">{brand}</h3>
                  <button
                    onClick={() => saveEntry(brand)}
                    disabled={status === 'saving'}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {status === 'saving' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : status === 'saved' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {status === 'saving' ? 'Saving' : status === 'saved' ? 'Saved' : 'Save'}
                  </button>
                </div>
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <ArrowUpRight className="h-3 w-3 text-emerald-400" /> Net Profit
                    </span>
                    <input
                      type="number"
                      value={entry.profit || ''}
                      onChange={(e) => updateField(brand, 'profit', e.target.value)}
                      placeholder="0"
                      className="w-28 bg-transparent text-right text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <ArrowDownRight className="h-3 w-3 text-blue-400" /> Cashflow
                    </span>
                    <input
                      type="number"
                      value={entry.cashflow || ''}
                      onChange={(e) => updateField(brand, 'cashflow', e.target.value)}
                      placeholder="0"
                      className="w-28 bg-transparent text-right text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Megaphone className="h-3 w-3 text-amber-400" /> Ad Spend
                    </span>
                    <input
                      type="number"
                      value={entry.adspend || ''}
                      onChange={(e) => updateField(brand, 'adspend', e.target.value)}
                      placeholder="0"
                      className="w-28 bg-transparent text-right text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                </div>
                {status === 'error' && (
                  <div className="mx-4 mb-3 mt-1 rounded-md bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
                    Failed to save. Check if Firebase is configured.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
