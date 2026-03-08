import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';

// In-memory fallback for finance expenses
interface FinanceExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
}

const inMemoryExpenses: FinanceExpense[] = [];

// GET /api/finance
// Aggregates financial data from product_tracker, ads_tracker, pnl_entries, inventory
// GET /api/finance?type=expenses returns all manual expense entries
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    // Return expenses if requested
    if (type === 'expenses') {
      return getExpenses();
    }

    // Otherwise aggregate financial data
    return getFinancialSummary();
  } catch (error) {
    console.error('Error fetching finance data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch finance data.' },
      { status: 500 }
    );
  }
}

async function getExpenses() {
  try {
    if (!isFirebaseAvailable()) {
      return NextResponse.json({ expenses: inMemoryExpenses });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json({ expenses: inMemoryExpenses });
    }

    const snapshot = await db
      .collection('finance_expenses')
      .orderBy('createdAt', 'desc')
      .get();

    const expenses: FinanceExpense[] = snapshot.docs.map((doc) => {
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
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ expenses: inMemoryExpenses });
  }
}

async function getFinancialSummary() {
  const db = isFirebaseAvailable() ? getFirestore() : null;

  // Fetch all collections in parallel
  const [productEntries, adsEntries, pnlEntries, inventoryEntries, expenseEntries] =
    await Promise.all([
      fetchProductTracker(db),
      fetchAdsTracker(db),
      fetchPnlEntries(db),
      fetchInventory(db),
      fetchExpenses(db),
    ]);

  // Product Tracker aggregation
  const totalProductTestingSpend = productEntries.reduce(
    (sum, e) => sum + (e.totalSpent ?? 0),
    0
  );
  const topSpenders = [...productEntries]
    .sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0))
    .slice(0, 5)
    .map((e) => ({
      productName: e.productName,
      productStage: e.productStage,
      totalSpent: e.totalSpent,
    }));

  // Ads Tracker aggregation
  const totalAdSpend = adsEntries.reduce(
    (sum, e) => sum + (e.dailyAdSpend ?? 0),
    0
  );
  const roasEntries = adsEntries.filter((e) => (e.weeklyRoas ?? 0) > 0);
  const avgROAS =
    roasEntries.length > 0
      ? roasEntries.reduce((sum, e) => sum + (e.weeklyRoas ?? 0), 0) /
        roasEntries.length
      : 0;
  const adPerformance = roasEntries
    .sort((a, b) => (b.weeklyRoas ?? 0) - (a.weeklyRoas ?? 0))
    .map((e) => ({
      productName: e.productName,
      batchName: e.batchName,
      weeklyRoas: e.weeklyRoas,
      dailyAdSpend: e.dailyAdSpend,
      creativeBatchResult: e.creativeBatchResult,
    }));

  // P&L aggregation
  const totalPnLProfit = pnlEntries.reduce(
    (sum, e) => sum + (e.profit ?? 0),
    0
  );
  const totalPnLCashflow = pnlEntries.reduce(
    (sum, e) => sum + (e.cashflow ?? 0),
    0
  );
  const totalPnLAdSpend = pnlEntries.reduce(
    (sum, e) => sum + (e.adspend ?? 0),
    0
  );
  const recentPnL = [...pnlEntries]
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, 7)
    .map((e) => ({
      brand: e.brand,
      date: e.date,
      profit: e.profit,
      cashflow: e.cashflow,
      adspend: e.adspend,
    }));

  // Inventory aggregation
  const inventoryValue = inventoryEntries.reduce(
    (sum, e) => sum + (e.costPerUnit ?? 0) * (e.currentStock ?? 0),
    0
  );

  // Expenses aggregation
  const totalExpenses = expenseEntries.reduce(
    (sum, e) => sum + (e.amount ?? 0),
    0
  );

  return NextResponse.json({
    totalProductTestingSpend,
    totalAdSpend,
    avgROAS: Math.round(avgROAS * 100) / 100,
    totalPnLProfit,
    totalPnLCashflow,
    totalPnLAdSpend,
    inventoryValue,
    totalExpenses,
    productCount: productEntries.length,
    adsEntryCount: adsEntries.length,
    inventoryItemCount: inventoryEntries.length,
    topSpenders,
    adPerformance,
    recentPnL,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchProductTracker(db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection(COLLECTIONS.PRODUCT_TRACKER).get();
    return snapshot.docs.map((doc: any) => doc.data());
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAdsTracker(db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection(COLLECTIONS.ADS_TRACKER).get();
    return snapshot.docs.map((doc: any) => doc.data());
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPnlEntries(db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection(COLLECTIONS.PNL_ENTRIES).get();
    return snapshot.docs.map((doc: any) => doc.data());
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchInventory(db: any): Promise<any[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection(COLLECTIONS.INVENTORY).get();
    return snapshot.docs.map((doc: any) => doc.data());
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchExpenses(db: any): Promise<any[]> {
  if (!db) return inMemoryExpenses;
  try {
    const snapshot = await db.collection('finance_expenses').get();
    return snapshot.docs.map((doc: any) => doc.data());
  } catch {
    return inMemoryExpenses;
  }
}

// POST /api/finance
// Body: { category, description, amount, date }
// Creates a manual expense entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();
    const expense: FinanceExpense = {
      id: crypto.randomUUID(),
      category: body.category ?? '',
      description: body.description ?? '',
      amount: Number(body.amount) || 0,
      date: body.date ?? now.split('T')[0],
      createdAt: now,
    };

    if (!expense.category || !expense.amount) {
      return NextResponse.json(
        { error: 'Category and amount are required.' },
        { status: 400 }
      );
    }

    if (!isFirebaseAvailable()) {
      inMemoryExpenses.unshift(expense);
      return NextResponse.json({ success: true, expense });
    }

    const db = getFirestore();
    if (!db) {
      inMemoryExpenses.unshift(expense);
      return NextResponse.json({ success: true, expense });
    }

    await db.collection('finance_expenses').doc(expense.id).set(expense);

    return NextResponse.json({ success: true, expense });
  } catch (error) {
    console.error('Error creating expense entry:', error);
    return NextResponse.json(
      { error: 'Failed to create expense entry.' },
      { status: 500 }
    );
  }
}
