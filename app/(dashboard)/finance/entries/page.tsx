'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, ClipboardList, RefreshCw, Trash2,
  ChevronLeft, ChevronRight, CalendarDays, TrendingUp, Wallet, DollarSign,
  ChevronDown, Save, Check,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

interface BrandDailyData {
  sales: number;
  grossMargin: number;
  grossProfit: number;
  adSpend: number;
  codSales: number;
  deliveryRate: number;
}

interface FinanceDailyEntry {
  date: string;
  totalSales: number;
  grossMargin: number;
  grossProfit: number;
  adSpend: number;
  netProfit: number;
  brandData?: Record<string, BrandDailyData>;
  codSalesByBrand?: Record<string, number>;
  enteredBy?: string;
}

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

const ITEMS_PER_PAGE = 10;

function getMonthOptions(): Array<{ value: string; label: string }> {
  const months: Array<{ value: string; label: string }> = [{ value: 'all', label: 'All Time' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    months.push({ value, label });
  }
  return months;
}

export default function DailyEntriesPage() {
  const [entries, setEntries] = useState<FinanceDailyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [monthFilter, setMonthFilter] = useState('all');
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, BrandDailyData>>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/finance?action=daily&start=2025-01-01');
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleDelete = async (date: string) => {
    if (!confirm(`Delete entry for ${date}? This cannot be undone.`)) return;
    setDeleting(date);
    try {
      const res = await fetch('/api/finance', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.date !== date));
        if (editingDate === date) setEditingDate(null);
      }
    } catch { /* silently fail */ }
    finally { setDeleting(null); }
  };

  const startEditing = (entry: FinanceDailyEntry) => {
    if (editingDate === entry.date) {
      setEditingDate(null);
      return;
    }
    // Build editable brand data from entry
    if (entry.brandData && Object.keys(entry.brandData).length > 0) {
      setEditData(JSON.parse(JSON.stringify(entry.brandData)));
    } else {
      // Legacy entry without per-brand data — create a single "All" brand
      setEditData({
        All: {
          sales: entry.totalSales,
          grossMargin: entry.grossMargin * 100,
          grossProfit: entry.grossProfit,
          adSpend: entry.adSpend,
          codSales: 0,
          deliveryRate: 65,
        },
      });
    }
    setEditingDate(entry.date);
    setSaveStatus('idle');
  };

  const updateEditField = (brand: string, field: keyof BrandDailyData, value: number) => {
    setEditData((prev) => {
      const updated = { ...prev, [brand]: { ...prev[brand], [field]: value } };
      // Recalculate grossProfit when sales or margin changes
      const b = updated[brand];
      if (field === 'sales' || field === 'grossMargin') {
        b.grossProfit = Math.round(b.sales * (b.grossMargin / 100));
      }
      return updated;
    });
  };

  const handleSaveEdit = async () => {
    if (!editingDate) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      const brandData: Record<string, BrandDailyData> = {};
      for (const [brand, data] of Object.entries(editData)) {
        brandData[brand] = {
          sales: data.sales,
          grossMargin: data.grossMargin / 100,
          grossProfit: Math.round(data.sales * (data.grossMargin / 100)),
          adSpend: data.adSpend,
          codSales: data.codSales,
          deliveryRate: data.deliveryRate,
        };
      }
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-daily', date: editingDate, brandData }),
      });
      if (res.ok) {
        // Update local entries
        setEntries((prev) =>
          prev.map((e) => {
            if (e.date !== editingDate) return e;
            let totalSales = 0, grossProfit = 0, adSpend = 0;
            for (const d of Object.values(brandData)) {
              totalSales += d.sales;
              grossProfit += d.grossProfit;
              adSpend += d.adSpend;
            }
            const netProfit = grossProfit - Math.round(adSpend * 1.14);
            const grossMargin = totalSales > 0 ? grossProfit / totalSales : 0;
            return { ...e, totalSales, grossProfit, grossMargin, adSpend, netProfit, brandData };
          }),
        );
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch { setSaveStatus('error'); }
    finally { setSaving(false); }
  };

  // Computed edit totals
  const editTotals = Object.values(editData).reduce(
    (acc, b) => ({
      sales: acc.sales + b.sales,
      grossProfit: acc.grossProfit + Math.round(b.sales * (b.grossMargin / 100)),
      adSpend: acc.adSpend + b.adSpend,
    }),
    { sales: 0, grossProfit: 0, adSpend: 0 },
  );
  const editNetProfit = editTotals.grossProfit - Math.round(editTotals.adSpend * 1.14);

  // Filter by month
  const filtered = monthFilter === 'all'
    ? entries
    : entries.filter((e) => e.date.startsWith(monthFilter));

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedEntries = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  useEffect(() => { setPage(1); }, [monthFilter]);

  // Totals for filtered
  const totalSales = filtered.reduce((s, e) => s + (e.totalSales ?? 0), 0);
  const totalGross = filtered.reduce((s, e) => s + (e.grossProfit ?? 0), 0);
  const totalNet = filtered.reduce((s, e) => s + (e.netProfit ?? 0), 0);

  const monthOptions = getMonthOptions();

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/finance" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Daily Entries</h1>
            <p className="text-[11px] text-muted-foreground">All recorded daily P&L entries</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="form-input h-[34px] text-[12px] pr-8"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { setRefreshing(true); fetchEntries(); }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-[12px] font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No entries yet</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Go to Enter Data to add daily P&L entries</p>
        </motion.div>
      ) : (
        <>
          {/* Summary Cards */}
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StaggerItem>
              <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Sales</p>
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xl font-semibold text-foreground">{formatINR(totalSales)}</p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Gross Profit</p>
                  <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <p className={`text-xl font-semibold ${totalGross >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatINR(totalGross)}</p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="card-hover-glow rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Net Profit</p>
                  <Wallet className="h-3.5 w-3.5 text-violet-400" />
                </div>
                <p className={`text-xl font-semibold ${totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatINR(totalNet)}</p>
              </div>
            </StaggerItem>
          </StaggerContainer>

          {/* Entries Table */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sales</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Gross Profit</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Ad Cost (14%)</th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Net Profit</th>
                    <th className="w-20 px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEntries.map((entry) => {
                    const isEditing = editingDate === entry.date;
                    return (
                      <React.Fragment key={entry.date}>
                        <tr
                          className={`group border-b border-border/50 last:border-0 cursor-pointer transition-colors ${isEditing ? 'bg-primary/5' : 'hover:bg-accent/5'}`}
                          onClick={() => startEditing(entry)}
                        >
                          <td className="px-4 py-3 text-[13px] text-muted-foreground font-medium">{entry.date}</td>
                          <td className="px-4 py-3 text-[13px] text-right font-medium text-foreground tabular-nums">{formatINR(entry.totalSales)}</td>
                          <td className="px-4 py-3 text-[13px] text-right font-medium text-emerald-400 tabular-nums">{formatINR(entry.grossProfit)}</td>
                          <td className="px-4 py-3 text-[13px] text-right font-medium text-orange-400 tabular-nums">{formatINR(Math.round(entry.adSpend * 1.14))}</td>
                          <td className={`px-4 py-3 text-[13px] font-semibold text-right tabular-nums ${entry.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatINR(entry.netProfit)}
                          </td>
                          <td className="w-20 px-2 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(entry.date); }}
                                disabled={deleting === entry.date}
                                className="rounded-md p-1.5 text-muted-foreground/40 hover:text-red-400 hover:bg-red-400/10 transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                title="Delete entry"
                              >
                                {deleting === entry.date ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/40 transition-transform ${isEditing ? 'rotate-180' : ''}`} />
                            </div>
                          </td>
                        </tr>
                        {/* Expanded edit panel */}
                        <AnimatePresence>
                          {isEditing && (
                            <tr>
                              <td colSpan={6} className="p-0">
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="border-t border-border bg-background/30 px-4 py-4 space-y-4">
                                    {Object.entries(editData).map(([brand, data]) => (
                                      <div key={brand} className="space-y-2">
                                        <div className="flex items-center gap-2">
                                          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                          <span className="text-[12px] font-semibold text-foreground">{brand}</span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                          <FieldInput label="Sales" value={data.sales} onChange={(v) => updateEditField(brand, 'sales', v)} />
                                          <FieldInput label="Gross Margin %" value={data.grossMargin} onChange={(v) => updateEditField(brand, 'grossMargin', v)} />
                                          <FieldInput label="Ad Spend" value={data.adSpend} onChange={(v) => updateEditField(brand, 'adSpend', v)} />
                                          <FieldInput label="COD Sales" value={data.codSales} onChange={(v) => updateEditField(brand, 'codSales', v)} />
                                          <FieldInput label="Delivery %" value={data.deliveryRate} onChange={(v) => updateEditField(brand, 'deliveryRate', v)} />
                                        </div>
                                      </div>
                                    ))}

                                    {/* Edit totals preview */}
                                    <div className="flex items-center gap-3 rounded-lg bg-background/50 border border-border/40 px-3 py-2 overflow-x-auto text-[11px]">
                                      <span className="text-muted-foreground">Updated:</span>
                                      <span className="text-foreground font-medium tabular-nums">Sales {formatINR(editTotals.sales)}</span>
                                      <span className="text-muted-foreground/30">|</span>
                                      <span className="text-emerald-400 font-medium tabular-nums">Gross {formatINR(editTotals.grossProfit)}</span>
                                      <span className="text-muted-foreground/30">-</span>
                                      <span className="text-orange-400 font-medium tabular-nums">Ads {formatINR(Math.round(editTotals.adSpend * 1.14))}</span>
                                      <span className="text-muted-foreground/30">=</span>
                                      <span className={`font-semibold tabular-nums ${editNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        Net {formatINR(editNetProfit)}
                                      </span>
                                    </div>

                                    {/* Save button */}
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={handleSaveEdit}
                                        disabled={saving}
                                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
                                      >
                                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                        Save Changes
                                      </button>
                                      <AnimatePresence>
                                        {saveStatus === 'saved' && (
                                          <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1 text-[12px] text-emerald-400">
                                            <Check className="h-3.5 w-3.5" />Saved
                                          </motion.span>
                                        )}
                                        {saveStatus === 'error' && (
                                          <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[12px] text-red-400">
                                            Failed to save
                                          </motion.span>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  </div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-border px-4 py-3 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                        p === safePage
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>

          <p className="text-[11px] text-muted-foreground">{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}{monthFilter !== 'all' ? ' (filtered)' : ' total'}</p>
        </>
      )}
    </PageTransition>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value || ''}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="form-input text-[13px] py-1.5"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
