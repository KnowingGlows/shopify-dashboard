'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, Save, Check, Loader2,
  ChevronLeft, ChevronRight, AlertCircle, Users2,
} from 'lucide-react';
import { TiptapEditor } from '@/components/tiptap-editor';
import { useAuth } from '@/components/auth-provider';
import { PageTransition } from '@/components/motion';

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

const ADMIN_ROLES = ['admin', 'ceo'];

export default function LogsPage() {
  const { user } = useAuth();
  const isAdmin = user && ADMIN_ROLES.includes(user.role);

  const [date, setDate] = useState(getTodayIST);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [myContent, setMyContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [activeTab, setActiveTab] = useState<string | null>(null);

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

  // Set initial active tab
  useEffect(() => {
    if (otherLogs.length > 0 && !activeTab) {
      setActiveTab(otherLogs[0].userEmail);
    }
  }, [otherLogs, activeTab]);

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Daily Logs</h1>
          <p className="text-[11px] text-muted-foreground">Record your daily activity and progress</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="rounded-md p-1.5 border border-border bg-card text-muted-foreground hover:text-foreground transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground tabular-nums">
            {formatDateLabel(date)}
          </div>
          <button
            onClick={() => {
              const next = shiftDate(date, 1);
              if (next <= getTodayIST()) setDate(next);
            }}
            disabled={date >= getTodayIST()}
            className="rounded-md p-1.5 border border-border bg-card text-muted-foreground hover:text-foreground transition disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Your Log */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-3.5 w-3.5 text-primary" />
                <h2 className="text-sm font-medium text-foreground">Your Log</h2>
              </div>
              <button
                onClick={saveLog}
                disabled={saveStatus === 'saving'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent transition disabled:opacity-50"
              >
                {saveStatus === 'saving' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : saveStatus === 'saved' ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save'}
              </button>
            </div>
            <div className="p-4">
              <TiptapEditor
                key={date}
                content={myContent}
                onChange={setMyContent}
                placeholder="What did you work on today?"
              />
              <AnimatePresence>
                {saveStatus === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 flex items-center gap-2"
                  >
                    <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                    <p className="text-[11px] text-red-400">Failed to save. Check if Firebase is configured.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Team Logs (Admin) */}
          {isAdmin && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center gap-2 mb-3">
                <Users2 className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">Team Logs</p>
                <span className="text-[11px] text-muted-foreground">({otherLogs.length})</span>
              </div>

              {otherLogs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/50 py-10 text-center">
                  <Users2 className="mx-auto h-6 w-6 text-muted-foreground/30 mb-2" />
                  <p className="text-[12px] text-muted-foreground">No team logs for this date</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Tabs */}
                  <div className="flex border-b border-border overflow-x-auto">
                    {otherLogs.map((log) => (
                      <button
                        key={log.userId}
                        onClick={() => setActiveTab(log.userEmail)}
                        className={`px-4 py-2.5 text-[12px] font-medium whitespace-nowrap border-b-2 transition ${
                          activeTab === log.userEmail
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {log.userEmail.split('@')[0]}
                      </button>
                    ))}
                  </div>
                  {/* Active tab content */}
                  {otherLogs.map((log) => (
                    <AnimatePresence key={log.userId}>
                      {activeTab === log.userEmail && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="p-4"
                        >
                          <p className="text-[11px] text-muted-foreground mb-2">{log.userEmail}</p>
                          <div
                            className="tiptap min-h-[100px] rounded-lg border border-border bg-background/50 px-4 py-3 text-[13px] text-foreground"
                            dangerouslySetInnerHTML={{
                              __html: log.content || '<p class="text-muted-foreground">No log submitted.</p>',
                            }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </>
      )}

      <p className="text-[11px] text-muted-foreground">One log per user per day · Auto-saved to Firestore</p>
    </PageTransition>
  );
}
