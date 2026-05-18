import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS, resolveDocRef } from '@/lib/firebase';
import { AdsTrackerEntry } from '@/types/shopify';

// In-memory fallback when Firebase is not configured
const inMemoryStore: AdsTrackerEntry[] = [];

// GET /api/ads-tracker
// Returns all ads tracker entries + registered product names
export async function GET() {
  try {
    if (!isFirebaseAvailable()) {
      return NextResponse.json({ entries: inMemoryStore, products: [] });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json({ entries: inMemoryStore, products: [] });
    }

    const [snapshot, productsSnap] = await Promise.all([
      db.collection(COLLECTIONS.ADS_TRACKER).orderBy('createdAt', 'desc').get(),
      db.collection(COLLECTIONS.ADS_PRODUCTS).get(),
    ]);

    const entries: AdsTrackerEntry[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: data.id ?? doc.id,
        productName: data.productName ?? '',
        creativeFolderLink: data.creativeFolderLink ?? '',
        batchName: data.batchName ?? '',
        creativeType: data.creativeType ?? '',
        dailyAdSpend: data.dailyAdSpend ?? 0,
        weeklyRoas: data.weeklyRoas ?? 0,
        creativeBatchResult: data.creativeBatchResult ?? '',
        createdAt: data.createdAt ?? '',
        updatedAt: data.updatedAt ?? '',
      };
    });

    const products: string[] = productsSnap.docs.map((doc) => doc.data().name ?? doc.id);

    return NextResponse.json({ entries, products });
  } catch (error) {
    console.error('Error fetching ads tracker entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ads tracker entries.' },
      { status: 500 }
    );
  }
}

// POST /api/ads-tracker
// Body: { productName } to register product, or { productName, batchName, ... } to create batch entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();
    const productName = (body.productName ?? '').trim();

    // If only productName is provided (no batch fields), register the product
    const isProductOnly = !body.batchName && !body.creativeType && !body.creativeFolderLink && !body.dailyAdSpend && !body.weeklyRoas && !body.creativeBatchResult;

    if (isProductOnly && productName) {
      if (isFirebaseAvailable()) {
        const db = getFirestore();
        if (db) {
          await db.collection(COLLECTIONS.ADS_PRODUCTS).doc(productName).set({ name: productName, createdAt: now });
        }
      }
      return NextResponse.json({ success: true, product: productName });
    }

    // Otherwise create a batch entry
    const entry: AdsTrackerEntry = {
      id: crypto.randomUUID(),
      productName,
      creativeFolderLink: body.creativeFolderLink ?? '',
      batchName: body.batchName ?? '',
      creativeType: body.creativeType ?? '',
      dailyAdSpend: Number(body.dailyAdSpend) || 0,
      weeklyRoas: Number(body.weeklyRoas) || 0,
      creativeBatchResult: body.creativeBatchResult ?? '',
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

    // Also register the product if not already registered
    await Promise.all([
      db.collection(COLLECTIONS.ADS_TRACKER).doc(entry.id).set(entry),
      db.collection(COLLECTIONS.ADS_PRODUCTS).doc(productName).set({ name: productName, createdAt: now }, { merge: true }),
    ]);

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error creating ads tracker entry:', error);
    return NextResponse.json(
      { error: 'Failed to create ads tracker entry.' },
      { status: 500 }
    );
  }
}

// PATCH /api/ads-tracker
// Body: { id, ...fieldsToUpdate }
// Updates an existing ads tracker entry
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Entry id is required.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const sanitizedUpdates: Partial<AdsTrackerEntry> = {};

    if (updates.productName !== undefined) sanitizedUpdates.productName = updates.productName;
    if (updates.creativeFolderLink !== undefined) sanitizedUpdates.creativeFolderLink = updates.creativeFolderLink;
    if (updates.batchName !== undefined) sanitizedUpdates.batchName = updates.batchName;
    if (updates.creativeType !== undefined) sanitizedUpdates.creativeType = updates.creativeType;
    if (updates.dailyAdSpend !== undefined) sanitizedUpdates.dailyAdSpend = Number(updates.dailyAdSpend) || 0;
    if (updates.weeklyRoas !== undefined) sanitizedUpdates.weeklyRoas = Number(updates.weeklyRoas) || 0;
    if (updates.creativeBatchResult !== undefined) sanitizedUpdates.creativeBatchResult = updates.creativeBatchResult;
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

    const found = await resolveDocRef(db.collection(COLLECTIONS.ADS_TRACKER), id);
    if (!found) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }
    const docRef = found.ref;

    await docRef.update(sanitizedUpdates);
    const updated = await docRef.get();

    return NextResponse.json({ success: true, entry: { id, ...updated.data() } });
  } catch (error) {
    console.error('Error updating ads tracker entry:', error);
    return NextResponse.json(
      { error: 'Failed to update ads tracker entry.' },
      { status: 500 }
    );
  }
}

// DELETE /api/ads-tracker
// Body: { id } to delete a single entry, or { productName } to delete all entries for a product
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id, productName } = body;

    if (!id && !productName) {
      return NextResponse.json({ error: 'Entry id or productName is required.' }, { status: 400 });
    }

    // Delete all entries for a product + remove from ads_products
    if (productName) {
      if (!isFirebaseAvailable()) {
        const before = inMemoryStore.length;
        for (let i = inMemoryStore.length - 1; i >= 0; i--) {
          if (inMemoryStore[i].productName === productName) inMemoryStore.splice(i, 1);
        }
        return NextResponse.json({ success: true, deleted: before - inMemoryStore.length });
      }

      const db = getFirestore();
      if (!db) return NextResponse.json({ error: 'Firebase is not available.' }, { status: 500 });

      const snapshot = await db.collection(COLLECTIONS.ADS_TRACKER).where('productName', '==', productName).get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      // Also remove from ads_products registry
      batch.delete(db.collection(COLLECTIONS.ADS_PRODUCTS).doc(productName));
      await batch.commit();

      return NextResponse.json({ success: true, deleted: snapshot.size });
    }

    // Delete a single entry by id
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

    const found = await resolveDocRef(db.collection(COLLECTIONS.ADS_TRACKER), id);
    if (!found) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

    await found.ref.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ads tracker entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete ads tracker entry.' },
      { status: 500 }
    );
  }
}
