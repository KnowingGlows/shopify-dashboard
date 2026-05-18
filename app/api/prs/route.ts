import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS, resolveDocRef } from '@/lib/firebase';
import type { PRSEntry } from '@/types/shopify';

// In-memory fallback when Firebase is not configured
const inMemoryStore: PRSEntry[] = [];

// GET /api/prs — Return all PRS entries
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
      .collection(COLLECTIONS.PRS)
      .orderBy('createdAt', 'desc')
      .get();

    const entries: PRSEntry[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      entries.push({
        id: data.id ?? doc.id,
        productName: data.productName ?? '',
        adLink: data.adLink ?? '',
        websiteLink: data.websiteLink ?? '',
        driveLink: data.driveLink ?? '',
        status: data.status ?? '',
        createdAt: data.createdAt ?? '',
        updatedAt: data.updatedAt ?? '',
      });
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching PRS entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PRS entries.' },
      { status: 500 }
    );
  }
}

// POST /api/prs — Create a new PRS entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const entry: PRSEntry = {
      id: crypto.randomUUID(),
      productName: (body.productName ?? '').trim(),
      adLink: (body.adLink ?? '').trim(),
      websiteLink: (body.websiteLink ?? '').trim(),
      driveLink: (body.driveLink ?? '').trim(),
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

    await db.collection(COLLECTIONS.PRS).doc(entry.id).set(entry);

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error creating PRS entry:', error);
    return NextResponse.json(
      { error: 'Failed to create PRS entry.' },
      { status: 500 }
    );
  }
}

// PATCH /api/prs — Update an existing PRS entry by id
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Entry id is required.' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const patchData = {
      ...(updates.productName !== undefined && {
        productName: updates.productName.trim(),
      }),
      ...(updates.adLink !== undefined && {
        adLink: updates.adLink.trim(),
      }),
      ...(updates.websiteLink !== undefined && {
        websiteLink: updates.websiteLink.trim(),
      }),
      ...(updates.driveLink !== undefined && {
        driveLink: updates.driveLink.trim(),
      }),
      ...(updates.status !== undefined && { status: updates.status }),
      updatedAt: now,
    };

    if (!isFirebaseAvailable()) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json(
          { error: 'Entry not found.' },
          { status: 404 }
        );
      }
      inMemoryStore[idx] = { ...inMemoryStore[idx], ...patchData };
      return NextResponse.json({ success: true, entry: inMemoryStore[idx] });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json(
        { error: 'Firebase is not available.' },
        { status: 500 }
      );
    }

    const found = await resolveDocRef(db.collection(COLLECTIONS.PRS), id);

    if (!found) {
      return NextResponse.json(
        { error: 'Entry not found.' },
        { status: 404 }
      );
    }

    await found.ref.update(patchData);

    const updated = { ...found.snap.data(), ...patchData } as PRSEntry;
    return NextResponse.json({ success: true, entry: updated });
  } catch (error) {
    console.error('Error updating PRS entry:', error);
    return NextResponse.json(
      { error: 'Failed to update PRS entry.' },
      { status: 500 }
    );
  }
}

// DELETE /api/prs — Delete an entry by id
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Entry id is required.' },
        { status: 400 }
      );
    }

    if (!isFirebaseAvailable()) {
      const idx = inMemoryStore.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json(
          { error: 'Entry not found.' },
          { status: 404 }
        );
      }
      inMemoryStore.splice(idx, 1);
      return NextResponse.json({ success: true });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json(
        { error: 'Firebase is not available.' },
        { status: 500 }
      );
    }

    const found = await resolveDocRef(db.collection(COLLECTIONS.PRS), id);

    if (!found) {
      return NextResponse.json(
        { error: 'Entry not found.' },
        { status: 404 }
      );
    }

    await found.ref.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting PRS entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete PRS entry.' },
      { status: 500 }
    );
  }
}
