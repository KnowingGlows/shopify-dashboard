'use client';

import { useEffect, useState, useCallback } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { TiptapEditor } from '@/components/tiptap-editor';
import { useAuth } from '@/components/auth-provider';
import {
  ClipboardList,
  Save,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type DailyLog = {
  userId: string;
  userEmail: string;
  date: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDateLabel(dateStr: string): string {
  const today = getTodayIST();
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const label = date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (dateStr === today) return `${label} (Today)`;
  return label;
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function LogsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [date, setDate] = useState(getTodayIST);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [myContent, setMyContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const fetchLogs = useCallback(
    async (targetDate: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/logs?date=${targetDate}`);
        const data = await res.json();
        const fetchedLogs: DailyLog[] = data.logs ?? [];
        setLogs(fetchedLogs);

        const myLog = fetchedLogs.find((l) => l.userEmail === user?.email);
        setMyContent(myLog?.content ?? '');
      } catch {
        setLogs([]);
        setMyContent('');
      } finally {
        setLoading(false);
      }
    },
    [user?.email]
  );

  useEffect(() => {
    if (user) fetchLogs(date);
  }, [date, user, fetchLogs]);

  const saveLog = async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, content: myContent }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      if (isAdmin) fetchLogs(date);
    } catch {
      setSaveStatus('error');
    }
  };

  const otherLogs = logs.filter((l) => l.userEmail !== user?.email);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
        {/* Header */}
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5 text-primary" />
            Daily Logs
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Daily Logs
              </h1>
              <p className="mt-2 text-muted-foreground">
                Record your daily activity and progress updates.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDate((d) => shiftDate(d, -1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground transition hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                {formatDateLabel(date)}
              </div>
              <button
                onClick={() => {
                  const next = shiftDate(date, 1);
                  if (next <= getTodayIST()) setDate(next);
                }}
                disabled={date >= getTodayIST()}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Current user's editor */}
            <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Your Log</CardTitle>
                <Button
                  onClick={saveLog}
                  disabled={saveStatus === 'saving'}
                  variant="outline"
                  size="sm"
                  className="border-border/60 bg-background/60"
                >
                  {saveStatus === 'saving' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saveStatus === 'saved' ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="ml-2 text-[10px] uppercase tracking-[0.2em]">
                    {saveStatus === 'saving'
                      ? 'Saving'
                      : saveStatus === 'saved'
                        ? 'Saved'
                        : 'Save'}
                  </span>
                </Button>
              </CardHeader>
              <CardContent>
                <TiptapEditor
                  key={date}
                  content={myContent}
                  onChange={setMyContent}
                  placeholder="What did you work on today?"
                />
                {saveStatus === 'error' && (
                  <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                    Failed to save. Check if Firebase is configured.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Admin: Other team members' logs */}
            {isAdmin && otherLogs.length > 0 && (
              <div>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  Team Logs
                </h2>
                <Tabs defaultValue={otherLogs[0]?.userEmail}>
                  <TabsList className="mb-4 flex-wrap">
                    {otherLogs.map((log) => (
                      <TabsTrigger key={log.userId} value={log.userEmail}>
                        {log.userEmail.split('@')[0]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {otherLogs.map((log) => (
                    <TabsContent key={log.userId} value={log.userEmail}>
                      <Card className="border-border/50 bg-card/70">
                        <CardHeader>
                          <CardTitle className="text-sm">{log.userEmail}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div
                            className="tiptap min-h-[100px] rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground"
                            dangerouslySetInnerHTML={{
                              __html:
                                log.content ||
                                '<p class="text-muted-foreground">No log submitted.</p>',
                            }}
                          />
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            )}

            {isAdmin && otherLogs.length === 0 && (
              <div className="rounded-2xl border border-border/50 bg-card/60 p-6 text-center text-sm text-muted-foreground">
                No other team member logs for this date.
              </div>
            )}
          </>
        )}

        <div className="rounded-3xl border border-border/50 bg-card/60 p-6 text-xs uppercase tracking-[0.25em] text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          Write your daily log and hit Save. One log per user per day.
        </div>
      </div>
    </div>
  );
}
