import { NextResponse } from 'next/server';
import { getEnvStoreSummaries } from '@/lib/shopify-config';
import { getRegisteredStores, registerStore } from '@/lib/store-registry';

export async function GET() {
  return NextResponse.json({
    stores: getRegisteredStores(),
    envStores: getEnvStoreSummaries(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const store = await registerStore({
      handle: body.handle ?? '',
      clientId: body.clientId ?? '',
      clientSecret: body.clientSecret ?? '',
    });

    return NextResponse.json({
      success: true,
      store: {
        handle: store.handle,
        domain: store.domain,
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
