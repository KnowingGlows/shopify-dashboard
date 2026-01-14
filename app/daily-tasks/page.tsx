import { BackgroundDecor } from '@/components/background-decor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList, Lock, UserCheck } from 'lucide-react';

const sampleSummaries = [
  {
    name: 'Nia',
    role: 'Operations',
    summary:
      'Wrapped up order dispatch for the morning batch, responded to 14 customer queries, and flagged three delayed shipments with the courier.',
  },
  {
    name: 'Rohit',
    role: 'Marketing',
    summary:
      'Published the Mavric capsule teaser, coordinated with the influencer drop, and finalized the paid media copy for next week.',
  },
  {
    name: 'Ava',
    role: 'Inventory',
    summary:
      'Completed stock audits for Kairova, reconciled incoming deliveries, and updated low-stock alerts for 6 SKUs.',
  },
];

export default function DailyTasksPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5 text-primary" />
            Daily operations
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Daily Tasks
              </h1>
              <p className="text-muted-foreground mt-2">
                Capture the team's daily execution in one running timeline.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              3 updates today
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
            <CardHeader>
              <CardTitle>Task summaries</CardTitle>
              <CardDescription>Daily snapshots from each team member.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sampleSummaries.map((entry) => (
                <div
                  key={entry.name}
                  className="rounded-2xl border border-border/50 bg-background/60 px-4 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    <span className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1">
                      <UserCheck className="h-3.5 w-3.5 text-primary" />
                      {entry.name}
                    </span>
                    <span>{entry.role}</span>
                  </div>
                  <p className="mt-3 text-sm text-foreground">{entry.summary}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
            <CardHeader>
              <CardTitle>Submit a summary</CardTitle>
              <CardDescription>Employee login arrives soon.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Multi-line entries will be enabled with auth.
              </div>
              <div className="relative">
                <textarea
                  disabled
                  rows={6}
                  placeholder="Example: Completed the inventory count, updated the delivery tracker, and closed pending returns."
                  className="w-full resize-none rounded-2xl border border-border/60 bg-background/50 px-4 py-3 text-sm text-muted-foreground shadow-[0_0_18px_rgba(15,23,42,0.25)] transition focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
                <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Locked
                </div>
              </div>
              <Button type="button" disabled className="w-full">
                Submit summary
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-3xl border border-border/50 bg-card/60 p-6 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          Daily logs will sync into the main dashboard once auth is live.
        </div>
      </div>
    </div>
  );
}
