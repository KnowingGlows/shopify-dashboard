import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import { getShopifyStores } from '@/lib/shopify-config';
import { fetchAllStoresOrders } from '@/lib/shopify-api';
import { aggregateSalesData } from '@/lib/sales-aggregator';

// ── Types ────────────────────────────────────────────────────────────────────

interface FinanceDailyEntry {
  date: string; // YYYY-MM-DD
  totalSales: number;
  grossMargin: number; // percentage e.g. 0.55 for 55%
  grossProfit: number; // totalSales * grossMargin
  adSpend: number;
  roas: number;
  revenue: number; // from ads: adSpend * roas
  paymentProcessorFee: number; // 3% of totalSales
  shippingCost: number;
  netProfit: number;
  enteredBy: string;
  updatedAt: string;
}

interface OperationalBaseline {
  id: string;
  type: 'daily' | 'monthly';
  category: string;
  label: string;
  amount: number;
  updatedAt: string;
}

interface FinanceExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Fetch yesterday's sales from Shopify
async function fetchSalesForDate(dateStr: string): Promise<number> {
  try {
    const stores = await getShopifyStores();
    if (stores.length === 0) return 0;

    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const [year, month, day] = dateStr.split('-').map(Number);
    const startUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - IST_OFFSET_MS);
    const endUTC = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0) - IST_OFFSET_MS);

    const { ordersData } = await fetchAllStoresOrders(stores, {
      createdAtMin: startUTC.toISOString(),
      createdAtMax: endUTC.toISOString(),
    });

    const metrics = aggregateSalesData(ordersData);
    return metrics.totalSalesINR;
  } catch (error) {
    console.error('Error fetching sales for date:', dateStr, error);
    return 0;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (isFirebaseAvailable() ? getFirestore() : null);

// ── GET /api/finance ─────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
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
      case 'dismiss-reminder':
        return dismissReminder(body);
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (error) {
    console.error('Finance POST error:', error);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function fetchSalesData(params: URLSearchParams) {
  const date = params.get('date') ?? getISTDate(new Date(Date.now() - 86400000)); // default: yesterday
  const sales = await fetchSalesForDate(date);
  return NextResponse.json({ date, totalSales: sales });
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

  const totalSales = Number(body.totalSales) || 0;
  const grossMargin = Number(body.grossMargin) || 0;
  const grossProfit = totalSales * grossMargin;
  const adSpend = Number(body.adSpend) || 0;
  const actualAdCost = Math.round(adSpend * 1.14); // 14% platform fees
  const roas = Number(body.roas) || 0;
  const shippingCost = Number(body.shippingCost) || 0;
  const paymentProcessorFee = Math.round(totalSales * 0.03);
  const netProfit = grossProfit - actualAdCost - shippingCost - paymentProcessorFee;

  const entry: FinanceDailyEntry = {
    date,
    totalSales,
    grossMargin,
    grossProfit,
    adSpend,
    roas,
    revenue: adSpend * roas,
    paymentProcessorFee,
    shippingCost,
    netProfit,
    enteredBy: (body.enteredBy as string) ?? '',
    updatedAt: new Date().toISOString(),
  };

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

  const expenses = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: data.id ?? doc.id,
      category: data.category ?? '',
      description: data.description ?? '',
      amount: data.amount ?? 0,
      date: data.date ?? '',
      createdAt: data.createdAt ?? '',
    };
  });

  return NextResponse.json({ expenses });
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

  if (!expense.category || !expense.amount) {
    return NextResponse.json({ error: 'Category and amount are required.' }, { status: 400 });
  }

  if (!firestore) {
    return NextResponse.json({ success: true, expense });
  }

  await firestore.collection(COLLECTIONS.FINANCE_EXPENSES).doc(expense.id).set(expense);
  return NextResponse.json({ success: true, expense });
}

async function getCODProjections(params: URLSearchParams) {
  const firestore = db();
  // COD takes 7-8 days to arrive in bank
  // So for any week window, we look at sales from 7-8 days before that window
  const COD_DELAY_DAYS = 7;

  const today = getISTDate();
  const startDate = params.get('start') ?? today;

  // Get the next 4 weeks of projections
  const weeks: Array<{
    weekLabel: string;
    startDate: string;
    endDate: string;
    projectedAmount: number;
    salesDates: string[];
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

    let projectedAmount = 0;
    const salesDates = getISTDateRange(salesStartStr, salesEndStr);

    if (firestore) {
      const snapshot = await firestore
        .collection(COLLECTIONS.FINANCE_DAILY)
        .where('date', '>=', salesStartStr)
        .where('date', '<=', salesEndStr)
        .get();

      projectedAmount = snapshot.docs.reduce((sum, doc) => {
        const data = doc.data();
        return sum + (data.totalSales ?? 0);
      }, 0);
    }

    weeks.push({
      weekLabel: `Week ${w + 1}`,
      startDate: getISTDate(weekStart),
      endDate: getISTDate(weekEnd),
      projectedAmount,
      salesDates,
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

async function dismissReminder(body: Record<string, unknown>) {
  // For now just acknowledge - could store in Firestore for persistence
  return NextResponse.json({ success: true, type: body.type });
}

async function getFinanceSummary(params: URLSearchParams) {
  const firestore = db();
  const days = Number(params.get('days')) || 30;
  const endDate = getISTDate();
  const startDateObj = new Date(Date.now() - days * 86400000);
  const startDate = getISTDate(startDateObj);

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
