'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, CheckCircle2, XCircle, Clock, Loader2,
  Crown, Megaphone, Settings2, Headphones, Warehouse,
  Trash2, ChevronDown,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { RestrictedPage } from '@/components/restricted-page';

type ManagedUser = {
  id: string;
  email: string;
  role: string;
  status: 'active' | 'pending' | 'rejected';
  permissions: string[];
  createdAt: number;
};

const PAGES = [
  { path: '/', label: 'Home' },
  { path: '/finance', label: 'Finance' },
  { path: '/product-tracker', label: 'Products' },
  { path: '/ads-tracker', label: 'OPS Ads' },
  { path: '/prs', label: 'PRS' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/rto', label: 'RTO' },
  { path: '/dispatch', label: 'Dispatch' },
  { path: '/orders', label: 'Logistics' },
  { path: '/transactions', label: 'Transactions' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/settings', label: 'Settings' },
  { path: '/logs', label: 'Daily Logs' },
];

const ROLES = [
  { value: 'ceo', label: 'CEO', icon: Crown },
  { value: 'cmo', label: 'CMO', icon: Megaphone },
  { value: 'operations', label: 'Operations', icon: Settings2 },
  { value: 'customer_success', label: 'CS', icon: Headphones },
  { value: 'warehouse', label: 'Warehouse', icon: Warehouse },
  { value: 'user', label: 'User', icon: Users },
];

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  cmo: 'CMO',
  operations: 'Operations',
  customer_success: 'Customer Success',
  warehouse: 'Warehouse',
  admin: 'Admin',
  user: 'User',
};

const ROLE_COLORS: Record<string, string> = {
  ceo: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  cmo: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  operations: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  customer_success: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  warehouse: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  admin: 'border-primary/30 bg-primary/10 text-primary',
  user: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  active: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle2 },
  pending: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: Clock },
  rejected: { color: 'text-red-400 bg-red-500/10 border-red-500/30', icon: XCircle },
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = currentUser && ['admin', 'ceo'].includes(currentUser.role);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (isAdmin) fetchUsers();
    else setLoading(false);
  }, [isAdmin]);

  const handleStatusChange = async (userId: string, status: 'active' | 'rejected') => {
    setSaving(userId);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status }),
      });
      await fetchUsers();
    } catch { /* silently fail */ }
    setSaving(null);
  };

  const handleRoleChange = async (userId: string, role: string) => {
    setSaving(userId);
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      await fetchUsers();
    } catch { /* silently fail */ }
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
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, permissions: newPerms } : u)));
    } catch { /* silently fail */ }
    setSaving(null);
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Delete user "${email}"? This cannot be undone.`)) return;
    setDeletingId(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch { /* silently fail */ }
    setDeletingId(null);
  };

  if (!isAdmin) return <RestrictedPage />;

  // Sort: pending first, then active, then rejected
  const sortedUsers = [...users].sort((a, b) => {
    const order: Record<string, number> = { pending: 0, active: 1, rejected: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const activeCount = users.filter((u) => u.status === 'active').length;

  return (
    <PageTransition className="mx-auto max-w-7xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Users</h1>
          <p className="text-[11px] text-muted-foreground">Manage accounts, roles & page access</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">{activeCount} active</span>
          {pendingCount > 0 && (
            <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full">{pendingCount} pending</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No users found</p>
        </div>
      ) : (
        <StaggerContainer className="space-y-2">
          {sortedUsers.map((u) => {
            const statusCfg = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.pending;
            const StatusIcon = statusCfg.icon;
            const isExpanded = expandedId === u.id;
            const isSelf = u.email === currentUser?.email;

            return (
              <StaggerItem key={u.id}>
                <motion.div
                  layout
                  className={`rounded-xl border border-border bg-card transition-all ${isExpanded ? 'ring-1 ring-primary/20' : ''} ${u.status === 'pending' ? 'border-amber-500/20' : ''}`}
                >
                  {/* User Row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Avatar */}
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold uppercase ${ROLE_COLORS[u.role] ?? ROLE_COLORS.user}`}>
                      {u.email.charAt(0)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-foreground truncate">{u.email}</p>
                        {isSelf && <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">You</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground/60">
                        Joined {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>

                    {/* Badges + Actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {/* Role badge */}
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[u.role] ?? ROLE_COLORS.user}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>

                      {/* Status badge */}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusCfg.color}`}>
                        <StatusIcon className="h-2.5 w-2.5" />
                        {u.status}
                      </span>

                      {/* Pending actions */}
                      {u.status === 'pending' && saving !== u.id && (
                        <>
                          <button
                            onClick={() => handleStatusChange(u.id, 'active')}
                            className="rounded-md px-2.5 py-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleStatusChange(u.id, 'rejected')}
                            className="rounded-md px-2.5 py-1 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition"
                          >
                            Deny
                          </button>
                        </>
                      )}

                      {u.status === 'rejected' && saving !== u.id && (
                        <button
                          onClick={() => handleStatusChange(u.id, 'active')}
                          className="rounded-md px-2.5 py-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition"
                        >
                          Re-approve
                        </button>
                      )}

                      {saving === u.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

                      {/* Expand */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : u.id)}
                        className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground transition"
                      >
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded: Role, Permissions, Delete */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border px-4 py-3 space-y-4">
                          {/* Role selector */}
                          {u.role !== 'admin' && (
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Assign Role</p>
                              <div className="flex flex-wrap gap-1.5">
                                {ROLES.map((role) => {
                                  const isActive = u.role === role.value;
                                  const RoleIcon = role.icon;
                                  return (
                                    <button
                                      key={role.value}
                                      disabled={saving === u.id}
                                      onClick={() => handleRoleChange(u.id, role.value)}
                                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                                        isActive
                                          ? ROLE_COLORS[role.value]
                                          : 'border-border bg-card text-muted-foreground/50 hover:text-muted-foreground hover:border-border/80'
                                      }`}
                                    >
                                      <RoleIcon className="h-3 w-3" />
                                      {role.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Page permissions */}
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Page Access</p>
                            <div className="flex flex-wrap gap-1.5">
                              {PAGES.map((page) => {
                                const hasAccess = u.permissions.includes(page.path);
                                return (
                                  <button
                                    key={page.path}
                                    disabled={saving === u.id}
                                    onClick={() => handlePermissionToggle(u.id, page.path, u.permissions)}
                                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition ${
                                      hasAccess
                                        ? 'border-primary/30 bg-primary/10 text-primary'
                                        : 'border-border bg-card text-muted-foreground/50 hover:text-muted-foreground hover:border-border/80'
                                    }`}
                                  >
                                    {page.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Delete */}
                          {!isSelf && (
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={() => handleDelete(u.id, u.email)}
                                disabled={deletingId === u.id}
                                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground/60 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                              >
                                {deletingId === u.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                Delete User
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}

      <p className="text-[11px] text-muted-foreground">{users.length} user{users.length !== 1 ? 's' : ''} · Click a row to manage</p>
    </PageTransition>
  );
}
