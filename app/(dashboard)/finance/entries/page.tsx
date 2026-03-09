'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Loader2, ClipboardList, RefreshCw } from 'lucide-react';
import { PageTransition } from '@/components/motion';

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

export default function DailyEntriesPage() {
  const [entries, setEntries] = useState<FinanceDailyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/finance?action=daily&start=2025-01-01');
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Totals
  const totalSales = entries.reduce((s, e) => s + (e.totalSales ?? 0), 0);
  const totalGross = entries.reduce((s, e) => s + (e.grossProfit ?? 0), 0);
  const totalNet = entries.reduce((s, e) => s + (e.netProfit ?? 0), 0);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Daily Entries</h1>
            <p className="text-[11px] text-muted-foreground">All recorded daily P&L entries</p>
          </div>
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
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card px-4 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Sales</p>
              <p className="text-lg font-semibold text-foreground">{formatINR(totalSales)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Gross Profit</p>
              <p className={`text-lg font-semibold ${totalGross >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatINR(totalGross)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Net Profit</p>
              <p className={`text-lg font-semibold ${totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatINR(totalNet)}</p>
            </div>
          </div>

          {/* Table */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card overflow-hidden">
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
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.date}>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{entry.date}</td>
                      <td className="px-3 py-2.5 text-[12px] text-right font-medium">{formatINR(entry.totalSales)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-right text-muted-foreground">{Math.round((entry.grossMargin ?? 0) * 100)}%</td>
                      <td className="px-3 py-2.5 text-[12px] text-right text-emerald-400">{formatINR(entry.grossProfit)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-right text-amber-400">{formatINR(entry.adSpend)}</td>
                      <td className="px-3 py-2.5 text-[12px] text-right text-orange-400">{formatINR(Math.round(entry.adSpend * 1.14))}</td>
                      <td className={`px-3 py-2.5 text-[12px] font-semibold text-right ${entry.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatINR(entry.netProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          <p className="text-[11px] text-muted-foreground">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'} total</p>
        </>
      )}
    </PageTransition>
  );
}
