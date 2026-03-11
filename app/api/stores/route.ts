import { NextResponse } from 'next/server';
import { getRegisteredStores, registerStore, updateStoreDisplayName, unregisterStore } from '@/lib/store-registry';

export async function GET() {
  const stores = await getRegisteredStores();
  return NextResponse.json({
    stores,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const store = await registerStore({
      handle: body.handle ?? '',
      displayName: body.displayName ?? '',
      clientId: body.clientId ?? '',
      clientSecret: body.clientSecret ?? '',
    });

    return NextResponse.json({
      success: true,
      store: {
        handle: store.handle,
        domain: store.domain,
        displayName: store.displayName ?? null,
        lastTokenRefresh: store.tokenFetchedAt
          ? new Date(store.tokenFetchedAt).toISOString()
          : null,
        tokenExpiresAt: store.tokenExpiresAt
          ? new Date(store.tokenExpiresAt).toISOString()
          : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to register store.',
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    await unregisterStore(body.handle ?? '');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete store.' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const store = await updateStoreDisplayName(body.handle ?? '', body.displayName ?? '');
    return NextResponse.json({
      success: true,
      store: {
        handle: store.handle,
        domain: store.domain,
        displayName: store.displayName ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update store.',
      },
      { status: 400 }
    );
  }
}
