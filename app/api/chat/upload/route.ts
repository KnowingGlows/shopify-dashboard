import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import admin from 'firebase-admin';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('orbit-session')?.value;
  if (!token) return null;
  try {
    const payload = await verifySessionToken(token);
    return payload as { email: string; role: string };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucket || admin.apps.length === 0) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() ?? '';
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `chat/${Date.now()}_${safeName}`;

    const storageBucket = admin.storage().bucket(bucket);
    const storageFile = storageBucket.file(path);

    await storageFile.save(buffer, {
      metadata: { contentType: file.type },
    });
    await storageFile.makePublic();

    const url = `https://storage.googleapis.com/${bucket}/${path}`;

    return NextResponse.json({
      url,
      name: file.name,
      type: file.type,
      size: file.size,
      ext: ext.toLowerCase(),
    });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
