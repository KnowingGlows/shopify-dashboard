import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';
import { aggregateSalesData } from '@/lib/sales-aggregator';
import { convertToINR } from '@/lib/currency-converter';

// ── Types ────────────────────────────────────────────────────────────────────

interface BrandDailyData {
  sales: number;
  grossMargin: number; // 0.55 = 55%
  grossProfit: number;
  adSpend: number;
  codSales: number;
  deliveryRate: number; // 0-100
}

interface FinanceDailyEntry {
  date: string; // YYYY-MM-DD
  totalSales: number;
  grossMargin: number; // weighted avg or legacy single value
  grossProfit: number;
  adSpend: number;
  roas: number;
  revenue: number;
  paymentProcessorFee: number;
  shippingCost: number;
  netProfit: number;
  codSalesByBrand: Record<string, number>;
  prepaidSettlement?: number; // total prepaid settlement received this day
  brandData?: Record<string, BrandDailyData>; // per-brand breakdown
  enteredBy: string;
  updatedAt: string;
}

interface OperationalBaseline {
  id: string;
  type: 'daily' | 'monthly';
  category: string;
  label: string;
  amount: number;
  dueDate?: string; // YYYY-MM-DD when payment is due
  isPaid?: boolean; // whether paid this month
  paidDate?: string; // YYYY-MM-DD when last paid
  updatedAt: string;
}

interface FinanceExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  endDate?: string; // for date-range expenses
  recurring?: boolean; // if true, repeats on same day each month
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dueDayToDate(day: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

function getISTDate(date?: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date ?? new Date());
}

function getISTDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + 'T00:00:00+05:30');
  const end = new Date(endDate + 'T00:00:00+05:30');
  while (current <= end) {
    dates.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

interface SalesForDateResult {
  totalSales: number;
  salesByBrand: Record<string, number>;
  codSalesByBrand: Record<string, number>;
}

// Fetch yesterday's sales + COD breakdown from Shopify
async function fetchSalesForDate(dateStr: string): Promise<SalesForDateResult> {
  try {
    const stores = await getShopifyStores();
    if (stores.length === 0) return { totalSales: 0, salesByBrand: {}, codSalesByBrand: {} };

    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const [year, month, day] = dateStr.split('-').map(Number);
    const startUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - IST_OFFSET_MS);
    const endUTC = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0) - IST_OFFSET_MS);

    const { ordersData } = await fetchAllStoresOrders(stores, {
      createdAtMin: startUTC.toISOString(),
      createdAtMax: endUTC.toISOString(),
    });

    const metrics = aggregateSalesData(ordersData);

    // Per-brand sales + COD breakdown
    const salesByBrand: Record<string, number> = {};
    const codSalesByBrand: Record<string, number> = {};
    for (const { storeName, orders } of ordersData) {
      let codTotal = 0;
      for (const order of orders) {
        if (order.financial_status === 'pending' && !order.cancelled_at) {
          const amount = Number(order.current_total_price ?? order.total_price) || 0;
          codTotal += convertToINR(amount, order.currency);
        }
      }
      const storeMetric = metrics.storeBreakdown.find((s) => s.storeName === storeName);
      salesByBrand[storeName] = Math.round(storeMetric?.totalSalesINR ?? 0);
      codSalesByBrand[storeName] = Math.round(codTotal);
    }

    return { totalSales: metrics.totalSalesINR, salesByBrand, codSalesByBrand };
  } catch (error) {
    console.error('Error fetching sales for date:', dateStr, error);
    return { totalSales: 0, salesByBrand: {}, codSalesByBrand: {} };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (isFirebaseAvailable() ? getFirestore() : null);

// ── In-memory settings cache (reduces reads for rarely-changing data) ────────
interface CachedValue<T> { data: T; ts: number }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const settingsCache: Record<string, CachedValue<unknown>> = {};

async function getCachedSetting<T>(firestore: FirebaseFirestore.Firestore, docId: string, fallback: T): Promise<T> {
  const key = `settings_${docId}`;
  const cached = settingsCache[key];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data as T;

  try {
    const doc = await firestore.collection(COLLECTIONS.SETTINGS).doc(docId).get();
    const data = doc.exists ? (doc.data() as T) : fallback;
    settingsCache[key] = { data, ts: Date.now() };
    return data;
  } catch {
    return fallback;
  }
}

function invalidateSettingsCache(docId?: string) {
  if (docId) delete settingsCache[`settings_${docId}`];
  else Object.keys(settingsCache).forEach((k) => delete settingsCache[k]);
}

// ── GET /api/finance ─────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'combined':
        return getCombinedFinanceData(searchParams);
      case 'daily':
        return getDailyEntries(searchParams);
      case 'baselines':
        return getBaselines();
      case 'expenses':
        return getExpenses();
      case 'cod-projections':
        return getCODProjections(searchParams);
      case 'fetch-sales':
        return fetchSalesData(searchParams);
      case 'reminders':
        return getReminders();
      case 'delivery-rates':
        return getDeliveryRates();
      case 'spending-power':
        return getSpendingPower(searchParams);
      case 'spending-config':
        return getSpendingConfig();
      case 'planned':
        return getPlannedExpenses();
      default:
        return getFinanceSummary(searchParams);
    }
  } catch (error) {
    console.error('Finance GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch finance data.' }, { status: 500 });
  }
}

// ── POST /api/finance ────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action;

    switch (action) {
      case 'save-daily':
        return saveDailyEntry(body);
      case 'save-baseline':
        return saveBaseline(body);
      case 'add-expense':
        return addExpense(body);
      case 'delete-baseline':
        return deleteBaseline(body);
      case 'delete-all-baselines':
        return deleteAllBaselines();
      case 'delete-expense':
        return deleteExpense(body);
      case 'update-expense':
        return updateExpense(body);
      case 'save-delivery-rates':
        return saveDeliveryRates(body);
      case 'save-spending-config':
        return saveSpendingConfig(body);
      case 'save-income':
        return saveIncome(body);
      case 'dismiss-reminder':
        return dismissReminder(body);
      case 'add-planned':
        return addPlannedExpense(body);
      case 'update-planned':
        return updatePlannedExpense(body);
      case 'delete-planned':
        return deletePlannedExpense(body);
      case 'clear-all': {
        const db = getFirestore();
        if (!db) return NextResponse.json({ error: 'No database' }, { status: 500 });
        const cols = [COLLECTIONS.FINANCE_DAILY, COLLECTIONS.FINANCE_EXPENSES, COLLECTIONS.FINANCE_INCOME];
        let deleted = 0;
        for (const col of cols) {
          const snap = await db.collection(col).get();
          for (let i = 0; i < snap.docs.length; i += 500) {
            const batch = db.batch();
            snap.docs.slice(i, i + 500).forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
          }
          deleted += snap.docs.length;
        }
        return NextResponse.json({ success: true, deleted });
      }
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (error) {
    console.error('Finance POST error:', error);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}

// ── DELETE /api/finance ──────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { date } = body;
    if (!date) return NextResponse.json({ error: 'Date is required.' }, { status: 400 });

    const firestore = db();
    if (!firestore) return NextResponse.json({ success: true });

    const docId = `daily_${date}`;
    await firestore.collection(COLLECTIONS.FINANCE_DAILY).doc(docId).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Finance DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete entry.' }, { status: 500 });
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function fetchSalesData(params: URLSearchParams) {
  const date = params.get('date') ?? getISTDate(new Date(Date.now() - 86400000)); // default: yesterday
  const { totalSales, salesByBrand, codSalesByBrand } = await fetchSalesForDate(date);
  return NextResponse.json({ date, totalSales, salesByBrand, codSalesByBrand });
}

async function getDailyEntries(params: URLSearchParams) {
  const firestore = db();
  const startDate = params.get('start') ?? getISTDate(new Date(Date.now() - 30 * 86400000));
  const endDate = params.get('end') ?? getISTDate();

  if (!firestore) {
    return NextResponse.json({ entries: [] });
  }

  const snapshot = await firestore
    .collection(COLLECTIONS.FINANCE_DAILY)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'desc')
    .get();

  const entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ entries });
}

async function saveDailyEntry(body: Record<string, unknown>) {
  const firestore = db();
  const date = (body.date as string) ?? getISTDate(new Date(Date.now() - 86400000));

  // Per-brand data (new format)
  const brandData = (body.brandData as Record<string, BrandDailyData>) ?? {};
  const hasBrandData = Object.keys(brandData).length > 0;

  // Compute totals from brand data if available, otherwise use legacy fields
  let totalSales = 0;
  let grossProfit = 0;
  let adSpend = 0;
  const codSalesByBrand: Record<string, number> = {};

  if (hasBrandData) {
    for (const [brand, data] of Object.entries(brandData)) {
      totalSales += data.sales;
      grossProfit += data.grossProfit;
      adSpend += data.adSpend;
      codSalesByBrand[brand] = data.codSales;
    }
  } else {
    totalSales = Number(body.totalSales) || 0;
    const gm = Number(body.grossMargin) || 0;
    grossProfit = totalSales * gm;
    adSpend = Number(body.adSpend) || 0;
    Object.assign(codSalesByBrand, (body.codSalesByBrand as Record<string, number>) ?? {});
  }

  const grossMargin = totalSales > 0 ? grossProfit / totalSales : 0;
  const actualAdCost = Math.round(adSpend * 1.14);
  const netProfit = grossProfit - actualAdCost;

  const prepaidSettlement = Number(body.prepaidSettlement) || 0;

  const entry: FinanceDailyEntry = {
    date,
    totalSales,
    grossMargin,
    grossProfit,
    adSpend,
    roas: 0,
    revenue: 0,
    paymentProcessorFee: 0,
    shippingCost: 0,
    netProfit,
    codSalesByBrand,
    prepaidSettlement,
    enteredBy: (body.enteredBy as string) ?? '',
    updatedAt: new Date().toISOString(),
  };
  if (hasBrandData) (entry as unknown as Record<string, unknown>).brandData = brandData;

  if (!firestore) {
    return NextResponse.json({ success: true, entry });
  }

  const docId = `daily_${date}`;
  await firestore.collection(COLLECTIONS.FINANCE_DAILY).doc(docId).set(entry, { merge: true });
  return NextResponse.json({ success: true, entry });
}

async function getBaselines() {
  const firestore = db();
  if (!firestore) {
    return NextResponse.json({ daily: [], monthly: [] });
  }

  const snapshot = await firestore.collection(COLLECTIONS.FINANCE_BASELINES).get();
  const baselines = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  // Auto-advance monthly baselines: if dueDate is in a past month and isPaid, advance to same day this month
  const today = getISTDate();
  const currentMonth = today.slice(0, 7); // YYYY-MM
  const updates: Array<{ id: string; dueDate: string }> = [];

  for (const b of baselines) {
    const bl = b as Record<string, unknown>;
    if (bl.type !== 'monthly' || !bl.dueDate) continue;
    const blMonth = (bl.dueDate as string).slice(0, 7);
    if (blMonth < currentMonth) {
      // Advance to same day in current month
      const day = (bl.dueDate as string).slice(8, 10);
      const newDate = `${currentMonth}-${day}`;
      bl.dueDate = newDate;
      bl.isPaid = false;
      delete bl.paidDate;
      updates.push({ id: bl.id as string, dueDate: newDate });
    }
  }

  // Persist updates in background
  if (updates.length > 0) {
    for (const u of updates) {
      firestore.collection(COLLECTIONS.FINANCE_BASELINES).doc(u.id).update({
        dueDate: u.dueDate,
        isPaid: false,
        paidDate: null,
      }).catch(() => {});
    }
  }

  const daily = baselines.filter((b: Record<string, unknown>) => b.type === 'daily');
  const monthly = baselines.filter((b: Record<string, unknown>) => b.type === 'monthly');

  return NextResponse.json({ daily, monthly });
}

async function saveBaseline(body: Record<string, unknown>) {
  const firestore = db();
  const baseline: OperationalBaseline = {
    id: (body.id as string) ?? crypto.randomUUID(),
    type: (body.type as 'daily' | 'monthly') ?? 'daily',
    category: (body.category as string) ?? '',
    label: (body.label as string) ?? '',
    amount: Number(body.amount) || 0,
    updatedAt: new Date().toISOString(),
  };
  if (body.dueDate) baseline.dueDate = body.dueDate as string;
  if (body.dueDay) baseline.dueDate = dueDayToDate(Number(body.dueDay));
  if (body.isPaid === true) baseline.isPaid = true;
  if (body.paidDate) baseline.paidDate = body.paidDate as string;

  if (!firestore) {
    return NextResponse.json({ success: true, baseline });
  }

  await firestore.collection(COLLECTIONS.FINANCE_BASELINES).doc(baseline.id).set(baseline);
  return NextResponse.json({ success: true, baseline });
}

async function getExpenses() {
  const firestore = db();
  if (!firestore) {
    return NextResponse.json({ expenses: [] });
  }

  const snapshot = await firestore
    .collection(COLLECTIONS.FINANCE_EXPENSES)
    .orderBy('createdAt', 'desc')
    .get();

  const rawExpenses = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: data.id ?? doc.id,
      category: data.category ?? '',
      description: data.description ?? '',
      amount: data.amount ?? 0,
      date: data.date ?? '',
      ...(data.endDate ? { endDate: data.endDate } : {}),
      recurring: data.recurring ?? false,
      createdAt: data.createdAt ?? '',
    };
  });

  // Expand recurring expenses into future months (up to 12 months ahead)
  const today = new Date();
  const expanded: typeof rawExpenses = [];
  for (const exp of rawExpenses) {
    expanded.push(exp);
    if (exp.recurring && exp.date) {
      const origDate = new Date(exp.date + 'T00:00:00');
      const origDay = origDate.getDate();
      for (let m = 1; m <= 12; m++) {
        const nextDate = new Date(origDate);
        nextDate.setMonth(origDate.getMonth() + m);
        // Handle months with fewer days (e.g. 31st → 28th in Feb)
        if (nextDate.getDate() !== origDay) {
          nextDate.setDate(0); // last day of previous month
        }
        if (nextDate <= today) continue; // skip past dates (original already covers them)
        const dateStr = nextDate.toISOString().split('T')[0];
        expanded.push({
          ...exp,
          id: `${exp.id}_recurring_${dateStr}`,
          date: dateStr,
          recurring: true,
        });
      }
    }
  }

  return NextResponse.json({ expenses: expanded });
}

async function addExpense(body: Record<string, unknown>) {
  const firestore = db();
  const now = new Date().toISOString();
  const expense: FinanceExpense = {
    id: crypto.randomUUID(),
    category: (body.category as string) ?? '',
    description: (body.description as string) ?? '',
    amount: Number(body.amount) || 0,
    date: (body.date as string) ?? now.split('T')[0],
    createdAt: now,
  };
  if (body.endDate) expense.endDate = body.endDate as string;
  if (body.recurring) expense.recurring = true;

  if (!expense.category || !expense.amount) {
    return NextResponse.json({ error: 'Category and amount are required.' }, { status: 400 });
  }

  if (!firestore) {
    return NextResponse.json({ success: true, expense });
  }

  await firestore.collection(COLLECTIONS.FINANCE_EXPENSES).doc(expense.id).set(expense);
  return NextResponse.json({ success: true, expense });
}

async function saveIncome(body: Record<string, unknown>) {
  const firestore = db();
  const now = new Date().toISOString();
  const income: Record<string, unknown> = {
    id: crypto.randomUUID(),
    category: (body.category as string) ?? '',
    description: (body.description as string) ?? '',
    amount: Number(body.amount) || 0,
    date: (body.date as string) ?? now.split('T')[0],
    enteredBy: (body.enteredBy as string) ?? '',
    createdAt: now,
  };
  if (body.endDate) income.endDate = body.endDate as string;

  if (!income.category || !income.amount) {
    return NextResponse.json({ error: 'Category and amount are required.' }, { status: 400 });
  }

  if (!firestore) {
    return NextResponse.json({ success: true, income });
  }

  await firestore.collection(COLLECTIONS.FINANCE_INCOME).doc(income.id as string).set(income);
  return NextResponse.json({ success: true, income });
}

function getWeekLabel(date: Date): string {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayOfMonth = date.getDate();
  const weekOfMonth = Math.ceil(dayOfMonth / 7);
  return `Week ${weekOfMonth}, ${monthNames[date.getMonth()]}`;
}

async function getDeliveryRates() {
  const firestore = db();
  if (!firestore) return NextResponse.json({ rates: {} });
  try {
    const doc = await firestore.collection(COLLECTIONS.SETTINGS).doc('delivery_rates').get();
    return NextResponse.json({ rates: doc.exists ? (doc.data()?.rates ?? {}) : {} });
  } catch { return NextResponse.json({ rates: {} }); }
}

async function saveDeliveryRates(body: Record<string, unknown>) {
  const firestore = db();
  const rates = (body.rates as Record<string, number>) ?? {};
  if (!firestore) return NextResponse.json({ success: true });
  await firestore.collection(COLLECTIONS.SETTINGS).doc('delivery_rates').set({ rates, updatedAt: new Date().toISOString() });
  invalidateSettingsCache('delivery_rates');
  return NextResponse.json({ success: true });
}

async function getCODProjections(params: URLSearchParams) {
  const firestore = db();
  const COD_DELAY_DAYS = 7;

  // Load delivery rates from Firestore (shared across all users)
  let brandRates: Record<string, number> = {};
  if (firestore) {
    try {
      const doc = await firestore.collection(COLLECTIONS.SETTINGS).doc('delivery_rates').get();
      if (doc.exists) brandRates = doc.data()?.rates ?? {};
    } catch { /* ignore */ }
  }
  // Fall back to client-provided rates (legacy support)
  if (Object.keys(brandRates).length === 0) {
    try {
      const ratesParam = params.get('deliveryRates');
      if (ratesParam) brandRates = JSON.parse(ratesParam);
    } catch { /* ignore */ }
  }
  const defaultRate = Number(params.get('deliveryRate')) || 65;

  const today = getISTDate();
  const startDate = params.get('start') ?? today;

  const weeks: Array<{
    weekLabel: string;
    startDate: string;
    endDate: string;
    projectedAmount: number;
    codRevenue: number;
    brandBreakdown: Record<string, number>;
  }> = [];

  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(startDate + 'T00:00:00+05:30');
    weekStart.setDate(weekStart.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const salesStart = new Date(weekStart);
    salesStart.setDate(salesStart.getDate() - COD_DELAY_DAYS);
    const salesEnd = new Date(weekEnd);
    salesEnd.setDate(salesEnd.getDate() - COD_DELAY_DAYS);

    const salesStartStr = getISTDate(salesStart);
    const salesEndStr = getISTDate(salesEnd);

    let codRevenue = 0;
    const brandBreakdown: Record<string, number> = {};

    if (firestore) {
      const snapshot = await firestore
        .collection(COLLECTIONS.FINANCE_DAILY)
        .where('date', '>=', salesStartStr)
        .where('date', '<=', salesEndStr)
        .get();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        const codByBrand = data.codSalesByBrand ?? {};
        for (const [brand, amount] of Object.entries(codByBrand)) {
          const val = Number(amount) || 0;
          brandBreakdown[brand] = (brandBreakdown[brand] ?? 0) + val;
          codRevenue += val;
        }
      });
    }

    // Apply per-brand delivery rates
    let projectedAmount = 0;
    for (const [brand, amount] of Object.entries(brandBreakdown)) {
      const rate = brandRates[brand] ?? defaultRate;
      projectedAmount += Math.round(amount * (rate / 100));
    }

    weeks.push({
      weekLabel: getWeekLabel(weekStart),
      startDate: getISTDate(weekStart),
      endDate: getISTDate(weekEnd),
      projectedAmount,
      codRevenue,
      brandBreakdown,
    });
  }

  return NextResponse.json({ weeks, codDelayDays: COD_DELAY_DAYS });
}

async function getReminders() {
  const firestore = db();
  const today = getISTDate();

  if (!firestore) {
    // Check if CMO needs to enter today's data
    return NextResponse.json({
      reminders: [{
        type: 'cmo_daily',
        message: 'Enter yesterday\'s ad spend and ROAS',
        date: today,
        dismissed: false,
      }],
    });
  }

  // Check if yesterday's finance daily entry has adSpend filled
  const yesterday = getISTDate(new Date(Date.now() - 86400000));
  const docId = `daily_${yesterday}`;
  const doc = await firestore.collection(COLLECTIONS.FINANCE_DAILY).doc(docId).get();
  const data = doc.exists ? doc.data() : null;

  const reminders = [];
  if (!data || !data.adSpend) {
    reminders.push({
      type: 'cmo_daily',
      message: `Enter yesterday's (${yesterday}) ad spend and ROAS`,
      date: yesterday,
      dismissed: false,
      priority: 'high',
    });
  }

  return NextResponse.json({ reminders });
}

async function deleteBaseline(body: Record<string, unknown>) {
  const firestore = db();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 });
  if (!firestore) return NextResponse.json({ success: true });
  await firestore.collection(COLLECTIONS.FINANCE_BASELINES).doc(id).delete();
  return NextResponse.json({ success: true });
}

async function deleteAllBaselines() {
  const firestore = db();
  if (!firestore) return NextResponse.json({ success: true });
  const snapshot = await firestore.collection(COLLECTIONS.FINANCE_BASELINES).get();
  const batch = firestore.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return NextResponse.json({ success: true, deleted: snapshot.size });
}

async function deleteExpense(body: Record<string, unknown>) {
  const firestore = db();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 });
  if (!firestore) return NextResponse.json({ success: true });
  await firestore.collection(COLLECTIONS.FINANCE_EXPENSES).doc(id).delete();
  return NextResponse.json({ success: true });
}

async function updateExpense(body: Record<string, unknown>) {
  const firestore = db();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 });
  if (!firestore) return NextResponse.json({ success: true });

  const updates: Record<string, unknown> = {};
  if (body.description !== undefined) updates.description = body.description;
  if (body.amount !== undefined) updates.amount = Number(body.amount) || 0;
  if (body.category !== undefined) updates.category = body.category;
  if (body.date !== undefined) updates.date = body.date;
  if (body.endDate !== undefined) updates.endDate = body.endDate || null;

  await firestore.collection(COLLECTIONS.FINANCE_EXPENSES).doc(id).update(updates);
  return NextResponse.json({ success: true });
}

async function dismissReminder(body: Record<string, unknown>) {
  // For now just acknowledge - could store in Firestore for persistence
  return NextResponse.json({ success: true, type: body.type });
}

async function getSpendingConfig() {
  const firestore = db();
  if (!firestore) return NextResponse.json({ founderCutPct: 50, enabledItems: { founderCut: true, inventoryNeeds: true, baselines: true, expenses: true } });
  try {
    const doc = await firestore.collection(COLLECTIONS.SETTINGS).doc('spending_config').get();
    if (doc.exists) return NextResponse.json(doc.data());
    return NextResponse.json({ founderCutPct: 50, enabledItems: { founderCut: true, inventoryNeeds: true, baselines: true, expenses: true } });
  } catch { return NextResponse.json({ founderCutPct: 50, enabledItems: { founderCut: true, inventoryNeeds: true, baselines: true, expenses: true } }); }
}

async function saveSpendingConfig(body: Record<string, unknown>) {
  const firestore = db();
  if (!firestore) return NextResponse.json({ success: true });
  const config = {
    founderCutPct: Number(body.founderCutPct) ?? 50,
    enabledItems: (body.enabledItems as Record<string, boolean>) ?? {},
    updatedAt: new Date().toISOString(),
  };
  await firestore.collection(COLLECTIONS.SETTINGS).doc('spending_config').set(config, { merge: true });
  invalidateSettingsCache('spending_config');
  return NextResponse.json({ success: true });
}

async function getSpendingPower(params: URLSearchParams) {
  const firestore = db();
  if (!firestore) return NextResponse.json({ projectedDeposit: 0, founderCut: 0, inventoryNeeds: 0, baselines: 0, expenses: 0, spendingPower: 0, breakdown: [] });

  const today = getISTDate();
  const todayDate = new Date(today + 'T00:00:00+05:30');

  // 7-day window starting from today (matches COD Cash-In timeline)
  const weekStart = new Date(todayDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = getISTDate(weekStart);
  const weekEndStr = getISTDate(weekEnd);

  // Load spending config
  let founderCutPct = 50;
  let enabledItems: Record<string, boolean> = { founderCut: true, inventoryNeeds: true, baselines: true, expenses: true };
  try {
    const configDoc = await firestore.collection(COLLECTIONS.SETTINGS).doc('spending_config').get();
    if (configDoc.exists) {
      const configData = configDoc.data();
      founderCutPct = configData?.founderCutPct ?? 50;
      enabledItems = configData?.enabledItems ?? enabledItems;
    }
  } catch { /* ignore */ }

  // Override from query params if provided
  if (params.get('founderCutPct')) founderCutPct = Number(params.get('founderCutPct'));

  // COD projection for this week (sales from 2 days ago → projected deposit this week)
  const COD_DELAY_DAYS = 7;
  const salesStart = new Date(weekStart);
  salesStart.setDate(salesStart.getDate() - COD_DELAY_DAYS);
  const salesEnd = new Date(weekEnd);
  salesEnd.setDate(salesEnd.getDate() - COD_DELAY_DAYS);

  // Load delivery rates
  let brandRates: Record<string, number> = {};
  try {
    const doc = await firestore.collection(COLLECTIONS.SETTINGS).doc('delivery_rates').get();
    if (doc.exists) brandRates = doc.data()?.rates ?? {};
  } catch { /* ignore */ }

  let codRevenue = 0;
  let projectedDeposit = 0;
  const brandBreakdown: Record<string, number> = {};

  const codSnap = await firestore.collection(COLLECTIONS.FINANCE_DAILY)
    .where('date', '>=', getISTDate(salesStart))
    .where('date', '<=', getISTDate(salesEnd))
    .get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  codSnap.docs.forEach((doc: any) => {
    const data = doc.data();
    const codByBrand = data.codSalesByBrand ?? {};
    for (const [brand, amount] of Object.entries(codByBrand)) {
      const val = Number(amount) || 0;
      brandBreakdown[brand] = (brandBreakdown[brand] ?? 0) + val;
      codRevenue += val;
    }
  });

  for (const [brand, amount] of Object.entries(brandBreakdown)) {
    const rate = brandRates[brand] ?? 65;
    projectedDeposit += Math.round(amount * (rate / 100));
  }

  // Prepaid settlements this week
  let weekPrepaidSp = 0;
  if (firestore) {
    try {
      const prepaidSnap = await firestore.collection(COLLECTIONS.FINANCE_DAILY)
        .where('date', '>=', weekStartStr)
        .where('date', '<=', weekEndStr)
        .get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prepaidSnap.docs.forEach((doc: any) => {
        weekPrepaidSp += Number(doc.data().prepaidSettlement) || 0;
      });
    } catch { /* ignore */ }
  }

  const totalCashInSp = projectedDeposit + weekPrepaidSp;
  // Founder cut
  const founderCut = enabledItems.founderCut !== false ? Math.round(totalCashInSp * (founderCutPct / 100)) : 0;
  let remaining = totalCashInSp - founderCut;

  // Inventory needs: items with daysRemaining < 14 for brands with COD data
  const brandNames = Object.keys(brandBreakdown);
  let inventoryNeeds = 0;
  if (enabledItems.inventoryNeeds !== false) {
    try {
      const invSnap = await firestore.collection(COLLECTIONS.INVENTORY).get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invSnap.docs.forEach((doc: any) => {
        const item = doc.data();
        const daysRemaining = item.daysRemaining ?? 999;
        if (daysRemaining < 14 && brandNames.some((b) => (item.store ?? '').toLowerCase().includes(b.toLowerCase()))) {
          const reorderCost = (item.costPerUnit ?? 0) * (item.reorderQty ?? item.currentStock ?? 0);
          inventoryNeeds += reorderCost;
        }
      });
    } catch { /* ignore */ }
    remaining -= inventoryNeeds;
  }

  // Baselines due this week
  let baselinesDue = 0;
  const baselineItems: Array<{ label: string; amount: number; dueDate: string }> = [];
  if (enabledItems.baselines !== false) {
    try {
      const basSnap = await firestore.collection(COLLECTIONS.FINANCE_BASELINES).get();
      basSnap.docs.forEach((doc: any) => {
        const b = doc.data();
        if (b.type !== 'monthly' || !b.isPaid) return;
        const dueDate = b.dueDate;
        if (!dueDate) return;
        if (dueDate >= weekStartStr && dueDate <= weekEndStr) {
          baselinesDue += b.amount ?? 0;
          baselineItems.push({ label: b.label, amount: b.amount, dueDate });
        }
      });
    } catch { /* ignore */ }
    remaining -= baselinesDue;
  }

  // Expenses this week (with daily breakdown)
  let weekExpenses = 0;
  const expensesByDay: Record<string, number> = {};
  if (enabledItems.expenses !== false) {
    try {
      const expSnap = await firestore.collection(COLLECTIONS.FINANCE_EXPENSES).get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expSnap.docs.forEach((doc: any) => {
        const e = doc.data();
        if (e.date >= weekStartStr && e.date <= weekEndStr) {
          const amt = e.amount ?? 0;
          weekExpenses += amt;
          expensesByDay[e.date] = (expensesByDay[e.date] ?? 0) + amt;
        }
      });
    } catch { /* ignore */ }
    remaining -= weekExpenses;
  }

  const breakdown = [
    { label: 'COD Projected Deposit', amount: projectedDeposit, type: 'income' as const },
    ...(weekPrepaidSp > 0 ? [{ label: 'Prepaid Settlements', amount: weekPrepaidSp, type: 'income' as const }] : []),
    ...(enabledItems.founderCut !== false && founderCut > 0 ? [{ label: `Founder Cut (${founderCutPct}%)`, amount: -founderCut, type: 'deduction' as const }] : []),
    ...(enabledItems.inventoryNeeds !== false && inventoryNeeds > 0 ? [{ label: 'Inventory Restock', amount: -inventoryNeeds, type: 'deduction' as const }] : []),
    ...(enabledItems.baselines !== false ? baselineItems.map((b) => ({ label: b.label, amount: -b.amount, type: 'deduction' as const })) : []),
    ...(enabledItems.expenses !== false && weekExpenses > 0 ? [{ label: 'Other Expenses', amount: -weekExpenses, type: 'deduction' as const }] : []),
    { label: 'Available to Spend', amount: Math.max(remaining, 0), type: 'result' as const },
  ];

  // Build daily outflow map for the 7-day week (Mon-Sun) using cached data
  const dailyOutflows: Array<{ date: string; expenses: number; baselines: number }> = [];
  for (let d = 0; d < 7; d++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + d);
    const dayStr = getISTDate(day);
    let dayBaselines = 0;

    if (enabledItems.baselines !== false) {
      for (const b of baselineItems) {
        if (b.dueDate === dayStr) dayBaselines += b.amount;
      }
    }

    dailyOutflows.push({ date: dayStr, expenses: expensesByDay[dayStr] ?? 0, baselines: dayBaselines });
  }

  return NextResponse.json({
    weekLabel: getWeekLabel(weekStart),
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    codRevenue,
    projectedDeposit,
    founderCut,
    founderCutPct,
    inventoryNeeds,
    baselinesDue,
    weekExpenses,
    spendingPower: Math.max(remaining, 0),
    breakdown,
    enabledItems,
    dailyOutflows,
  });
}

// ── Combined endpoint: single call replaces 7 parallel calls ─────────────────
// Reads each collection ONCE instead of 3-6 times across separate endpoints.
// Collections read: finance_daily (1), finance_baselines (1), finance_expenses (1),
// inventory (1), settings/delivery_rates (cached), settings/spending_config (cached)
// = ~4-6 reads total vs ~20+ reads before

async function getCombinedFinanceData(params: URLSearchParams) {
  const firestore = db();
  const days = Number(params.get('days')) || 30;
  const endDate = params.get('end') ?? getISTDate();
  const startDate = params.get('start') ?? getISTDate(new Date(Date.now() - days * 86400000));
  const today = getISTDate();
  const todayDate = new Date(today + 'T00:00:00+05:30');
  const yesterday = getISTDate(new Date(Date.now() - 86400000));

  if (!firestore) {
    return NextResponse.json({
      summary: { totalSales: 0, totalGrossProfit: 0, totalAdSpend: 0, totalNetProfit: 0, totalExpenses: 0, dailyBaselineTotal: 0, monthlyBaselineTotal: 0, dailyEntries: [], dailyBaselines: [], monthlyBaselines: [] },
      codWeeks: [],
      spending: { projectedDeposit: 0, spendingPower: 0, breakdown: [], enabledItems: {} },
      reminders: [],
      baselines: { daily: [], monthly: [] },
      expenses: [],
      deliveryRates: {},
    });
  }

  // ── STEP 1: Fetch all needed data in parallel (ONE read per collection) ──
  // For finance_daily, we need a wider range: summary needs startDate→endDate,
  // but COD projections need entries from ~35 days ago (4 weeks + 7 day delay).
  const codWideStart = getISTDate(new Date(todayDate.getTime() - 35 * 86400000));
  const effectiveStart = codWideStart < startDate ? codWideStart : startDate;

  const [dailySnap, baselinesSnap, expensesSnap, incomeSnap, inventorySnap, deliveryRatesData, spendingConfigData] = await Promise.all([
    firestore.collection(COLLECTIONS.FINANCE_DAILY).where('date', '>=', effectiveStart).where('date', '<=', endDate).orderBy('date', 'desc').get(),
    firestore.collection(COLLECTIONS.FINANCE_BASELINES).get(),
    firestore.collection(COLLECTIONS.FINANCE_EXPENSES).orderBy('createdAt', 'desc').get(),
    firestore.collection(COLLECTIONS.FINANCE_INCOME).get(),
    firestore.collection(COLLECTIONS.INVENTORY).get(),
    getCachedSetting<{ rates?: Record<string, number> }>(firestore, 'delivery_rates', { rates: {} }),
    getCachedSetting<{ founderCutPct?: number; enabledItems?: Record<string, boolean> }>(firestore, 'spending_config', { founderCutPct: 50, enabledItems: { founderCut: true, inventoryNeeds: true, baselines: true, expenses: true } }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allDailyEntries = dailySnap.docs.map((doc: any) => doc.data());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allBaselines = baselinesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCombinedExpenses = expensesSnap.docs.map((doc: any) => ({ id: doc.data().id ?? doc.id, ...doc.data() }));
  // Expand recurring expenses for combined data
  const nowDate = new Date();
  const allExpenses: typeof rawCombinedExpenses = [];
  for (const exp of rawCombinedExpenses) {
    allExpenses.push(exp);
    if (exp.recurring && exp.date) {
      const origDate = new Date(exp.date + 'T00:00:00');
      const origDay = origDate.getDate();
      for (let m = 1; m <= 12; m++) {
        const nextDate = new Date(origDate);
        nextDate.setMonth(origDate.getMonth() + m);
        if (nextDate.getDate() !== origDay) nextDate.setDate(0);
        if (nextDate <= nowDate) continue;
        const dateStr = nextDate.toISOString().split('T')[0];
        allExpenses.push({ ...exp, id: `${exp.id}_recurring_${dateStr}`, date: dateStr, recurring: true });
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allIncome = incomeSnap.docs.map((doc: any) => ({ id: doc.data().id ?? doc.id, ...doc.data() }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allInventory = inventorySnap.docs.map((doc: any) => doc.data());
  const brandRates: Record<string, number> = deliveryRatesData.rates ?? {};
  const founderCutPct = spendingConfigData.founderCutPct ?? 50;
  const enabledItems = spendingConfigData.enabledItems ?? { founderCut: true, inventoryNeeds: true, baselines: true, expenses: true };
  const defaultRate = 65;

  // ── STEP 2: Compute summary (filter to requested date range) ──
  const summaryEntries = allDailyEntries.filter((e) => e.date >= startDate && e.date <= endDate);
  const totalSales = summaryEntries.reduce((s, e) => s + (e.totalSales ?? 0), 0);
  const totalGrossProfit = summaryEntries.reduce((s, e) => s + (e.grossProfit ?? 0), 0);
  const totalAdSpend = summaryEntries.reduce((s, e) => s + (e.adSpend ?? 0), 0);
  const totalNetProfit = summaryEntries.reduce((s, e) => s + (e.netProfit ?? 0), 0);
  const totalExpenses = allExpenses.reduce((s, e) => s + (e.amount ?? 0), 0);

  // Auto-advance monthly baselines
  const currentMonth = today.slice(0, 7);
  for (const bl of allBaselines) {
    if (bl.type !== 'monthly' || !bl.dueDate) continue;
    const blMonth = bl.dueDate.slice(0, 7);
    if (blMonth < currentMonth) {
      const day = bl.dueDate.slice(8, 10);
      bl.dueDate = `${currentMonth}-${day}`;
      bl.isPaid = false;
      delete bl.paidDate;
      firestore.collection(COLLECTIONS.FINANCE_BASELINES).doc(bl.id).update({ dueDate: bl.dueDate, isPaid: false, paidDate: null }).catch(() => {});
    }
  }

  const dailyBaselines = allBaselines.filter((b) => b.type === 'daily');
  const monthlyBaselines = allBaselines.filter((b) => b.type === 'monthly');
  const dailyBaselineTotal = dailyBaselines.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const monthlyBaselineTotal = monthlyBaselines.reduce((s, b) => s + (Number(b.amount) || 0), 0);

  // ── STEP 3: COD projections (4 weeks, using same allDailyEntries) ──
  // COD deposited 2 days after collection (with weekend adjustments)
  const COD_DELAY_DAYS = 7;
  const codWeeks: Array<{ weekLabel: string; startDate: string; endDate: string; projectedAmount: number; codRevenue: number; brandBreakdown: Record<string, number> }> = [];

  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(today + 'T00:00:00+05:30');
    weekStart.setDate(weekStart.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const salesStart = new Date(weekStart);
    salesStart.setDate(salesStart.getDate() - COD_DELAY_DAYS);
    const salesEnd = new Date(weekEnd);
    salesEnd.setDate(salesEnd.getDate() - COD_DELAY_DAYS);

    const salesStartStr = getISTDate(salesStart);
    const salesEndStr = getISTDate(salesEnd);

    let codRevenue = 0;
    const brandBreakdown: Record<string, number> = {};

    // Filter from in-memory data instead of querying Firestore again
    for (const entry of allDailyEntries) {
      if (entry.date >= salesStartStr && entry.date <= salesEndStr) {
        const codByBrand = entry.codSalesByBrand ?? {};
        for (const [brand, amount] of Object.entries(codByBrand)) {
          const val = Number(amount) || 0;
          brandBreakdown[brand] = (brandBreakdown[brand] ?? 0) + val;
          codRevenue += val;
        }
      }
    }

    let projectedAmount = 0;
    for (const [brand, amount] of Object.entries(brandBreakdown)) {
      const rate = brandRates[brand] ?? defaultRate;
      projectedAmount += Math.round(amount * (rate / 100));
    }

    codWeeks.push({
      weekLabel: getWeekLabel(weekStart),
      startDate: getISTDate(weekStart),
      endDate: getISTDate(weekEnd),
      projectedAmount,
      codRevenue,
      brandBreakdown,
    });
  }

  // ── STEP 4: Spending power (using same in-memory data) ──
  const weekStart = new Date(todayDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = getISTDate(weekStart);
  const weekEndStr = getISTDate(weekEnd);

  // COD for this week's spending power
  const spSalesStart = new Date(weekStart);
  spSalesStart.setDate(spSalesStart.getDate() - COD_DELAY_DAYS);
  const spSalesEnd = new Date(weekEnd);
  spSalesEnd.setDate(spSalesEnd.getDate() - COD_DELAY_DAYS);
  const spSalesStartStr = getISTDate(spSalesStart);
  const spSalesEndStr = getISTDate(spSalesEnd);

  let spCodRevenue = 0;
  let projectedDeposit = 0;
  const spBrandBreakdown: Record<string, number> = {};

  for (const entry of allDailyEntries) {
    if (entry.date >= spSalesStartStr && entry.date <= spSalesEndStr) {
      const codByBrand = entry.codSalesByBrand ?? {};
      for (const [brand, amount] of Object.entries(codByBrand)) {
        const val = Number(amount) || 0;
        spBrandBreakdown[brand] = (spBrandBreakdown[brand] ?? 0) + val;
        spCodRevenue += val;
      }
    }
  }
  for (const [brand, amount] of Object.entries(spBrandBreakdown)) {
    const rate = brandRates[brand] ?? defaultRate;
    projectedDeposit += Math.round(amount * (rate / 100));
  }

  // Prepaid settlements received this week (actual cash in bank)
  let weekPrepaid = 0;
  for (const entry of allDailyEntries) {
    if (entry.date >= weekStartStr && entry.date <= weekEndStr) {
      weekPrepaid += Number(entry.prepaidSettlement) || 0;
    }
  }

  // Missed income this week (from finance_income collection)
  let weekIncome = 0;
  for (const inc of allIncome) {
    const incDate = inc.date ?? '';
    const incEnd = inc.endDate ?? incDate;
    // Include if the income date range overlaps with the spending power week
    if (incDate <= weekEndStr && incEnd >= weekStartStr) {
      weekIncome += Number(inc.amount) || 0;
    }
  }

  const totalCashIn = projectedDeposit + weekPrepaid + weekIncome;
  const founderCut = enabledItems.founderCut !== false ? Math.round(totalCashIn * (founderCutPct / 100)) : 0;
  let remaining = totalCashIn - founderCut;

  // Inventory needs
  const spBrandNames = Object.keys(spBrandBreakdown);
  let inventoryNeeds = 0;
  if (enabledItems.inventoryNeeds !== false) {
    for (const item of allInventory) {
      const daysRemaining = item.daysRemaining ?? 999;
      if (daysRemaining < 14 && spBrandNames.some((b) => (item.store ?? '').toLowerCase().includes(b.toLowerCase()))) {
        inventoryNeeds += (item.costPerUnit ?? 0) * (item.reorderQty ?? item.currentStock ?? 0);
      }
    }
    remaining -= inventoryNeeds;
  }

  // Baselines due this week
  let baselinesDue = 0;
  const baselineItems: Array<{ label: string; amount: number; dueDate: string }> = [];
  if (enabledItems.baselines !== false) {
    for (const b of allBaselines) {
      if (b.type !== 'monthly' || !b.isPaid) continue;
      if (b.dueDate && b.dueDate >= weekStartStr && b.dueDate <= weekEndStr) {
        baselinesDue += b.amount ?? 0;
        baselineItems.push({ label: b.label, amount: b.amount, dueDate: b.dueDate });
      }
    }
    remaining -= baselinesDue;
  }

  // Expenses this week
  let weekExpenses = 0;
  if (enabledItems.expenses !== false) {
    for (const e of allExpenses) {
      if (e.date >= weekStartStr && e.date <= weekEndStr) {
        weekExpenses += e.amount ?? 0;
      }
    }
    remaining -= weekExpenses;
  }

  const breakdown = [
    { label: 'COD Projected Deposit', amount: projectedDeposit, type: 'income' as const },
    ...(weekPrepaid > 0 ? [{ label: 'Prepaid Settlements', amount: weekPrepaid, type: 'income' as const }] : []),
    ...(weekIncome > 0 ? [{ label: 'Other Income', amount: weekIncome, type: 'income' as const }] : []),
    ...(enabledItems.founderCut !== false && founderCut > 0 ? [{ label: `Founder Cut (${founderCutPct}%)`, amount: -founderCut, type: 'deduction' as const }] : []),
    ...(enabledItems.inventoryNeeds !== false && inventoryNeeds > 0 ? [{ label: 'Inventory Restock', amount: -inventoryNeeds, type: 'deduction' as const }] : []),
    ...(enabledItems.baselines !== false ? baselineItems.map((b) => ({ label: b.label, amount: -b.amount, type: 'deduction' as const })) : []),
    ...(enabledItems.expenses !== false && weekExpenses > 0 ? [{ label: 'Other Expenses', amount: -weekExpenses, type: 'deduction' as const }] : []),
    { label: 'Available to Spend', amount: Math.max(remaining, 0), type: 'result' as const },
  ];

  // ── STEP 5: Reminders ──
  const reminders: Array<{ type: string; message: string; date: string; priority?: string }> = [];
  const yesterdayEntry = allDailyEntries.find((e) => e.date === yesterday);
  if (!yesterdayEntry || !yesterdayEntry.adSpend) {
    reminders.push({ type: 'cmo_daily', message: `Enter yesterday's (${yesterday}) ad spend and ROAS`, date: yesterday, priority: 'high' });
  }

  // ── Return everything ──
  return NextResponse.json({
    summary: {
      totalSales, totalGrossProfit, totalAdSpend, totalNetProfit, totalExpenses,
      dailyBaselineTotal, monthlyBaselineTotal,
      dailyEntries: summaryEntries, dailyBaselines, monthlyBaselines,
    },
    codWeeks,
    spending: {
      weekLabel: getWeekLabel(weekStart),
      weekStart: weekStartStr, weekEnd: weekEndStr,
      codRevenue: spCodRevenue, projectedDeposit,
      weekPrepaid, totalCashIn,
      founderCut, founderCutPct, inventoryNeeds,
      baselinesDue, weekExpenses,
      spendingPower: Math.max(remaining, 0),
      breakdown, enabledItems,
    },
    reminders,
    baselines: { daily: dailyBaselines, monthly: monthlyBaselines },
    expenses: allExpenses,
    income: allIncome,
    deliveryRates: brandRates,
  });
}

async function getFinanceSummary(params: URLSearchParams) {
  const firestore = db();
  const days = Number(params.get('days')) || 30;
  const endDate = params.get('end') ?? getISTDate();
  const startDate = params.get('start') ?? getISTDate(new Date(Date.now() - days * 86400000));

  // Fetch all data sources in parallel
  const [dailyEntries, baselines, expenses, productEntries, adsEntries, inventoryEntries] = await Promise.all([
    fetchFinanceDaily(firestore, startDate, endDate),
    fetchBaselines(firestore),
    fetchAllExpenses(firestore),
    fetchCollection(firestore, COLLECTIONS.PRODUCT_TRACKER),
    fetchCollection(firestore, COLLECTIONS.ADS_TRACKER),
    fetchCollection(firestore, COLLECTIONS.INVENTORY),
  ]);

  // Aggregate finance daily
  const totalSales = dailyEntries.reduce((s, e) => s + (e.totalSales ?? 0), 0);
  const totalGrossProfit = dailyEntries.reduce((s, e) => s + (e.grossProfit ?? 0), 0);
  const totalAdSpend = dailyEntries.reduce((s, e) => s + (e.adSpend ?? 0), 0);
  const totalNetProfit = dailyEntries.reduce((s, e) => s + (e.netProfit ?? 0), 0);
  const totalShipping = dailyEntries.reduce((s, e) => s + (e.shippingCost ?? 0), 0);
  const totalProcessorFees = dailyEntries.reduce((s, e) => s + (e.paymentProcessorFee ?? 0), 0);
  const avgROAS = dailyEntries.length > 0
    ? dailyEntries.reduce((s, e) => s + (e.roas ?? 0), 0) / dailyEntries.filter(e => e.roas > 0).length || 0
    : 0;

  // Baselines
  const dailyBaselines = baselines.filter((b: Record<string, unknown>) => b.type === 'daily');
  const monthlyBaselines = baselines.filter((b: Record<string, unknown>) => b.type === 'monthly');
  const dailyBaselineTotal = dailyBaselines.reduce((s: number, b: Record<string, unknown>) => s + (Number(b.amount) || 0), 0);
  const monthlyBaselineTotal = monthlyBaselines.reduce((s: number, b: Record<string, unknown>) => s + (Number(b.amount) || 0), 0);

  // Expenses
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);

  // Product tracker
  const totalProductTestingSpend = productEntries.reduce((s, e) => s + (e.totalSpent ?? 0), 0);

  // Inventory
  const inventoryValue = inventoryEntries.reduce((s, e) => s + (e.costPerUnit ?? 0) * (e.currentStock ?? 0), 0);

  return NextResponse.json({
    totalSales,
    totalGrossProfit,
    totalAdSpend,
    totalNetProfit,
    totalShipping,
    totalProcessorFees,
    avgROAS: Math.round(avgROAS * 100) / 100,
    totalExpenses,
    totalProductTestingSpend,
    inventoryValue,
    dailyBaselineTotal,
    monthlyBaselineTotal,
    dailyEntries,
    dailyBaselines,
    monthlyBaselines,
    recentExpenses: expenses.slice(0, 10),
    daysAnalyzed: days,
  });
}

// ── Data fetchers ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFinanceDaily(firestore: any, start: string, end: string): Promise<any[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore
      .collection(COLLECTIONS.FINANCE_DAILY)
      .where('date', '>=', start)
      .where('date', '<=', end)
      .orderBy('date', 'desc')
      .get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return snapshot.docs.map((doc: any) => doc.data());
  } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchBaselines(firestore: any): Promise<any[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection(COLLECTIONS.FINANCE_BASELINES).get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllExpenses(firestore: any): Promise<any[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore
      .collection(COLLECTIONS.FINANCE_EXPENSES)
      .orderBy('createdAt', 'desc')
      .get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return snapshot.docs.map((doc: any) => doc.data());
  } catch { return []; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCollection(firestore: any, collection: string): Promise<any[]> {
  if (!firestore) return [];
  try {
    const snapshot = await firestore.collection(collection).get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return snapshot.docs.map((doc: any) => doc.data());
  } catch { return []; }
}

// ── Planned Expenses (Projected Outflow) ─────────────────────────────────────

async function getPlannedExpenses() {
  const firestore = db();
  if (!firestore) return NextResponse.json({ planned: [] });

  const snapshot = await firestore.collection(COLLECTIONS.FINANCE_PLANNED).orderBy('date', 'asc').get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planned = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ planned });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function addPlannedExpense(body: any) {
  const firestore = db();
  if (!firestore) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

  const now = getISTDate();
  const entry = {
    category: (body.category as string) ?? 'reinvestment',
    description: (body.description as string) ?? '',
    amount: Number(body.amount) || 0,
    date: (body.date as string) ?? now,
    createdAt: new Date().toISOString(),
  };
  if (!entry.amount) return NextResponse.json({ error: 'Amount required' }, { status: 400 });

  const ref = await firestore.collection(COLLECTIONS.FINANCE_PLANNED).add(entry);
  return NextResponse.json({ success: true, planned: { id: ref.id, ...entry } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updatePlannedExpense(body: any) {
  const firestore = db();
  if (!firestore) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};
  if (body.category !== undefined) updates.category = body.category;
  if (body.description !== undefined) updates.description = body.description;
  if (body.amount !== undefined) updates.amount = Number(body.amount) || 0;
  if (body.date !== undefined) updates.date = body.date;

  await firestore.collection(COLLECTIONS.FINANCE_PLANNED).doc(id).update(updates);
  return NextResponse.json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deletePlannedExpense(body: any) {
  const firestore = db();
  if (!firestore) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  await firestore.collection(COLLECTIONS.FINANCE_PLANNED).doc(id).delete();
  return NextResponse.json({ success: true });
}
