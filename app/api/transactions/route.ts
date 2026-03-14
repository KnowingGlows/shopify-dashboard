import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import { parseHDFCSMS, categorizeTransaction, type ParsedTransaction, type ExpenseCategory } from '@/lib/sms-parser';

// ── Types ────────────────────────────────────────────────────────────

interface StoredTransaction {
  id: string;
  type: 'debit' | 'credit';
  amount: number;
  account: string;
  date: string;
  mode: string;
  merchant?: string;
  reference?: string;
  balance?: number;
  category: ExpenseCategory;
  rawMessage: string;
  bank: string;
  confidence: number;
  status: 'pending' | 'approved' | 'dismissed'; // user review status
  createdAt: string;
  reviewedAt?: string;
  note?: string; // user-added note
}

// ── GET: Fetch transactions ──────────────────────────────────────────

export async function GET(request: Request) {
  try {
    if (!isFirebaseAvailable()) {
      return NextResponse.json({ error: 'Firebase not available' }, { status: 500 });
    }
    const db = getFirestore()!;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') ?? 'list';
    const status = searchParams.get('status'); // pending | approved | dismissed
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');
    const limit = parseInt(searchParams.get('limit') ?? '200');

    if (action === 'list') {
      let query = db.collection(COLLECTIONS.BANK_TRANSACTIONS)
        .orderBy('date', 'desc')
        .limit(limit);

      if (status) {
        query = query.where('status', '==', status);
      }
      if (startDate) {
        query = query.where('date', '>=', startDate);
      }
      if (endDate) {
        query = query.where('date', '<=', endDate);
      }

      const snap = await query.get();
      const transactions: StoredTransaction[] = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as StoredTransaction[];

      // Summary stats
      const summary = {
        total: transactions.length,
        pending: transactions.filter((t) => t.status === 'pending').length,
        approved: transactions.filter((t) => t.status === 'approved').length,
        totalDebit: transactions.filter((t) => t.type === 'debit' && t.status !== 'dismissed').reduce((s, t) => s + t.amount, 0),
        totalCredit: transactions.filter((t) => t.type === 'credit' && t.status !== 'dismissed').reduce((s, t) => s + t.amount, 0),
      };

      return NextResponse.json({ success: true, transactions, summary });
    }

    if (action === 'stats') {
      // Category breakdown for approved transactions
      const snap = await db.collection(COLLECTIONS.BANK_TRANSACTIONS)
        .where('status', '==', 'approved')
        .where('type', '==', 'debit')
        .get();

      const byCategory: Record<string, { count: number; total: number }> = {};
      snap.docs.forEach((doc) => {
        const data = doc.data();
        const cat = data.category ?? 'other';
        if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 };
        byCategory[cat].count++;
        byCategory[cat].total += data.amount ?? 0;
      });

      return NextResponse.json({ success: true, byCategory });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// ── POST: Ingest SMS or update transaction ───────────────────────────

export async function POST(request: Request) {
  try {
    if (!isFirebaseAvailable()) {
      return NextResponse.json({ error: 'Firebase not available' }, { status: 500 });
    }
    const db = getFirestore()!;
    const body = await request.json();
    const action = body.action;

    // ── Ingest raw SMS messages ──────────────────────────────────────
    if (action === 'ingest') {
      const messages: { text: string; sender?: string; date?: string }[] = body.messages ?? [];
      if (!messages.length) {
        return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
      }

      const results: { parsed: number; skipped: number; duplicates: number } = { parsed: 0, skipped: 0, duplicates: 0 };
      const batch = db.batch();

      for (const msg of messages) {
        const parsed = parseHDFCSMS(msg.text, msg.sender);
        if (!parsed) {
          results.skipped++;
          continue;
        }

        // Check for duplicates by reference or amount+date+time combo
        const dupQuery = parsed.reference
          ? await db.collection(COLLECTIONS.BANK_TRANSACTIONS)
              .where('reference', '==', parsed.reference)
              .limit(1)
              .get()
          : await db.collection(COLLECTIONS.BANK_TRANSACTIONS)
              .where('amount', '==', parsed.amount)
              .where('date', '==', parsed.date)
              .where('type', '==', parsed.type)
              .where('rawMessage', '==', parsed.rawMessage)
              .limit(1)
              .get();

        if (!dupQuery.empty) {
          results.duplicates++;
          continue;
        }

        const category = categorizeTransaction(parsed);
        const docRef = db.collection(COLLECTIONS.BANK_TRANSACTIONS).doc();
        batch.set(docRef, {
          type: parsed.type,
          amount: parsed.amount,
          account: parsed.account,
          date: parsed.date,
          mode: parsed.mode,
          merchant: parsed.merchant ?? null,
          reference: parsed.reference ?? null,
          balance: parsed.balance ?? null,
          category,
          rawMessage: parsed.rawMessage,
          bank: parsed.bank,
          confidence: parsed.confidence,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
        results.parsed++;
      }

      if (results.parsed > 0) {
        await batch.commit();
      }

      return NextResponse.json({ success: true, results });
    }

    // ── Update transaction status/category ───────────────────────────
    if (action === 'review') {
      const { id, status: newStatus, category: newCategory, note } = body;
      if (!id || !newStatus) {
        return NextResponse.json({ error: 'id and status required' }, { status: 400 });
      }

      const update: Record<string, unknown> = {
        status: newStatus,
        reviewedAt: new Date().toISOString(),
      };
      if (newCategory) update.category = newCategory;
      if (note !== undefined) update.note = note;

      await db.collection(COLLECTIONS.BANK_TRANSACTIONS).doc(id).update(update);
      return NextResponse.json({ success: true });
    }

    // ── Bulk approve ─────────────────────────────────────────────────
    if (action === 'bulk-approve') {
      const ids: string[] = body.ids ?? [];
      if (!ids.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });

      const batch = db.batch();
      for (const id of ids) {
        batch.update(db.collection(COLLECTIONS.BANK_TRANSACTIONS).doc(id), {
          status: 'approved',
          reviewedAt: new Date().toISOString(),
        });
      }
      await batch.commit();
      return NextResponse.json({ success: true, approved: ids.length });
    }

    // ── Bulk dismiss ─────────────────────────────────────────────────
    if (action === 'bulk-dismiss') {
      const ids: string[] = body.ids ?? [];
      if (!ids.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });

      const batch = db.batch();
      for (const id of ids) {
        batch.update(db.collection(COLLECTIONS.BANK_TRANSACTIONS).doc(id), {
          status: 'dismissed',
          reviewedAt: new Date().toISOString(),
        });
      }
      await batch.commit();
      return NextResponse.json({ success: true, dismissed: ids.length });
    }

    // ── Delete ───────────────────────────────────────────────────────
    if (action === 'delete') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      await db.collection(COLLECTIONS.BANK_TRANSACTIONS).doc(id).delete();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing transaction:', error);
    return NextResponse.json(
      { error: 'Failed to process', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
