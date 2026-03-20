'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownLeft, ArrowUpRight, Check, ChevronDown, CreditCard, Eye,
  Filter, Loader2, MoreHorizontal, RefreshCw, Smartphone, Trash2, X,
  Wallet, TrendingDown, TrendingUp, Zap, ShoppingCart, Megaphone,
  Wrench, Users, Truck, Utensils, Plane, Repeat, Home, Receipt, ArrowLeftRight,
  CheckCircle2, Clock, XCircle, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/currency-converter';
import { type ExpenseCategory, EXPENSE_CATEGORY_META } from '@/lib/sms-parser';

// ── Types ────────────────────────────────────────────────────────────

type TxnStatus = 'pending' | 'approved' | 'dismissed';
type TxnType = 'debit' | 'credit';
type TxnMode = 'upi' | 'neft' | 'imps' | 'card' | 'atm' | 'emi' | 'auto_debit' | 'cheque' | 'other';

interface Transaction {
  id: string;
  type: TxnType;
  amount: number;
  account: string;
  date: string;
  mode: TxnMode;
  merchant?: string;
  reference?: string;
  balance?: number;
  category: ExpenseCategory;
  rawMessage: string;
  bank: string;
  confidence: number;
  status: TxnStatus;
  createdAt: string;
  reviewedAt?: string;
  note?: string;
}

type TabFilter = 'all' | 'pending' | 'approved';

// ── Constants ────────────────────────────────────────────────────────

const MODE_ICONS: Record<TxnMode, typeof CreditCard> = {
  upi: Smartphone, neft: ArrowLeftRight, imps: Zap, card: CreditCard,
  atm: Wallet, emi: Repeat, auto_debit: Repeat, cheque: Receipt, other: MoreHorizontal,
};

const MODE_LABELS: Record<TxnMode, string> = {
  upi: 'UPI', neft: 'NEFT', imps: 'IMPS', card: 'Card', atm: 'ATM',
  emi: 'EMI', auto_debit: 'Auto Debit', cheque: 'Cheque', other: 'Other',
};

const CATEGORY_ICONS: Record<ExpenseCategory, typeof Receipt> = {
  advertising: Megaphone, inventory: ShoppingCart, tools: Wrench, salary: Users,
  logistics: Truck, food: Utensils, travel: Plane, subscription: Repeat,
  rent: Home, transfer: ArrowLeftRight, refund: RefreshCw, income: TrendingUp, other: Receipt,
};

const ALL_CATEGORIES: ExpenseCategory[] = [
  'advertising', 'inventory', 'tools', 'salary', 'logistics', 'food',
  'travel', 'subscription', 'rent', 'transfer', 'refund', 'income', 'other',
];

// Finance-aligned categories for manual tagging (shown in category selector based on transaction type)
const FINANCE_INCOME_CATS = [
  { value: 'cod-deposit', label: 'COD Deposit', color: '#10b981' },
  { value: 'prepaid-settlement', label: 'Prepaid Settlement', color: '#3b82f6' },
  { value: 'affiliate', label: 'Affiliate', color: '#8b5cf6' },
  { value: 'refund-received', label: 'Refund Received', color: '#f59e0b' },
  { value: 'loan-received', label: 'Loan / Credit', color: '#06b6d4' },
  { value: 'marketplace', label: 'Marketplace', color: '#ec4899' },
  { value: 'other-income', label: 'Other Income', color: '#6b7280' },
];

const FINANCE_EXPENSE_CATS = [
  { value: 'inventory', label: 'Inventory / COGS', color: '#f97316' },
  { value: 'supplier', label: 'Supplier Payment', color: '#f43f5e' },
  { value: 'shipping', label: 'Shipping', color: '#0ea5e9' },
  { value: 'marketing', label: 'Marketing / Ads', color: '#8b5cf6' },
  { value: 'returns', label: 'Returns / RTO', color: '#ef4444' },
  { value: 'tools', label: 'Tools / Software', color: '#06b6d4' },
  { value: 'freelance', label: 'Freelance', color: '#3b82f6' },
  { value: 'other', label: 'Other', color: '#6b7280' },
];

const STATUS_META: Record<TxnStatus, { label: string; icon: typeof Check; color: string; bg: string }> = {
  pending:   { label: 'Pending',   icon: Clock,        color: 'text-amber-400',   bg: 'bg-amber-500/15' },
  approved:  { label: 'Approved',  icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  dismissed: { label: 'Dismissed', icon: XCircle,      color: 'text-zinc-500',    bg: 'bg-zinc-500/15' },
};

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00+05:30').toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short',
  });
}

function formatDateFull(d: string): string {
  return new Date(d + 'T00:00:00+05:30').toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', weekday: 'short',
  });
}

// ── Animated Number ──────────────────────────────────────────────────

function AnimNum({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 500;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setDisplay(Math.round(start + diff * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{formatINR(display)}</>;
}

// ── Components ───────────────────────────────────────────────────────

function CategoryBadge({ category, onClick }: { category: ExpenseCategory; onClick?: () => void }) {
  const meta = EXPENSE_CATEGORY_META[category];
  const Icon = CATEGORY_ICONS[category] ?? Receipt;
  // Look up in finance cats as fallback for new finance-aligned categories
  const allFinanceCats = [...FINANCE_INCOME_CATS, ...FINANCE_EXPENSE_CATS];
  const financeCat = allFinanceCats.find((c) => c.value === category);
  const label = meta?.label ?? financeCat?.label ?? category;
  const color = meta?.color ?? financeCat?.color ?? '#6b7280';
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition',
        onClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default',
      )}
      style={{ backgroundColor: color + '20', color }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function ModeBadge({ mode }: { mode: TxnMode }) {
  const Icon = MODE_ICONS[mode];
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <Icon className="h-3 w-3" />
      {MODE_LABELS[mode]}
    </span>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deduplicating, setDeduplicating] = useState(false);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, totalDebit: 0, totalCredit: 0 });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('status', tab);
      const res = await fetch(`/api/transactions?action=list&key=orbit-sms-ingest-2026&${params}`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions ?? []);
        setSummary(data.summary ?? summary);
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  // Filtered: hide dismissed, then apply search
  const filtered = useMemo(() => {
    const visible = transactions.filter((t) => t.status !== 'dismissed');
    if (!searchQuery.trim()) return visible;
    const q = searchQuery.toLowerCase();
    return visible.filter((t) =>
      (t.merchant?.toLowerCase().includes(q)) ||
      t.rawMessage.toLowerCase().includes(q) ||
      t.category.includes(q) ||
      t.mode.includes(q) ||
      String(t.amount).includes(q)
    );
  }, [transactions, searchQuery]);

  // Group by date, sorted within each day by createdAt desc (latest first)
  const groupedByDate = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    for (const t of filtered) {
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    }
    for (const txns of Object.values(map)) {
      txns.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);


  // ── Actions ────────────────────────────────────────────────────────

  async function updateTransaction(id: string, status: TxnStatus, category?: ExpenseCategory) {
    setActionLoading(true);
    try {
      await fetch('/api/transactions?key=orbit-sms-ingest-2026', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review', id, status, category }),
      });
      setTransactions((prev) =>
        prev.map((t) => t.id === id ? { ...t, status, ...(category ? { category } : {}) } : t)
      );
    } finally { setActionLoading(false); }
  }

  async function bulkAction(action: 'bulk-approve' | 'bulk-dismiss') {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    try {
      await fetch('/api/transactions?key=orbit-sms-ingest-2026', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: Array.from(selectedIds) }),
      });
      const newStatus = action === 'bulk-approve' ? 'approved' : 'dismissed';
      setTransactions((prev) =>
        prev.map((t) => selectedIds.has(t.id) ? { ...t, status: newStatus as TxnStatus } : t)
      );
      setSelectedIds(new Set());
    } finally { setActionLoading(false); }
  }

  async function deleteDuplicates() {
    setDeduplicating(true);
    try {
      const res = await fetch('/api/transactions?key=orbit-sms-ingest-2026', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deduplicate' }),
      });
      const data = await res.json();
      if (data.success && data.deleted > 0) {
        await fetchTransactions();
      }
    } finally { setDeduplicating(false); }
  }

  async function deleteAll() {
    setActionLoading(true);
    try {
      await fetch('/api/transactions?key=orbit-sms-ingest-2026', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-all' }),
      });
      setTransactions([]);
      setSummary({ total: 0, pending: 0, approved: 0, totalDebit: 0, totalCredit: 0 });
      setShowDeleteConfirm(false);
    } finally { setActionLoading(false); }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t) => t.id)));
    }
  }

  const pendingCount = transactions.filter((t) => t.status === 'pending').length;

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Auto-captured bank transactions from SMS
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-amber-400 text-sm font-medium"
              >
                <Clock className="h-3.5 w-3.5" />
                {pendingCount} to review
              </motion.div>
            )}
            <button
              onClick={fetchTransactions}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground hover:bg-card/80"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
            {transactions.length > 0 && (
              <>
                <button
                  onClick={deleteDuplicates}
                  disabled={deduplicating}
                  className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-400 transition hover:bg-amber-500/15 disabled:opacity-50"
                  title="Remove duplicate transactions using reference numbers"
                >
                  {deduplicating
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Filter className="h-3.5 w-3.5" />}
                  Delete Dupes
                </button>
              <div className="relative">
                <button
                  onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                  className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/15"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All
                </button>
                <AnimatePresence>
                  {showDeleteConfirm && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.95 }}
                      className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-red-500/30 bg-[#0c0c0e] p-3 shadow-xl space-y-2"
                    >
                      <p className="text-[12px] text-muted-foreground">Delete all {transactions.length} transactions? This cannot be undone.</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={deleteAll}
                          disabled={actionLoading}
                          className="flex-1 rounded-md bg-red-500/20 py-1.5 text-[12px] font-medium text-red-400 transition hover:bg-red-500/30"
                        >
                          {actionLoading ? 'Deleting...' : 'Yes, delete all'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="rounded-md bg-white/5 px-3 py-1.5 text-[12px] text-muted-foreground transition hover:bg-white/10"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              </>
            )}
          </div>
        </motion.div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([
            { label: 'Total Spent', value: summary.totalDebit, icon: TrendingDown, color: 'text-red-400', isCount: false },
            { label: 'Total Received', value: summary.totalCredit, icon: TrendingUp, color: 'text-emerald-400', isCount: false },
            { label: 'Net Flow', value: summary.totalCredit - summary.totalDebit, icon: ArrowLeftRight, color: summary.totalCredit - summary.totalDebit >= 0 ? 'text-emerald-400' : 'text-red-400', isCount: false },
            { label: 'Transactions', value: summary.total, icon: Receipt, color: 'text-violet-400', isCount: true },
          ] as const).map(({ label, value, icon: Icon, color, isCount }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 space-y-1"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
                <div className={cn('rounded-lg p-1.5', color.replace('text-', 'bg-').replace('400', '500/15'))}>
                  <Icon className={cn('h-3.5 w-3.5', color)} />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {isCount ? value.toLocaleString('en-IN') : <AnimNum value={value} />}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Tabs + Search + Bulk Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-1.5">
            {(['all', 'pending', 'approved'] as TabFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelectedIds(new Set()); }}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition capitalize',
                  tab === t
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                )}
              >
                {t}
                {t === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">{pendingCount}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search merchant, amount..."
                className="w-48 rounded-lg border border-border bg-card/60 pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 backdrop-blur-sm"
              />
            </div>

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1.5"
              >
                <span className="text-[11px] text-muted-foreground">{selectedIds.size} selected</span>
                <button
                  onClick={() => bulkAction('bulk-approve')}
                  disabled={actionLoading}
                  className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-[12px] font-medium text-emerald-400 transition hover:bg-emerald-500/25"
                >
                  <Check className="h-3 w-3" /> Approve
                </button>
                <button
                  onClick={() => bulkAction('bulk-dismiss')}
                  disabled={actionLoading}
                  className="flex items-center gap-1 rounded-md bg-zinc-500/15 px-2.5 py-1 text-[12px] font-medium text-zinc-400 transition hover:bg-zinc-500/25"
                >
                  <X className="h-3 w-3" /> Dismiss
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {/* Transaction List */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-4"
          >
            {/* Select All */}
            {filtered.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <button
                  onClick={selectAllVisible}
                  className="h-4 w-4 rounded border border-border flex items-center justify-center transition hover:border-primary"
                >
                  {selectedIds.size === filtered.length && filtered.length > 0 && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                </button>
                <span className="text-[11px] text-muted-foreground">
                  {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Grouped by Date */}
            {groupedByDate.map(([date, txns]) => (
              <div key={date} className="space-y-1.5">
                <div className="flex items-center gap-3 px-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {formatDateFull(date)}
                  </p>
                  <div className="h-px flex-1 bg-border/50" />
                  <p className="text-[11px] text-muted-foreground/60">
                    {txns.length} txn{txns.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="space-y-1">
                  {txns.map((txn) => {
                    const isExpanded = expandedId === txn.id;
                    const isSelected = selectedIds.has(txn.id);
                    const StatusIcon = STATUS_META[txn.status].icon;

                    return (
                      <div key={txn.id}>
                        <div
                          className={cn(
                            'group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition cursor-pointer',
                            isSelected
                              ? 'border-primary/30 bg-primary/5'
                              : isExpanded
                              ? 'border-border bg-card/80'
                              : 'border-border/50 bg-card/40 hover:bg-card/60 hover:border-border',
                          )}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSelect(txn.id); }}
                            className={cn(
                              'h-4 w-4 shrink-0 rounded border flex items-center justify-center transition',
                              isSelected ? 'border-primary bg-primary/20' : 'border-border hover:border-primary/50'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 text-primary" />}
                          </button>

                          {/* Type indicator */}
                          <div className={cn(
                            'shrink-0 rounded-lg p-1.5',
                            txn.type === 'debit' ? 'bg-red-500/10' : 'bg-emerald-500/10'
                          )}>
                            {txn.type === 'debit'
                              ? <ArrowUpRight className="h-4 w-4 text-red-400" />
                              : <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                            }
                          </div>

                          {/* Main content — click to expand */}
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : txn.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground truncate">
                                {txn.merchant ?? (txn.type === 'debit' ? 'Debit' : 'Credit')}
                              </span>
                              <ModeBadge mode={txn.mode} />
                              {txn.reference && (
                                <span className="text-[10px] font-mono text-muted-foreground/50 truncate max-w-[80px]" title={txn.reference}>
                                  #{txn.reference.slice(-8)}
                                </span>
                              )}
                              {txn.status !== 'pending' && (
                                <StatusIcon className={cn('h-3 w-3', STATUS_META[txn.status].color)} />
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <CategoryBadge category={txn.category} />
                              {txn.confidence < 0.85 && (
                                <span className="text-[9px] text-amber-400/60">low confidence</span>
                              )}
                            </div>
                          </button>

                          {/* Amount */}
                          <div className="text-right shrink-0">
                            <p className={cn(
                              'text-sm font-bold',
                              txn.type === 'debit' ? 'text-red-400' : 'text-emerald-400'
                            )}>
                              {txn.type === 'debit' ? '-' : '+'}{formatINR(txn.amount)}
                            </p>
                            {txn.balance !== undefined && txn.balance !== null && (
                              <p className="text-[10px] text-muted-foreground/50">Bal: {formatINR(txn.balance)}</p>
                            )}
                          </div>

                          {/* Quick actions */}
                          {txn.status === 'pending' && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); updateTransaction(txn.id, 'approved'); }}
                                className="rounded-md p-1 text-emerald-400 hover:bg-emerald-500/15 transition"
                                title="Approve"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); updateTransaction(txn.id, 'dismissed'); }}
                                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-500/15 transition"
                                title="Dismiss"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Expanded Detail */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="ml-7 mr-2 mb-1 mt-0.5 rounded-lg border border-border/30 bg-[#0a0a0c] p-3 space-y-3">
                                {/* Raw message */}
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Original SMS</p>
                                  <p className="text-[12px] text-muted-foreground leading-relaxed font-mono">
                                    {txn.rawMessage}
                                  </p>
                                </div>

                                {/* Details grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                                  <div>
                                    <p className="text-muted-foreground/50">Account</p>
                                    <p className="text-foreground font-medium">**{txn.account}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground/50">Mode</p>
                                    <p className="text-foreground font-medium">{MODE_LABELS[txn.mode]}</p>
                                  </div>
                                  {txn.reference && (
                                    <div>
                                      <p className="text-muted-foreground/50">Reference</p>
                                      <p className="text-foreground font-medium font-mono">{txn.reference}</p>
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-muted-foreground/50">Confidence</p>
                                    <p className={cn('font-medium', txn.confidence >= 0.85 ? 'text-emerald-400' : 'text-amber-400')}>
                                      {Math.round(txn.confidence * 100)}%
                                    </p>
                                  </div>
                                </div>

                                {/* Category selector */}
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5">Category</p>
                                  {editingCategory === txn.id ? (
                                    <div className="space-y-2">
                                      <div>
                                        <p className="text-[9px] font-medium uppercase tracking-wider text-emerald-400/60 mb-1">Income</p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {FINANCE_INCOME_CATS.map((cat) => (
                                            <button
                                              key={cat.value}
                                              onClick={() => {
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                updateTransaction(txn.id, txn.status, cat.value as any);
                                                setEditingCategory(null);
                                              }}
                                              className={cn(
                                                'rounded-full px-2 py-0.5 text-[11px] font-medium transition',
                                                txn.category === cat.value ? 'ring-1 ring-primary' : 'opacity-60 hover:opacity-100',
                                              )}
                                              style={{ backgroundColor: cat.color + '20', color: cat.color }}
                                            >
                                              {cat.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-[9px] font-medium uppercase tracking-wider text-red-400/60 mb-1">Expense</p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {FINANCE_EXPENSE_CATS.map((cat) => (
                                            <button
                                              key={cat.value}
                                              onClick={() => {
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                updateTransaction(txn.id, txn.status, cat.value as any);
                                                setEditingCategory(null);
                                              }}
                                              className={cn(
                                                'rounded-full px-2 py-0.5 text-[11px] font-medium transition',
                                                txn.category === cat.value ? 'ring-1 ring-primary' : 'opacity-60 hover:opacity-100',
                                              )}
                                              style={{ backgroundColor: cat.color + '20', color: cat.color }}
                                            >
                                              {cat.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => setEditingCategory(null)}
                                        className="text-[11px] text-muted-foreground hover:text-foreground"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <CategoryBadge category={txn.category} onClick={() => setEditingCategory(txn.id)} />
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                                  {txn.status === 'pending' && (
                                    <>
                                      <button
                                        onClick={() => updateTransaction(txn.id, 'approved')}
                                        className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-1.5 text-[12px] font-medium text-emerald-400 transition hover:bg-emerald-500/25"
                                      >
                                        <Check className="h-3 w-3" /> Approve
                                      </button>
                                      <button
                                        onClick={() => updateTransaction(txn.id, 'dismissed')}
                                        className="flex items-center gap-1.5 rounded-md bg-zinc-500/15 px-3 py-1.5 text-[12px] font-medium text-zinc-400 transition hover:bg-zinc-500/25"
                                      >
                                        <X className="h-3 w-3" /> Dismiss
                                      </button>
                                    </>
                                  )}
                                  {txn.status === 'approved' && (
                                    <button
                                      onClick={() => updateTransaction(txn.id, 'pending')}
                                      className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-3 py-1.5 text-[12px] font-medium text-amber-400 transition hover:bg-amber-500/25"
                                    >
                                      <RefreshCw className="h-3 w-3" /> Unreview
                                    </button>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Empty */}
            {filtered.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Wallet className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No transactions yet</p>
                <p className="text-[12px] mt-1 max-w-sm text-center text-muted-foreground/60">
                  Run the SMS reader script to auto-capture HDFC bank transactions:
                </p>
                <code className="mt-3 rounded-lg bg-white/5 px-4 py-2 text-[12px] text-primary font-mono">
                  node scripts/sms-reader.mjs --watch
                </code>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
