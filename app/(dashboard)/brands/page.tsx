'use client';

import { useEffect, useState } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageTransition, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion';
import { formatINR } from '@/lib/currency-converter';
import { Store, Sparkles, Loader2, TrendingUp, Wallet } from 'lucide-react';

const brandInfo: Record<string, { description: string; highlight: string }> = {
  Kairova: {
    description: 'Luxury essentials, curated and fast moving.',
    highlight: 'Top performer this week',
  },
  Mavric: {
    description: 'Street luxe drops with bold, high energy edits.',
    highlight: 'New arrivals trending',
  },
};

type BrandData = {
  brand: string;
  profit: number;
  cashflow: number;
  adspend: number;
};

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const res = await fetch('/api/pnl');
        const data = await res.json();
        const entries: BrandData[] = data.entries ?? [];

        const allBrands: BrandData[] = ['Kairova', 'Mavric'].map((name) => {
          const existing = entries.find((e) => e.brand === name);
          return existing ?? { brand: name, profit: 0, cashflow: 0, adspend: 0 };
        });
        setBrands(allBrands);
      } catch {
        setBrands(
          ['Kairova', 'Mavric'].map((name) => ({
            brand: name,
            profit: 0,
            cashflow: 0,
            adspend: 0,
          }))
        );
      } finally {
        setLoading(false);
      }
    };
    fetchBrands();
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <PageTransition className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="flex flex-col gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Brand collection
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  Brands
                </h1>
                <p className="text-muted-foreground mt-2">
                  Monitor every brand pulse from a single command center.
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                {brands.length} active brands
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <StaggerContainer className="grid gap-4 md:grid-cols-2">
            {brands.map((brand) => {
              const info = brandInfo[brand.brand] ?? {
                description: '',
                highlight: '',
              };
              return (
                <StaggerItem key={brand.brand}>
                  <Card className="group relative overflow-hidden border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_0_40px_rgba(167,139,250,0.15)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(167,139,250,0.06),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    <CardHeader className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/60 text-primary shadow-[0_0_18px_rgba(167,139,250,0.2)]">
                          <Store className="h-6 w-6" />
                        </span>
                        <div>
                          <CardTitle className="text-2xl">{brand.brand}</CardTitle>
                          <CardDescription>{info.highlight}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="relative space-y-4">
                      <p className="text-sm text-muted-foreground">{info.description}</p>
                      <div className="grid gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground sm:grid-cols-2">
                        <div className="rounded-2xl border border-border/50 bg-background/50 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="h-3 w-3 text-emerald-400" />
                            Net Profit
                          </div>
                          <div className="mt-2 text-lg font-semibold text-foreground">
                            <AnimatedNumber value={brand.profit} formatter={formatINR} />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border/50 bg-background/50 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="h-3 w-3 text-blue-400" />
                            Cashflow
                          </div>
                          <div className="mt-2 text-lg font-semibold text-foreground">
                            <AnimatedNumber value={brand.cashflow} formatter={formatINR} />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}

        <div className="rounded-3xl border border-border/50 bg-card/60 p-6 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          Showing today&apos;s figures from finance data.
        </div>
      </PageTransition>
    </div>
  );
}
