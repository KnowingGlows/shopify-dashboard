'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, ClipboardList, RefreshCw, Trash2,
  ChevronLeft, ChevronRight, CalendarDays, TrendingUp, Wallet, DollarSign,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';

interface FinanceDailyEntry {
  date: string;
  totalSales: number;
  grossMargin: number;
  grossProfit: number;
  adSpend: number;
  netProfit: number;
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
      }
    } catch { /* silently fail */ }
    finally { setDeleting(null); }
  };

  // Filter by month
  const filtered = monthFilter === 'all'
    ? entries
    : entries.filter((e) => e.date.startsWith(monthFilter));

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedEntries = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  // Reset page when filter changes
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
              <table className="tracker-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Sales</th>
                    <th className="text-right">Margin %</th>
                    <th className="text-right">Gross Profit</th>
                    <th className="text-right">Ad Spend</th>
                    <th className="text-right">Ad Cost (14%)</th>
                    <th className="text-right">Net Profit</th>
                    <th className="text-center w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {paginatedEntries.map((entry) => (
                      <motion.tr
                        key={entry.date}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="group"
                      >
                        <td className="px-3 py-2.5 text-[12px] text-muted-foreground font-medium">{entry.date}</td>
                        <td className="px-3 py-2.5 text-[12px] text-right font-medium text-foreground">{formatINR(entry.totalSales)}</td>
                        <td className="px-3 py-2.5 text-[12px] text-right text-muted-foreground">{Math.round((entry.grossMargin ?? 0) * 100)}%</td>
                        <td className="px-3 py-2.5 text-[12px] text-right text-emerald-400 font-medium">{formatINR(entry.grossProfit)}</td>
                        <td className="px-3 py-2.5 text-[12px] text-right text-amber-400">{formatINR(entry.adSpend)}</td>
                        <td className="px-3 py-2.5 text-[12px] text-right text-orange-400">{formatINR(Math.round(entry.adSpend * 1.14))}</td>
                        <td className={`px-3 py-2.5 text-[12px] font-semibold text-right ${entry.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatINR(entry.netProfit)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => handleDelete(entry.date)}
                            disabled={deleting === entry.date}
                            className="rounded-md p-1.5 text-muted-foreground/40 hover:text-red-400 hover:bg-red-400/10 transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                            title="Delete entry"
                          >
                            {deleting === entry.date ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
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
