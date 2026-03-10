import { NextResponse } from 'next/server';
import { getFirestore, isFirebaseAvailable, COLLECTIONS } from '@/lib/firebase';
import type { Task, TaskComment } from '@/types/shopify';

const inMemoryStore: Task[] = [];

const db = () => (isFirebaseAvailable() ? getFirestore() : null);

// ── GET /api/tasks ──────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Fetch linkable entities for the entity-linking picker
    if (action === 'linkable-entities') {
      return getLinkableEntities();
    }

    // Fetch team members for assignee picker
    if (action === 'team-members') {
      return getTeamMembers();
    }

    const firestore = db();
    if (!firestore) {
      return NextResponse.json({ tasks: inMemoryStore });
    }

    const snapshot = await firestore
      .collection(COLLECTIONS.TASKS)
      .orderBy('createdAt', 'desc')
      .get();

    const tasks: Task[] = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: d.id ?? doc.id,
        title: d.title ?? '',
        description: d.description ?? '',
        status: d.status ?? 'todo',
        priority: d.priority ?? 'medium',
        assignee: d.assignee ?? '',
        createdBy: d.createdBy ?? '',
        dueDate: d.dueDate ?? '',
        linkedEntities: d.linkedEntities ?? [],
        comments: d.comments ?? [],
        tags: d.tags ?? [],
        createdAt: d.createdAt ?? '',
        updatedAt: d.updatedAt ?? '',
      };
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks.' }, { status: 500 });
  }
}

// ── POST /api/tasks ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const task: Task = {
      id: crypto.randomUUID(),
      title: body.title ?? '',
      description: body.description ?? '',
      status: body.status ?? 'todo',
      priority: body.priority ?? 'medium',
      assignee: body.assignee ?? '',
      createdBy: body.createdBy ?? '',
      dueDate: body.dueDate ?? '',
      linkedEntities: body.linkedEntities ?? [],
      comments: [],
      tags: body.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const firestore = db();
    if (!firestore) {
      inMemoryStore.unshift(task);
      return NextResponse.json({ success: true, task });
    }

    await firestore.collection(COLLECTIONS.TASKS).doc(task.id).set(task);
    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task.' }, { status: 500 });
  }
}

// ── PATCH /api/tasks ────────────────────────────────────────────────────────

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, action, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Task id is required.' }, { status: 400 });
    }

    const firestore = db();
    const now = new Date().toISOString();

    // Add comment action
    if (action === 'add-comment') {
      const comment: TaskComment = {
        id: crypto.randomUUID(),
        text: body.text ?? '',
        author: body.author ?? '',
        createdAt: now,
      };

      if (!firestore) {
        const task = inMemoryStore.find((t) => t.id === id);
        if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
        task.comments.push(comment);
        task.updatedAt = now;
        return NextResponse.json({ success: true, comment });
      }

      const docRef = firestore.collection(COLLECTIONS.TASKS).doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

      const existing = doc.data()!;
      const comments = [...(existing.comments ?? []), comment];
      await docRef.update({ comments, updatedAt: now });
      return NextResponse.json({ success: true, comment });
    }

    // General update
    const sanitized: Record<string, unknown> = { updatedAt: now };
    if ('title' in updates) sanitized.title = updates.title ?? '';
    if ('description' in updates) sanitized.description = updates.description ?? '';
    if ('status' in updates) sanitized.status = updates.status ?? 'todo';
    if ('priority' in updates) sanitized.priority = updates.priority ?? 'medium';
    if ('assignee' in updates) sanitized.assignee = updates.assignee ?? '';
    if ('dueDate' in updates) sanitized.dueDate = updates.dueDate ?? '';
    if ('linkedEntities' in updates) sanitized.linkedEntities = updates.linkedEntities ?? [];
    if ('tags' in updates) sanitized.tags = updates.tags ?? [];

    if (!firestore) {
      const idx = inMemoryStore.findIndex((t) => t.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
      inMemoryStore[idx] = { ...inMemoryStore[idx], ...sanitized } as Task;
      return NextResponse.json({ success: true, task: inMemoryStore[idx] });
    }

    const docRef = firestore.collection(COLLECTIONS.TASKS).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

    await docRef.update(sanitized);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Failed to update task.' }, { status: 500 });
  }
}

// ── DELETE /api/tasks ───────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Task id is required.' }, { status: 400 });
    }

    const firestore = db();
    if (!firestore) {
      const idx = inMemoryStore.findIndex((t) => t.id === id);
      if (idx === -1) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
      inMemoryStore.splice(idx, 1);
      return NextResponse.json({ success: true });
    }

    const docRef = firestore.collection(COLLECTIONS.TASKS).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });

    await docRef.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: 'Failed to delete task.' }, { status: 500 });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getLinkableEntities() {
  const firestore = db();
  if (!firestore) return NextResponse.json({ entities: [] });

  try {
    const [products, inventory, ads, prs] = await Promise.all([
      firestore.collection(COLLECTIONS.PRODUCT_TRACKER).get(),
      firestore.collection(COLLECTIONS.INVENTORY).get(),
      firestore.collection(COLLECTIONS.ADS_TRACKER).get(),
      firestore.collection(COLLECTIONS.PRS).get(),
    ]);

    const entities: Array<{ type: string; id: string; label: string }> = [];

    products.docs.forEach((doc) => {
      const d = doc.data();
      entities.push({ type: 'product', id: d.id ?? doc.id, label: d.productName ?? 'Unnamed Product' });
    });
    inventory.docs.forEach((doc) => {
      const d = doc.data();
      entities.push({ type: 'inventory', id: d.id ?? doc.id, label: `${d.productName ?? 'Unnamed'} (${d.store ?? 'No store'})` });
    });
    ads.docs.forEach((doc) => {
      const d = doc.data();
      entities.push({ type: 'ads', id: d.id ?? doc.id, label: `${d.productName ?? 'Unnamed'} — ${d.batchName ?? 'No batch'}` });
    });
    prs.docs.forEach((doc) => {
      const d = doc.data();
      entities.push({ type: 'prs', id: d.id ?? doc.id, label: d.productName ?? 'Unnamed Research' });
    });

    return NextResponse.json({ entities });
  } catch (error) {
    console.error('Error fetching linkable entities:', error);
    return NextResponse.json({ entities: [] });
  }
}

async function getTeamMembers() {
  const firestore = db();
  if (!firestore) return NextResponse.json({ members: [] });

  try {
    const snapshot = await firestore
      .collection(COLLECTIONS.USERS)
      .where('status', '==', 'active')
      .get();

    const members = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        email: d.email ?? '',
        role: d.role ?? 'user',
      };
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json({ members: [] });
  }
}
