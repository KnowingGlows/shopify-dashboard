import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import type { InventoryEntry } from '@/types/shopify';

// In-memory fallback when Firebase is not available
const inMemoryStore: InventoryEntry[] = [];

// GET /api/inventory
// Returns all inventory entries
export async function GET() {
  try {
    if (!isFirebaseAvailable()) {
      return NextResponse.json({ entries: inMemoryStore });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json({ entries: inMemoryStore });
    }

    const snapshot = await db
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
        createdAt: data.createdAt ?? '',
        updatedAt: data.updatedAt ?? '',
      };
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching inventory entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory entries.' },
      { status: 500 }
    );
  }
}

// POST /api/inventory
// Body: Partial<InventoryEntry> (id is generated server-side)
// Creates a new inventory entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
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
      createdAt: now,
      updatedAt: now,
    };

    if (!isFirebaseAvailable()) {
      inMemoryStore.unshift(entry);
      return NextResponse.json({ success: true, entry });
    }

    const db = getFirestore();
    if (!db) {
      inMemoryStore.unshift(entry);
      return NextResponse.json({ success: true, entry });
    }

    await db.collection(COLLECTIONS.INVENTORY).doc(entry.id).set(entry);

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error creating inventory entry:', error);
    return NextResponse.json(
      { error: 'Failed to create inventory entry.' },
      { status: 500 }
    );
  }
}

// PATCH /api/inventory
// Body: { id, ...fieldsToUpdate }
// Updates an existing inventory entry by id
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Entry id is required.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const sanitizedUpdates: Partial<InventoryEntry> = {
      updatedAt: now,
    };

    if ('productName' in updates) sanitizedUpdates.productName = updates.productName ?? '';
    if ('sku' in updates) sanitizedUpdates.sku = updates.sku ?? '';
    if ('currentStock' in updates) sanitizedUpdates.currentStock = Number(updates.currentStock) || 0;
    if ('reorderLevel' in updates) sanitizedUpdates.reorderLevel = Number(updates.reorderLevel) || 0;
    if ('supplier' in updates) sanitizedUpdates.supplier = updates.supplier ?? '';
    if ('costPerUnit' in updates) sanitizedUpdates.costPerUnit = Number(updates.costPerUnit) || 0;
    if ('status' in updates) sanitizedUpdates.status = updates.status ?? '';

    if (!isFirebaseAvailable()) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      }
      inMemoryStore[idx] = { ...inMemoryStore[idx], ...sanitizedUpdates };
      return NextResponse.json({ success: true, entry: inMemoryStore[idx] });
    }

    const db = getFirestore();
    if (!db) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      }
      inMemoryStore[idx] = { ...inMemoryStore[idx], ...sanitizedUpdates };
      return NextResponse.json({ success: true, entry: inMemoryStore[idx] });
    }

    const docRef = db.collection(COLLECTIONS.INVENTORY).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

    await docRef.update(sanitizedUpdates);
    const updated = { ...doc.data(), ...sanitizedUpdates } as InventoryEntry;

    return NextResponse.json({ success: true, entry: updated });
  } catch (error) {
    console.error('Error updating inventory entry:', error);
    return NextResponse.json(
      { error: 'Failed to update inventory entry.' },
      { status: 500 }
    );
  }
}

// DELETE /api/inventory
// Body: { id }
// Deletes an inventory entry by id
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Entry id is required.' }, { status: 400 });
    }

    if (!isFirebaseAvailable()) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      }
      inMemoryStore.splice(idx, 1);
      return NextResponse.json({ success: true });
    }

    const db = getFirestore();
    if (!db) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      }
      inMemoryStore.splice(idx, 1);
      return NextResponse.json({ success: true });
    }

    const docRef = db.collection(COLLECTIONS.INVENTORY).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting inventory entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete inventory entry.' },
      { status: 500 }
    );
  }
}
