import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';

// The finance planner is a single editable document — products you're running,
// their per-order economics, fixed daily spend, logged ROAS and manual
// operating expenses. Stored under app_settings/finance_planner.

const DOC_ID = 'finance_planner';

const EMPTY_PLAN = { products: [], expenses: [], horizonDays: 30, startDate: '', gstInclusive: true, gstRegistered: true, updatedAt: '' };

export async function GET() {
  if (!isFirebaseAvailable()) return NextResponse.json({ plan: EMPTY_PLAN });
  try {
    const firestore = getFirestore();
    if (!firestore) return NextResponse.json({ plan: EMPTY_PLAN });
    const doc = await firestore.collection(COLLECTIONS.SETTINGS).doc(DOC_ID).get();
    return NextResponse.json({ plan: doc.exists ? doc.data() : EMPTY_PLAN });
  } catch (e) {
    console.error('planner GET failed', e);
    return NextResponse.json({ plan: EMPTY_PLAN });
  }
}

export async function POST(req: Request) {
  if (!isFirebaseAvailable()) return NextResponse.json({ ok: false, error: 'firestore unavailable' }, { status: 503 });
  try {
    const body = await req.json();
    const plan = {
      products: Array.isArray(body.products) ? body.products : [],
      expenses: Array.isArray(body.expenses) ? body.expenses : [],
      horizonDays: Number(body.horizonDays) || 30,
      startDate: typeof body.startDate === 'string' ? body.startDate : '',
      gstInclusive: body.gstInclusive !== false,
      gstRegistered: body.gstRegistered !== false,
      updatedAt: new Date().toISOString(),
    };
    const firestore = getFirestore();
    if (!firestore) return NextResponse.json({ ok: false, error: 'firestore unavailable' }, { status: 503 });
    await firestore.collection(COLLECTIONS.SETTINGS).doc(DOC_ID).set(plan, { merge: false });
    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    console.error('planner POST failed', e);
    return NextResponse.json({ ok: false, error: 'save failed' }, { status: 500 });
  }
}
