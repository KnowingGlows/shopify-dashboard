'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  Loader2,
  DollarSign,
  TrendingUp,
  Target,
  FlaskConical,
  Package,
  Wallet,
  Plus,
} from 'lucide-react';

interface FinanceData {
  totalProductTestingSpend: number;
  totalAdSpend: number;
  avgROAS: number;
  totalPnLProfit: number;
  totalPnLCashflow: number;
  totalPnLAdSpend: number;
  inventoryValue: number;
  totalExpenses: number;
  productCount: number;
  adsEntryCount: number;
  inventoryItemCount: number;
  topSpenders: { productName: string; productStage: string; totalSpent: number }[];
  adPerformance: {
    productName: string;
    batchName: string;
    weeklyRoas: number;
    dailyAdSpend: number;
    creativeBatchResult: string;
  }[];
  recentPnL: {
    brand: string;
    date: string;
    profit: number;
    cashflow: number;
    adspend: number;
  }[];
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
}

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);

const EXPENSE_CATEGORIES = [
  'Operations',
  'Marketing',
  'Shipping',
  'Returns',
  'Tools/Software',
  'Other',
];

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Expense form state
  const [expCategory, setExpCategory] = useState('Operations');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  );
  const [addingExpense, setAddingExpense] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [finRes, expRes] = await Promise.all([
        fetch('/api/finance'),
        fetch('/api/finance?type=expenses'),
      ]);
      const finData = await finRes.json();
      const expData = await expRes.json();
      setData(finData);
      setExpenses(expData.expenses ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleAddExpense = async () => {
    if (!expAmount || !expCategory) return;
    setAddingExpense(true);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: expCategory,
          description: expDescription,
          amount: Number(expAmount),
          date: expDate,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setExpenses((prev) => [result.expense, ...prev]);
        setExpDescription('');
        setExpAmount('');
      }
    } catch {
      // silently fail
    } finally {
      setAddingExpense(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d = data ?? {
    totalProductTestingSpend: 0,
    totalAdSpend: 0,
    avgROAS: 0,
    totalPnLProfit: 0,
    totalPnLCashflow: 0,
    totalPnLAdSpend: 0,
    inventoryValue: 0,
    totalExpenses: 0,
    productCount: 0,
    adsEntryCount: 0,
    inventoryItemCount: 0,
    topSpenders: [],
    adPerformance: [],
    recentPnL: [],
  };

  // Overall ROAS from P&L data
  const overallROAS = d.totalPnLAdSpend > 0 ? d.totalPnLProfit / d.totalPnLAdSpend : 0;

  // Spend breakdown categories
  const totalOtherExpenses = d.totalExpenses;
  const spendCategories = [
    { label: 'Ad Spend (P&L)', amount: d.totalPnLAdSpend, color: 'bg-amber-400' },
    { label: 'Product Testing', amount: d.totalProductTestingSpend, color: 'bg-violet-400' },
    { label: 'Inventory', amount: d.inventoryValue, color: 'bg-sky-400' },
    { label: 'Other Expenses', amount: totalOtherExpenses, color: 'bg-rose-400' },
  ];
  const maxSpend = Math.max(...spendCategories.map((c) => c.amount), 1);

  return (
    <div className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Finance Overview</h1>
          <p className="text-[11px] text-muted-foreground">
            Complete financial picture across all operations
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total Revenue */}
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Total Revenue (P&L)
            </p>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">
            {formatINR(d.totalPnLProfit)}
          </p>
        </div>

        {/* Total Ad Spend */}
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Total Ad Spend (P&L)
            </p>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">
            {formatINR(d.totalPnLAdSpend)}
          </p>
        </div>

        {/* Overall ROAS */}
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Overall ROAS
            </p>
            <Target className="h-4 w-4 text-blue-400" />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">
            {overallROAS.toFixed(2)}x
          </p>
        </div>

        {/* Product Testing Spend */}
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Product Testing Spend
            </p>
            <FlaskConical className="h-4 w-4 text-violet-400" />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">
            {formatINR(d.totalProductTestingSpend)}
          </p>
        </div>

        {/* Inventory Value */}
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Inventory Value
            </p>
            <Package className="h-4 w-4 text-sky-400" />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">
            {formatINR(d.inventoryValue)}
          </p>
        </div>

        {/* Net Cashflow */}
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Net Cashflow (P&L)
            </p>
            <Wallet
              className={`h-4 w-4 ${d.totalPnLCashflow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            />
          </div>
          <p
            className={`mt-1.5 text-2xl font-semibold ${
              d.totalPnLCashflow >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {formatINR(d.totalPnLCashflow)}
          </p>
        </div>
      </div>

      {/* Spend Breakdown */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-medium text-foreground">Spend Breakdown</h2>
        </div>
        <div className="divide-y divide-border">
          {spendCategories.map((cat) => {
            const pct = maxSpend > 0 ? (cat.amount / maxSpend) * 100 : 0;
            return (
              <div key={cat.label} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`h-2 w-2 rounded-full ${cat.color}`} />
                <span className="text-[12px] text-foreground flex-1">{cat.label}</span>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-24 rounded-full bg-border overflow-hidden">
                    <div
                      className={`h-full rounded-full ${cat.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-medium text-foreground w-20 text-right">
                    {formatINR(cat.amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-column layout for tables */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Top Product Spend */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-medium text-foreground">Top Product Spend</h2>
          </div>
          {d.topSpenders.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
              No product tracker data yet.
            </p>
          ) : (
            <table className="tracker-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Stage</th>
                  <th className="text-right">Spent</th>
                </tr>
              </thead>
              <tbody>
                {d.topSpenders.map((p, i) => (
                  <tr key={i}>
                    <td className="text-[12px]">{p.productName}</td>
                    <td className="text-[12px] text-muted-foreground">{p.productStage}</td>
                    <td className="text-[12px] font-medium text-right">
                      {formatINR(p.totalSpent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Ad Performance */}
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-medium text-foreground">Ad Performance (ROAS)</h2>
          </div>
          {d.adPerformance.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
              No ads data with ROAS yet.
            </p>
          ) : (
            <table className="tracker-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th className="text-right">ROAS</th>
                  <th className="text-right">Daily Spend</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {d.adPerformance.map((a, i) => (
                  <tr key={i}>
                    <td className="text-[12px]">{a.productName}</td>
                    <td className="text-[12px] text-muted-foreground">{a.batchName}</td>
                    <td className="text-[12px] font-medium text-right">
                      <span
                        className={
                          a.weeklyRoas >= 2
                            ? 'text-emerald-400'
                            : a.weeklyRoas >= 1
                              ? 'text-amber-400'
                              : 'text-red-400'
                        }
                      >
                        {a.weeklyRoas.toFixed(2)}x
                      </span>
                    </td>
                    <td className="text-[12px] text-right">{formatINR(a.dailyAdSpend)}</td>
                    <td className="text-[12px] text-muted-foreground">
                      {a.creativeBatchResult}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Manual Expenses Section */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-medium text-foreground">Manual Expenses</h2>
        </div>

        {/* Add Expense Form */}
        <div className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Category
            </label>
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Description
            </label>
            <input
              type="text"
              value={expDescription}
              onChange={(e) => setExpDescription(e.target.value)}
              placeholder="What was this for?"
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-col gap-1 w-28">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Amount
            </label>
            <input
              type="number"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="0"
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-col gap-1 w-36">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Date
            </label>
            <input
              type="date"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
            />
          </div>
          <button
            onClick={handleAddExpense}
            disabled={addingExpense || !expAmount}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {addingExpense ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add
          </button>
        </div>

        {/* Expenses List */}
        {expenses.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            No expenses recorded yet.
          </p>
        ) : (
          <table className="tracker-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id}>
                  <td className="text-[12px] text-muted-foreground">{exp.date}</td>
                  <td className="text-[12px]">
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium">
                      {exp.category}
                    </span>
                  </td>
                  <td className="text-[12px] text-muted-foreground">{exp.description}</td>
                  <td className="text-[12px] font-medium text-right">
                    {formatINR(exp.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
