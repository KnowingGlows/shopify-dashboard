import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import { AdsTrackerEntry } from '@/types/shopify';

// In-memory fallback when Firebase is not configured
const inMemoryStore: AdsTrackerEntry[] = [];

// GET /api/ads-tracker
// Returns all ads tracker entries
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
      .collection(COLLECTIONS.ADS_TRACKER)
      .orderBy('createdAt', 'desc')
      .get();

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

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching ads tracker entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ads tracker entries.' },
      { status: 500 }
    );
  }
}

// POST /api/ads-tracker
// Body: { productName, creativeFolderLink, batchName, creativeType, dailyAdSpend, weeklyRoas, creativeBatchResult }
// Creates a new ads tracker entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();
    const entry: AdsTrackerEntry = {
      id: crypto.randomUUID(),
      productName: body.productName ?? '',
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

    await db.collection(COLLECTIONS.ADS_TRACKER).doc(entry.id).set(entry);

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

    const docRef = db.collection(COLLECTIONS.ADS_TRACKER).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

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
// Body: { id }
// Deletes an ads tracker entry
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

    const docRef = db.collection(COLLECTIONS.ADS_TRACKER).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ads tracker entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete ads tracker entry.' },
      { status: 500 }
    );
  }
}
