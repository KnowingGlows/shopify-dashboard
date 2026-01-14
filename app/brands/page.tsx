import { BackgroundDecor } from '@/components/background-decor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, ArrowUpRight, Sparkles } from 'lucide-react';

const brands = [
  {
    name: 'Kairova',
    description: 'Luxury essentials, curated and fast moving.',
    highlight: 'Top performer this week',
  },
  {
    name: 'Mavric',
    description: 'Street luxe drops with bold, high energy edits.',
    highlight: 'New arrivals trending',
  },
];

export default function BrandsPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
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
                2 active brands
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {brands.map((brand) => (
            <Card
              key={brand.name}
              className="group relative overflow-hidden border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_0_40px_rgba(34,211,238,0.2)]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.08),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <CardHeader className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/60 text-primary shadow-[0_0_18px_rgba(34,211,238,0.2)]">
                    <Store className="h-6 w-6" />
                  </span>
                  <div>
                    <CardTitle className="text-2xl">{brand.name}</CardTitle>
                    <CardDescription>{brand.highlight}</CardDescription>
                  </div>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground transition-all duration-300 group-hover:border-primary/40 group-hover:text-primary">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </CardHeader>
              <CardContent className="relative space-y-4">
                <p className="text-sm text-muted-foreground">{brand.description}</p>
                <div className="grid gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/50 bg-background/50 px-3 py-2">
                    Live orders
                    <div className="mt-2 text-lg font-semibold text-foreground">23</div>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-background/50 px-3 py-2">
                    Revenue
                    <div className="mt-2 text-lg font-semibold text-foreground">INR 2.4L</div>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-background/50 px-3 py-2">
                    AOV
                    <div className="mt-2 text-lg font-semibold text-foreground">INR 3.2K</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="rounded-3xl border border-border/50 bg-card/60 p-6 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          Unified brand intelligence
        </div>
      </div>
    </div>
  );
}
