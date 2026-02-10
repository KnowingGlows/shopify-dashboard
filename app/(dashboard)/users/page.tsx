'use client';

import { useEffect, useState } from 'react';
import { BackgroundDecor } from '@/components/background-decor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth-provider';
import { RestrictedPage } from '@/components/restricted-page';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

type ManagedUser = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'pending' | 'rejected';
  permissions: string[];
  createdAt: number;
};

const PAGES = [
  { path: '/', label: 'Home' },
  { path: '/brands', label: 'Brands' },
  { path: '/p-and-l', label: 'P&L' },
  { path: '/settings', label: 'Settings' },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    pending: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    rejected: 'border-red-500/40 bg-red-500/10 text-red-400',
  };

  const icons: Record<string, typeof CheckCircle2> = {
    active: CheckCircle2,
    pending: Clock,
    rejected: XCircle,
  };

  const Icon = icons[status] ?? Clock;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${styles[status] ?? ''}`}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'admin') fetchUsers();
    else setLoading(false);
  }, [currentUser?.role]);

  const handleStatusChange = async (userId: string, status: 'active' | 'rejected') => {
    setSaving(userId);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status }),
      });
      await fetchUsers();
    } catch {
      // silently fail
    }
    setSaving(null);
  };

  const handlePermissionToggle = async (userId: string, path: string, currentPerms: string[]) => {
    const newPerms = currentPerms.includes(path)
      ? currentPerms.filter((p) => p !== path)
      : [...currentPerms, path];

    setSaving(userId);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, permissions: newPerms }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, permissions: newPerms } : u))
      );
    } catch {
      // silently fail
    }
    setSaving(null);
  };

  if (currentUser?.role !== 'admin') {
    return <RestrictedPage />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BackgroundDecor />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-8">
        {/* Header */}
        <div className="flex flex-col gap-6 rounded-3xl border border-border/50 bg-card/60 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Admin
          </div>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Users
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage accounts and control page access for each user.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <Card className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]">
            <CardContent className="py-12 text-center text-muted-foreground">
              No users found.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {users.map((u) => (
              <Card
                key={u.id}
                className="border-border/50 bg-card/70 shadow-[0_0_30px_rgba(15,23,42,0.25)]"
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-primary/10 text-primary">
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold text-foreground">
                          {u.email}
                        </CardTitle>
                        <CardDescription className="text-[10px] uppercase tracking-[0.2em]">
                          {u.role} · joined{' '}
                          {new Date(u.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={u.status} />
                      {u.status === 'pending' && (
                        <div className="flex items-center gap-1.5">
                          {saving === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusChange(u.id, 'active')}
                                className="h-8 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                              >
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusChange(u.id, 'rejected')}
                                className="h-8 border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                              >
                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                Deny
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      {u.status === 'rejected' && saving !== u.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(u.id, 'active')}
                          className="h-8 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Re-approve
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Page permissions - only show for non-admin active/pending users */}
                {u.role !== 'admin' && (
                  <CardContent className="pt-0">
                    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                        Page access
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {PAGES.map((page) => {
                          const hasAccess = u.permissions.includes(page.path);
                          return (
                            <button
                              key={page.path}
                              type="button"
                              disabled={saving === u.id}
                              onClick={() =>
                                handlePermissionToggle(u.id, page.path, u.permissions)
                              }
                              className={`rounded-xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                                hasAccess
                                  ? 'border-primary/40 bg-primary/15 text-primary shadow-[0_0_12px_rgba(34,211,238,0.15)]'
                                  : 'border-border/40 bg-background/60 text-muted-foreground/50 hover:border-border/60 hover:text-muted-foreground'
                              }`}
                            >
                              {page.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
