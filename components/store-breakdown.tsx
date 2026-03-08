'use client';

import { StoreMetrics } from '@/types/shopify';
import { formatCurrency } from '@/lib/currency-converter';

interface StoreBreakdownProps {
  stores: StoreMetrics[];
  currency: 'INR' | 'USD';
}

export function StoreBreakdown({ stores, currency }: StoreBreakdownProps) {
  const maxSales = Math.max(...stores.map((s) => s.totalSalesINR));

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-medium text-foreground">Store Breakdown</h2>
      </div>
      <div className="divide-y divide-border">
        {stores.map((store, index) => {
          const pct = maxSales > 0 ? (store.totalSalesINR / maxSales) * 100 : 0;
          return (
            <div key={index} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-foreground">{store.storeName}</span>
                <span className="text-[13px] font-semibold text-foreground">
                  {formatCurrency(store.totalSalesINR, currency)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {store.totalOrders} orders · Avg {formatCurrency(store.averageOrderValue, currency)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
