'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Bell, CheckCircle2, XCircle, X, Loader2 } from 'lucide-react';

type PendingUser = {
  id: string;
  email: string;
  createdAt: number;
};

export function PendingUsersNotification() {
  const { user } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [open, setOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users?status=pending');
      if (!res.ok) return;
      const data = await res.json();
      setPendingUsers(data.users ?? []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (!user || !['admin', 'ceo'].includes(user.role)) return;

    fetchPending();
    const interval = setInterval(fetchPending, 30_000);
    return () => clearInterval(interval);
  }, [user?.role, fetchPending]);

  const handleAction = async (userId: string, status: 'active' | 'rejected') => {
    setActionLoading(userId);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status }),
      });
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      // silently fail
    }
    setActionLoading(null);
  };

  if (!user || !['admin', 'ceo'].includes(user.role) || pendingUsers.length === 0) return null;

  return (
    <>
      {/* Bell badge */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/10 text-amber-400 transition hover:bg-amber-400/20"
        aria-label={`${pendingUsers.length} pending access requests`}
      >
        <Bell className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-black">
          {pendingUsers.length}
        </span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md mx-4 rounded-3xl border border-border/50 bg-card/95 p-6 shadow-[0_0_80px_rgba(15,23,42,0.6)] backdrop-blur">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/10">
                  <Bell className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground">
                    Access requests
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {pendingUsers.length} pending
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
              {pendingUsers.map((pu) => (
                <div
                  key={pu.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/60 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {pu.email}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(pu.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {actionLoading === pu.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(pu.id, 'active')}
                          className="h-8 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(pu.id, 'rejected')}
                          className="h-8 border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          Deny
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
