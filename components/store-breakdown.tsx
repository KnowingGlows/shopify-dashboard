'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StoreMetrics } from '@/types/shopify';
import { formatCurrency } from '@/lib/currency-converter';
import { Store, TrendingUp, Package } from 'lucide-react';

interface StoreBreakdownProps {
  stores: StoreMetrics[];
  currency: 'INR' | 'USD';
}

export function StoreBreakdown({ stores, currency }: StoreBreakdownProps) {
  const maxSales = Math.max(...stores.map((s) => s.totalSalesINR));

  return (
    <Card className="col-span-full border-border/60 bg-card/70 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-[0_0_16px_rgba(34,211,238,0.35)]">
            <Store className="h-5 w-5" />
          </span>
          Store-wise Breakdown
        </CardTitle>
        <CardDescription>Individual performance of each store</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {stores.map((store, index) => {
            const percentage = (store.totalSalesINR / maxSales) * 100;
            return (
              <div key={index} className="space-y-3 rounded-2xl border border-border/50 bg-background/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold leading-none text-foreground">
                      {store.storeName}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {formatCurrency(store.totalSalesINR, currency)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {store.totalOrders} orders
                      </span>
                      <span>Avg: {formatCurrency(store.averageOrderValue, currency)}</span>
                    </div>
                  </div>
                </div>
                <div className="h-2.5 w-full rounded-full bg-secondary/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-emerald-400 to-cyan-300 transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
