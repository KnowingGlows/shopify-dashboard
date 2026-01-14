import { BackgroundDecor } from '@/components/background-decor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatINR } from '@/lib/currency-converter';
import { ArrowDownRight, ArrowUpRight, BarChart3 } from 'lucide-react';

const dailyPnL = [
  {
    name: 'Kairova',
    profit: 184500,
    cashflow: 212300,
    note: 'Healthy margin from premium sets.',
  },
  {
    name: 'Mavric',
    profit: 142800,
    cashflow: 176450,
    note: 'Strong drop day, returns steady.',
  },
];

export default function PandLPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            Daily P&amp;L
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                P&amp;L
              </h1>
              <p className="text-muted-foreground mt-2">
                Track daily profit and cashflow for each brand.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Updated today
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {dailyPnL.map((brand) => (
            <Card
              key={brand.name}
              className="group relative overflow-hidden border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_0_40px_rgba(34,211,238,0.2)]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.08),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <CardHeader className="relative flex flex-col gap-3">
                <CardTitle className="text-2xl">{brand.name}</CardTitle>
                <CardDescription>{brand.note}</CardDescription>
              </CardHeader>
              <CardContent className="relative grid gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                    Daily profit
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {formatINR(brand.profit)}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="h-4 w-4 text-sky-300" />
                    Daily cashflow
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {formatINR(brand.cashflow)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="rounded-3xl border border-border/50 bg-card/60 p-6 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          Daily logs will populate this view as entries roll in.
        </div>
      </div>
    </div>
  );
}
