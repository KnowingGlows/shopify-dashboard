import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import { ProductTrackerEntry } from '@/types/shopify';

const asCurrency = (v: unknown): 'INR' | 'USD' => (v === 'USD' ? 'USD' : 'INR');
const asMode = (v: unknown): '3pl' | 'own' => (v === 'own' ? 'own' : '3pl');

// In-memory fallback when Firebase is not configured
const inMemoryStore: ProductTrackerEntry[] = [];

// GET /api/product-tracker
// Returns all product tracker entries
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
      .collection(COLLECTIONS.PRODUCT_TRACKER)
      .orderBy('createdAt', 'desc')
      .get();

    const entries: ProductTrackerEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: data.id ?? doc.id,
        productName: data.productName ?? '',
        productFileLink: data.productFileLink ?? '',
        adLink: data.adLink ?? '',
        websiteLink: data.websiteLink ?? '',
        productStage: data.productStage ?? '',
        totalSpent: data.totalSpent ?? 0,
        cogs: Number(data.cogs) || 0,
        costCurrency: asCurrency(data.costCurrency),
        sellingPrice: Number(data.sellingPrice) || 0,
        deliveryRate: Number(data.deliveryRate) || 0,
        fulfilmentMode: asMode(data.fulfilmentMode),
        ownPackingCost: Number(data.ownPackingCost) || 0,
        remarks: data.remarks ?? '',
        createdAt: data.createdAt ?? '',
        updatedAt: data.updatedAt ?? '',
      };
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching product tracker entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product tracker entries.' },
      { status: 500 }
    );
  }
}

// POST /api/product-tracker
// Body: { productName, productFileLink, productStage, totalSpent, remarks }
// Creates a new product tracker entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();
    const entry: ProductTrackerEntry = {
      id: crypto.randomUUID(),
      productName: body.productName ?? '',
      productFileLink: body.productFileLink ?? '',
      adLink: body.adLink ?? '',
      websiteLink: body.websiteLink ?? '',
      productStage: body.productStage ?? '',
      totalSpent: Number(body.totalSpent) || 0,
      cogs: Number(body.cogs) || 0,
      costCurrency: asCurrency(body.costCurrency),
      sellingPrice: Number(body.sellingPrice) || 0,
      deliveryRate: Number(body.deliveryRate) || 0,
      fulfilmentMode: asMode(body.fulfilmentMode),
      ownPackingCost: Number(body.ownPackingCost) || 0,
      remarks: body.remarks ?? '',
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

    await db.collection(COLLECTIONS.PRODUCT_TRACKER).doc(entry.id).set(entry);

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error creating product tracker entry:', error);
    return NextResponse.json(
      { error: 'Failed to create product tracker entry.' },
      { status: 500 }
    );
  }
}

// PATCH /api/product-tracker
// Body: { id, ...fieldsToUpdate }
// Updates an existing product tracker entry
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Entry id is required.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const sanitizedUpdates: Partial<ProductTrackerEntry> = {};

    if (updates.productName !== undefined) sanitizedUpdates.productName = updates.productName;
    if (updates.productFileLink !== undefined) sanitizedUpdates.productFileLink = updates.productFileLink;
    if (updates.adLink !== undefined) sanitizedUpdates.adLink = updates.adLink;
    if (updates.websiteLink !== undefined) sanitizedUpdates.websiteLink = updates.websiteLink;
    if (updates.productStage !== undefined) sanitizedUpdates.productStage = updates.productStage;
    if (updates.totalSpent !== undefined) sanitizedUpdates.totalSpent = Number(updates.totalSpent) || 0;
    if (updates.cogs !== undefined) sanitizedUpdates.cogs = Number(updates.cogs) || 0;
    if (updates.costCurrency !== undefined) sanitizedUpdates.costCurrency = asCurrency(updates.costCurrency);
    if (updates.sellingPrice !== undefined) sanitizedUpdates.sellingPrice = Number(updates.sellingPrice) || 0;
    if (updates.deliveryRate !== undefined) sanitizedUpdates.deliveryRate = Number(updates.deliveryRate) || 0;
    if (updates.fulfilmentMode !== undefined) sanitizedUpdates.fulfilmentMode = asMode(updates.fulfilmentMode);
    if (updates.ownPackingCost !== undefined) sanitizedUpdates.ownPackingCost = Number(updates.ownPackingCost) || 0;
    if (updates.remarks !== undefined) sanitizedUpdates.remarks = updates.remarks;
    sanitizedUpdates.updatedAt = now;

    if (!isFirebaseAvailable()) {
      const index = inMemoryStore.findIndex((e) => e.id === id);
      if (index === -1) {
        return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      }
      inMemoryStore[index] = { ...inMemoryStore[index], ...sanitizedUpdates };
      return NextResponse.json({ success: true, entry: inMemoryStore[index] });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json({ error: 'Firebase is not available.' }, { status: 500 });
    }

    const docRef = db.collection(COLLECTIONS.PRODUCT_TRACKER).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

    await docRef.update(sanitizedUpdates);
    const updated = await docRef.get();

    return NextResponse.json({ success: true, entry: { id, ...updated.data() } });
  } catch (error) {
    console.error('Error updating product tracker entry:', error);
    return NextResponse.json(
      { error: 'Failed to update product tracker entry.' },
      { status: 500 }
    );
  }
}

// DELETE /api/product-tracker
// Body: { id }
// Deletes a product tracker entry
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Entry id is required.' }, { status: 400 });
    }

    if (!isFirebaseAvailable()) {
      const index = inMemoryStore.findIndex((e) => e.id === id);
      if (index === -1) {
        return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
      }
      inMemoryStore.splice(index, 1);
      return NextResponse.json({ success: true });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json({ error: 'Firebase is not available.' }, { status: 500 });
    }

    const docRef = db.collection(COLLECTIONS.PRODUCT_TRACKER).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting product tracker entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete product tracker entry.' },
      { status: 500 }
    );
  }
}
