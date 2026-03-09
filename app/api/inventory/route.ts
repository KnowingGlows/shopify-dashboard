import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import type { InventoryEntry, InventoryDispatch } from '@/types/shopify';

// In-memory fallback
const inMemoryStore: InventoryEntry[] = [];
const inMemoryDispatches: InventoryDispatch[] = [];

function getISTDate(date?: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date ?? new Date());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (isFirebaseAvailable() ? getFirestore() : null);

// ── GET /api/inventory ───────────────────────────────────────────────────────

export async function GET() {
  try {
    const firestore = db();

    if (!firestore) {
      return NextResponse.json({ entries: inMemoryStore });
    }

    const snapshot = await firestore
      .collection(COLLECTIONS.INVENTORY)
      .orderBy('createdAt', 'desc')
      .get();

    const entries: InventoryEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: data.id ?? doc.id,
        productName: data.productName ?? '',
        sku: data.sku ?? '',
        currentStock: data.currentStock ?? 0,
        reorderLevel: data.reorderLevel ?? 0,
        supplier: data.supplier ?? '',
        costPerUnit: data.costPerUnit ?? 0,
        status: data.status ?? '',
        store: data.store ?? '',
        sourcingOrigin: data.sourcingOrigin ?? '',
        dailyAvgOrders: data.dailyAvgOrders ?? 0,
        createdAt: data.createdAt ?? '',
        updatedAt: data.updatedAt ?? '',
      };
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching inventory entries:', error);
    return NextResponse.json({ error: 'Failed to fetch inventory entries.' }, { status: 500 });
  }
}

// ── POST /api/inventory ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Dispatch action
    if (body.action === 'dispatch') {
      return handleDispatch(body);
    }

    // Default: create new entry
    const now = new Date().toISOString();
    const entry: InventoryEntry = {
      id: crypto.randomUUID(),
      productName: body.productName ?? '',
      sku: body.sku ?? '',
      currentStock: Number(body.currentStock) || 0,
      reorderLevel: Number(body.reorderLevel) || 0,
      supplier: body.supplier ?? '',
      costPerUnit: Number(body.costPerUnit) || 0,
      status: body.status ?? '',
      store: body.store ?? '',
      sourcingOrigin: body.sourcingOrigin ?? '',
      dailyAvgOrders: 0,
      createdAt: now,
      updatedAt: now,
    };

    const firestore = db();
    if (!firestore) {
      inMemoryStore.unshift(entry);
      return NextResponse.json({ success: true, entry });
    }

    await firestore.collection(COLLECTIONS.INVENTORY).doc(entry.id).set(entry);
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error creating inventory entry:', error);
    return NextResponse.json({ error: 'Failed to create inventory entry.' }, { status: 500 });
  }
}

// ── Dispatch handler ─────────────────────────────────────────────────────────

async function handleDispatch(body: Record<string, unknown>) {
  const firestore = db();
  const dispatches = body.dispatches as Array<{ inventoryId: string; quantity: number }>;
  const date = (body.date as string) || getISTDate();

  if (!dispatches || !Array.isArray(dispatches)) {
    return NextResponse.json({ error: 'dispatches array is required.' }, { status: 400 });
  }

  const results: Array<{ inventoryId: string; newStock: number; dailyAvg: number }> = [];

  for (const d of dispatches) {
    if (!d.inventoryId || !d.quantity || d.quantity <= 0) continue;

    const dispatchRecord: InventoryDispatch = {
      id: crypto.randomUUID(),
      inventoryId: d.inventoryId,
      quantity: d.quantity,
      date,
      createdAt: new Date().toISOString(),
    };

    if (!firestore) {
      // In-memory
      inMemoryDispatches.push(dispatchRecord);
      const entry = inMemoryStore.find((e) => e.id === d.inventoryId);
      if (entry) {
        entry.currentStock = Math.max(0, entry.currentStock - d.quantity);
        entry.dailyAvgOrders = calcAvgInMemory(d.inventoryId);
        entry.updatedAt = new Date().toISOString();
        results.push({ inventoryId: d.inventoryId, newStock: entry.currentStock, dailyAvg: entry.dailyAvgOrders });
      }
      continue;
    }

    // Save dispatch record
    await firestore.collection(COLLECTIONS.INVENTORY_DISPATCHES).doc(dispatchRecord.id).set(dispatchRecord);

    // Update inventory entry
    const docRef = firestore.collection(COLLECTIONS.INVENTORY).doc(d.inventoryId);
    const doc = await docRef.get();
    if (!doc.exists) continue;

    const data = doc.data()!;
    const newStock = Math.max(0, (data.currentStock ?? 0) - d.quantity);

    // Calculate 7-day rolling avg (single-field query to avoid composite index)
    const sevenDaysAgo = getISTDate(new Date(Date.now() - 7 * 86400000));
    const dispatchSnap = await firestore
      .collection(COLLECTIONS.INVENTORY_DISPATCHES)
      .where('inventoryId', '==', d.inventoryId)
      .get();

    const recentDispatches = dispatchSnap.docs.filter((doc) => (doc.data().date ?? '') >= sevenDaysAgo);
    const totalDispatched = recentDispatches.reduce((sum, doc) => sum + (doc.data().quantity ?? 0), 0);
    // Count distinct days with dispatches (don't divide by 7 if only 1-2 days of data)
    const distinctDays = new Set(recentDispatches.map((doc) => doc.data().date)).size;
    const avgDivisor = Math.max(1, distinctDays);
    const dailyAvg = Math.round((totalDispatched / avgDivisor) * 10) / 10;

    await docRef.update({
      currentStock: newStock,
      dailyAvgOrders: dailyAvg,
      updatedAt: new Date().toISOString(),
    });

    results.push({ inventoryId: d.inventoryId, newStock, dailyAvg });
  }

  return NextResponse.json({ success: true, results });
}

function calcAvgInMemory(inventoryId: string): number {
  const sevenDaysAgo = getISTDate(new Date(Date.now() - 7 * 86400000));
  const recent = inMemoryDispatches.filter(
    (d) => d.inventoryId === inventoryId && d.date >= sevenDaysAgo
  );
  const total = recent.reduce((s, d) => s + d.quantity, 0);
  const distinctDays = new Set(recent.map((d) => d.date)).size;
  return Math.round((total / Math.max(1, distinctDays)) * 10) / 10;
}

// ── PATCH /api/inventory ─────────────────────────────────────────────────────

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Entry id is required.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const sanitizedUpdates: Partial<InventoryEntry> = { updatedAt: now };

    if ('productName' in updates) sanitizedUpdates.productName = updates.productName ?? '';
    if ('sku' in updates) sanitizedUpdates.sku = updates.sku ?? '';
    if ('currentStock' in updates) sanitizedUpdates.currentStock = Number(updates.currentStock) || 0;
    if ('reorderLevel' in updates) sanitizedUpdates.reorderLevel = Number(updates.reorderLevel) || 0;
    if ('supplier' in updates) sanitizedUpdates.supplier = updates.supplier ?? '';
    if ('costPerUnit' in updates) sanitizedUpdates.costPerUnit = Number(updates.costPerUnit) || 0;
    if ('status' in updates) sanitizedUpdates.status = updates.status ?? '';
    if ('store' in updates) sanitizedUpdates.store = updates.store ?? '';
    if ('sourcingOrigin' in updates) sanitizedUpdates.sourcingOrigin = updates.sourcingOrigin ?? '';

    const firestore = db();
    if (!firestore) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      inMemoryStore[idx] = { ...inMemoryStore[idx], ...sanitizedUpdates };
      return NextResponse.json({ success: true, entry: inMemoryStore[idx] });
    }

    const docRef = firestore.collection(COLLECTIONS.INVENTORY).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });

    await docRef.update(sanitizedUpdates);
    const updated = { ...doc.data(), ...sanitizedUpdates } as InventoryEntry;
    return NextResponse.json({ success: true, entry: updated });
  } catch (error) {
    console.error('Error updating inventory entry:', error);
    return NextResponse.json({ error: 'Failed to update inventory entry.' }, { status: 500 });
  }
}

// ── DELETE /api/inventory ────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Entry id is required.' }, { status: 400 });
    }

    const firestore = db();
    if (!firestore) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      inMemoryStore.splice(idx, 1);
      return NextResponse.json({ success: true });
    }

    const docRef = firestore.collection(COLLECTIONS.INVENTORY).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });

    await docRef.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting inventory entry:', error);
    return NextResponse.json({ error: 'Failed to delete inventory entry.' }, { status: 500 });
  }
}
