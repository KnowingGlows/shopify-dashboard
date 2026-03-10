'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Filter, LayoutGrid, List, Calendar,
  X, MessageSquare, Link2, Trash2, Check, Loader2,
  AlertCircle, ArrowUp, ArrowRight, ArrowDown,
  Send, Pencil, Package, Box, Megaphone, FileSearch,
} from 'lucide-react';
import { PageTransition, StaggerContainer, StaggerItem } from '@/components/motion';
import { useAuth } from '@/components/auth-provider';
import { cn } from '@/lib/utils';
import type { Task, TaskStatus, TaskPriority, TaskLinkedEntity, TaskComment } from '@/types/shopify';

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; ring: string }> = {
  todo: { label: 'To Do', color: 'text-zinc-400', bg: 'bg-zinc-500/10', ring: 'ring-zinc-500/30' },
  in_progress: { label: 'In Progress', color: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/30' },
  review: { label: 'Review', color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/30' },
  done: { label: 'Done', color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30' },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: typeof AlertCircle }> = {
  urgent: { label: 'Urgent', color: 'text-red-400', icon: AlertCircle },
  high: { label: 'High', color: 'text-orange-400', icon: ArrowUp },
  medium: { label: 'Medium', color: 'text-yellow-400', icon: ArrowRight },
  low: { label: 'Low', color: 'text-blue-400', icon: ArrowDown },
};

const ENTITY_ICONS: Record<string, typeof Package> = {
  product: Package,
  inventory: Box,
  ads: Megaphone,
  prs: FileSearch,
};

const ENTITY_COLORS: Record<string, string> = {
  product: 'text-violet-400 bg-violet-500/10',
  inventory: 'text-cyan-400 bg-cyan-500/10',
  ads: 'text-amber-400 bg-amber-500/10',
  prs: 'text-emerald-400 bg-emerald-500/10',
};

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

type ViewMode = 'board' | 'list';

// ── Helper ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getInitials(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function isDueSoon(dueDate: string): boolean {
  if (!dueDate) return false;
  const diff = new Date(dueDate).getTime() - Date.now();
  return diff > 0 && diff < 2 * 86400000;
}

function isOverdue(dueDate: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate).getTime() < Date.now();
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TasksPage() {
  const { user } = useAuth();

  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ email: string; role: string }>>([]);
  const [linkableEntities, setLinkableEntities] = useState<Array<{ type: string; id: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // ── Fetch data ──────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTasks();
    // Fetch team members and linkable entities
    fetch('/api/tasks?action=team-members').then((r) => r.json()).then((d) => setTeamMembers(d.members ?? [])).catch(() => {});
    fetch('/api/tasks?action=linkable-entities').then((r) => r.json()).then((d) => setLinkableEntities(d.entities ?? [])).catch(() => {});
  }, [fetchTasks]);

  // ── Filtered tasks ────────────────────────────────────────────────────

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    if (filterPriority !== 'all') {
      result = result.filter((t) => t.priority === filterPriority);
    }
    if (filterAssignee !== 'all') {
      result = result.filter((t) => t.assignee === filterAssignee);
    }
    return result;
  }, [tasks, searchQuery, filterPriority, filterAssignee]);

  // Stats
  const stats = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    review: tasks.filter((t) => t.status === 'review').length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter((t) => t.status !== 'done' && isOverdue(t.dueDate)).length,
  }), [tasks]);

  // ── Task CRUD ─────────────────────────────────────────────────────────

  const createTask = async (taskData: Partial<Task>) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...taskData, createdBy: user?.email ?? '' }),
    });
    const data = await res.json();
    if (data.task) setTasks((prev) => [data.task, ...prev]);
    return data;
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    const res = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    if (res.ok) {
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t));
      if (detailTask?.id === id) setDetailTask((prev) => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : null);
    }
  };

  const deleteTask = async (id: string) => {
    const res = await fetch('/api/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (detailTask?.id === id) setDetailTask(null);
    }
  };

  const addComment = async (taskId: string, text: string) => {
    const res = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, action: 'add-comment', text, author: user?.email ?? '' }),
    });
    const data = await res.json();
    if (data.comment) {
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, comments: [...t.comments, data.comment] } : t));
      if (detailTask?.id === taskId) setDetailTask((prev) => prev ? { ...prev, comments: [...prev.comments, data.comment] } : null);
    }
  };

  // Quick status change via drag-like click
  const cycleStatus = (task: Task) => {
    const idx = STATUS_ORDER.indexOf(task.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    updateTask(task.id, { status: next });
  };

  // ── Loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats.total} tasks &middot; {stats.overdue > 0 && <span className="text-red-400">{stats.overdue} overdue &middot; </span>}
              {stats.inProgress} in progress
            </p>
          </div>
          <button
            onClick={() => { setEditingTask(null); setModalOpen(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>

        {/* Toolbar */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-white/[0.03] py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
                showFilters ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-white/[0.03] text-muted-foreground hover:text-foreground'
              )}
            >
              <Filter className="h-4 w-4" />
              Filters
              {(filterPriority !== 'all' || filterAssignee !== 'all') && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {(filterPriority !== 'all' ? 1 : 0) + (filterAssignee !== 'all' ? 1 : 0)}
                </span>
              )}
            </button>

            {/* View toggle */}
            <div className="flex rounded-lg border border-border">
              <button
                onClick={() => setViewMode('board')}
                className={cn('rounded-l-lg px-3 py-2 transition', viewMode === 'board' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
                title="Board view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn('rounded-r-lg px-3 py-2 transition', viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mb-5 flex flex-wrap gap-3 rounded-lg border border-border bg-white/[0.02] p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Priority:</span>
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value as TaskPriority | 'all')}
                    className="rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    <option value="all">All</option>
                    {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => (
                      <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Assignee:</span>
                  <select
                    value={filterAssignee}
                    onChange={(e) => setFilterAssignee(e.target.value)}
                    className="rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    <option value="all">Everyone</option>
                    {teamMembers.map((m) => (
                      <option key={m.email} value={m.email}>{m.email.split('@')[0]}</option>
                    ))}
                  </select>
                </div>
                {(filterPriority !== 'all' || filterAssignee !== 'all') && (
                  <button
                    onClick={() => { setFilterPriority('all'); setFilterAssignee('all'); }}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Board View */}
        {viewMode === 'board' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATUS_ORDER.map((status) => {
              const config = STATUS_CONFIG[status];
              const columnTasks = filteredTasks.filter((t) => t.status === status);
              return (
                <div key={status} className="flex flex-col">
                  {/* Column header */}
                  <div className={cn('mb-3 flex items-center gap-2 rounded-lg px-3 py-2', config.bg)}>
                    <div className={cn('h-2 w-2 rounded-full', config.color.replace('text-', 'bg-'))} />
                    <span className={cn('text-sm font-semibold', config.color)}>{config.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{columnTasks.length}</span>
                  </div>

                  {/* Column tasks */}
                  <div className="flex flex-col gap-2.5 min-h-[200px]">
                    <StaggerContainer className="flex flex-col gap-2.5">
                      {columnTasks.map((task) => (
                        <StaggerItem key={task.id}>
                          <TaskCard
                            task={task}
                            onClick={() => setDetailTask(task)}
                            onStatusCycle={() => cycleStatus(task)}
                          />
                        </StaggerItem>
                      ))}
                    </StaggerContainer>

                    {columnTasks.length === 0 && (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/50 py-8">
                        <p className="text-xs text-muted-foreground/60">No tasks</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="rounded-xl border border-border overflow-hidden">
            {/* List header */}
            <div className="grid grid-cols-[1fr_100px_100px_120px_100px] gap-2 border-b border-border bg-white/[0.02] px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Task</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Assignee</span>
              <span>Due Date</span>
            </div>

            <StaggerContainer>
              {filteredTasks.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm text-muted-foreground">No tasks found</p>
                </div>
              )}
              {filteredTasks.map((task) => (
                <StaggerItem key={task.id}>
                  <button
                    type="button"
                    onClick={() => setDetailTask(task)}
                    className="grid w-full grid-cols-[1fr_100px_100px_120px_100px] gap-2 border-b border-border/50 px-4 py-3 text-left transition hover:bg-white/[0.02]"
                  >
                    {/* Title + linked */}
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); cycleStatus(task); }}
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                          task.status === 'done'
                            ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {task.status === 'done' && <Check className="h-3 w-3" />}
                      </button>
                      <span className={cn('truncate text-sm', task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground')}>
                        {task.title}
                      </span>
                      {task.linkedEntities.length > 0 && <Link2 className="h-3 w-3 shrink-0 text-primary/60" />}
                      {task.comments.length > 0 && (
                        <span className="flex items-center gap-0.5 text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          <span className="text-[10px]">{task.comments.length}</span>
                        </span>
                      )}
                    </div>

                    {/* Status */}
                    <div>
                      <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium', STATUS_CONFIG[task.status].bg, STATUS_CONFIG[task.status].color)}>
                        {STATUS_CONFIG[task.status].label}
                      </span>
                    </div>

                    {/* Priority */}
                    <div className="flex items-center gap-1">
                      <PriorityIcon priority={task.priority} size={13} />
                      <span className={cn('text-xs', PRIORITY_CONFIG[task.priority].color)}>
                        {PRIORITY_CONFIG[task.priority].label}
                      </span>
                    </div>

                    {/* Assignee */}
                    <div>
                      {task.assignee ? (
                        <span className="text-xs text-muted-foreground">{task.assignee.split('@')[0]}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">Unassigned</span>
                      )}
                    </div>

                    {/* Due date */}
                    <div>
                      {task.dueDate ? (
                        <span className={cn(
                          'text-xs',
                          task.status !== 'done' && isOverdue(task.dueDate) ? 'text-red-400' :
                          task.status !== 'done' && isDueSoon(task.dueDate) ? 'text-amber-400' :
                          'text-muted-foreground'
                        )}>
                          {new Date(task.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">No date</span>
                      )}
                    </div>
                  </button>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        )}

        {/* Create/Edit Modal */}
        <AnimatePresence>
          {modalOpen && (
            <TaskModal
              task={editingTask}
              teamMembers={teamMembers}
              linkableEntities={linkableEntities}
              onClose={() => { setModalOpen(false); setEditingTask(null); }}
              onSave={async (data) => {
                if (editingTask) {
                  await updateTask(editingTask.id, data);
                } else {
                  await createTask(data);
                }
                setModalOpen(false);
                setEditingTask(null);
              }}
            />
          )}
        </AnimatePresence>

        {/* Detail Drawer */}
        <AnimatePresence>
          {detailTask && (
            <TaskDetailDrawer
              task={detailTask}
              teamMembers={teamMembers}
              linkableEntities={linkableEntities}
              onClose={() => setDetailTask(null)}
              onUpdate={(updates) => updateTask(detailTask.id, updates)}
              onDelete={() => deleteTask(detailTask.id)}
              onAddComment={(text) => addComment(detailTask.id, text)}
              onEdit={() => { setEditingTask(detailTask); setDetailTask(null); setModalOpen(true); }}
            />
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}

// ── PriorityIcon ────────────────────────────────────────────────────────────

function PriorityIcon({ priority, size = 14 }: { priority: TaskPriority; size?: number }) {
  const config = PRIORITY_CONFIG[priority];
  const Icon = config.icon;
  return <Icon className={config.color} style={{ width: size, height: size }} />;
}

// ── Task Card (Board View) ──────────────────────────────────────────────────

function TaskCard({ task, onClick, onStatusCycle }: { task: Task; onClick: () => void; onStatusCycle: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="w-full rounded-xl border border-border bg-[#111113] p-3.5 text-left transition hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Priority + tags row */}
      <div className="mb-2 flex items-center gap-2">
        <PriorityIcon priority={task.priority} />
        {task.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {tag}
          </span>
        ))}
        {task.dueDate && task.status !== 'done' && isOverdue(task.dueDate) && (
          <span className="ml-auto rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
            Overdue
          </span>
        )}
        {task.dueDate && task.status !== 'done' && isDueSoon(task.dueDate) && !isOverdue(task.dueDate) && (
          <span className="ml-auto rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            Due soon
          </span>
        )}
      </div>

      {/* Title */}
      <p className={cn('text-sm font-medium', task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground')}>
        {task.title}
      </p>

      {/* Description preview */}
      {task.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}

      {/* Linked entities */}
      {task.linkedEntities.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {task.linkedEntities.slice(0, 3).map((entity) => {
            const EntityIcon = ENTITY_ICONS[entity.type] ?? Package;
            return (
              <span key={entity.id} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]', ENTITY_COLORS[entity.type] ?? 'text-zinc-400 bg-zinc-500/10')}>
                <EntityIcon className="h-2.5 w-2.5" />
                <span className="max-w-[80px] truncate">{entity.label}</span>
              </span>
            );
          })}
          {task.linkedEntities.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{task.linkedEntities.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status checkbox */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStatusCycle(); }}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-md border transition',
              task.status === 'done'
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400'
                : task.status === 'in_progress'
                ? 'border-blue-500/50 bg-blue-500/20'
                : task.status === 'review'
                ? 'border-amber-500/50 bg-amber-500/20'
                : 'border-border hover:border-primary/50'
            )}
          >
            {task.status === 'done' && <Check className="h-3 w-3" />}
            {task.status === 'in_progress' && <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
            {task.status === 'review' && <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
          </button>
          {task.dueDate && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-2.5 w-2.5" />
              {new Date(task.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {task.comments.length > 0 && (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              <span className="text-[10px]">{task.comments.length}</span>
            </span>
          )}
          {task.assignee && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary" title={task.assignee}>
              {getInitials(task.assignee)}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ── Task Create/Edit Modal ──────────────────────────────────────────────────

function TaskModal({
  task,
  teamMembers,
  linkableEntities,
  onClose,
  onSave,
}: {
  task: Task | null;
  teamMembers: Array<{ email: string; role: string }>;
  linkableEntities: Array<{ type: string; id: string; label: string }>;
  onClose: () => void;
  onSave: (data: Partial<Task>) => Promise<void>;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [assignee, setAssignee] = useState(task?.assignee ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [linkedEntities, setLinkedEntities] = useState<TaskLinkedEntity[]>(task?.linkedEntities ?? []);
  const [showEntityPicker, setShowEntityPicker] = useState(false);
  const [entitySearch, setEntitySearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredEntities = useMemo(() => {
    const linked = new Set(linkedEntities.map((e) => e.id));
    let pool = linkableEntities.filter((e) => !linked.has(e.id));
    if (entitySearch) {
      const q = entitySearch.toLowerCase();
      pool = pool.filter((e) => e.label.toLowerCase().includes(q) || e.type.toLowerCase().includes(q));
    }
    return pool.slice(0, 10);
  }, [linkableEntities, linkedEntities, entitySearch]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), description, status, priority, assignee, dueDate, tags, linkedEntities });
    setSaving(false);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t]);
      setTagInput('');
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-4 top-[5%] bottom-[5%] z-50 mx-auto flex max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-[#0c0c0e] shadow-2xl sm:inset-x-auto"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">{task ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Title */}
          <div>
            <input
              type="text"
              placeholder="Task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent text-xl font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <textarea
              placeholder="Add a description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-white/[0.03] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Status + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              >
                {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee + Due date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Assignee</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.email} value={m.email}>{m.email.split('@')[0]} ({m.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tags</label>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {tag}
                  <button type="button" onClick={() => setTags((prev) => prev.filter((t) => t !== tag))} className="hover:text-primary/60">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="Add tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                className="min-w-[80px] flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              />
            </div>
          </div>

          {/* Linked Entities */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Linked Items</label>
              <button
                type="button"
                onClick={() => setShowEntityPicker(!showEntityPicker)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition"
              >
                <Link2 className="h-3 w-3" />
                Link item
              </button>
            </div>

            {/* Linked items list */}
            {linkedEntities.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {linkedEntities.map((entity) => {
                  const EntityIcon = ENTITY_ICONS[entity.type] ?? Package;
                  return (
                    <span key={entity.id} className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium', ENTITY_COLORS[entity.type] ?? 'text-zinc-400 bg-zinc-500/10')}>
                      <EntityIcon className="h-3 w-3" />
                      <span className="max-w-[140px] truncate">{entity.label}</span>
                      <button
                        type="button"
                        onClick={() => setLinkedEntities((prev) => prev.filter((e) => e.id !== entity.id))}
                        className="ml-0.5 opacity-60 hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Entity picker */}
            <AnimatePresence>
              {showEntityPicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-lg border border-border bg-white/[0.02] p-2">
                    <input
                      type="text"
                      placeholder="Search products, inventory, ads..."
                      value={entitySearch}
                      onChange={(e) => setEntitySearch(e.target.value)}
                      className="mb-2 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none"
                      autoFocus
                    />
                    <div className="max-h-[180px] overflow-y-auto space-y-0.5">
                      {filteredEntities.map((entity) => {
                        const EntityIcon = ENTITY_ICONS[entity.type] ?? Package;
                        return (
                          <button
                            key={entity.id}
                            type="button"
                            onClick={() => {
                              setLinkedEntities((prev) => [...prev, { type: entity.type as TaskLinkedEntity['type'], id: entity.id, label: entity.label }]);
                              setEntitySearch('');
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition hover:bg-white/[0.04]"
                          >
                            <EntityIcon className={cn('h-3.5 w-3.5 shrink-0', ENTITY_COLORS[entity.type]?.split(' ')[0] ?? 'text-zinc-400')} />
                            <span className="truncate text-foreground">{entity.label}</span>
                            <span className="ml-auto shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-muted-foreground">{entity.type}</span>
                          </button>
                        );
                      })}
                      {filteredEntities.length === 0 && (
                        <p className="px-2 py-3 text-center text-xs text-muted-foreground/60">No items found</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50 active:scale-[0.97]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Task Detail Drawer ──────────────────────────────────────────────────────

function TaskDetailDrawer({
  task,
  teamMembers,
  linkableEntities,
  onClose,
  onUpdate,
  onDelete,
  onAddComment,
  onEdit,
}: {
  task: Task;
  teamMembers: Array<{ email: string; role: string }>;
  linkableEntities: Array<{ type: string; id: string; label: string }>;
  onClose: () => void;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: () => void;
  onAddComment: (text: string) => void;
  onEdit: () => void;
}) {
  const [commentText, setCommentText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-[#0c0c0e] shadow-2xl"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition">
              <X className="h-5 w-5" />
            </button>
            <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', STATUS_CONFIG[task.status].bg, STATUS_CONFIG[task.status].color)}>
              {STATUS_CONFIG[task.status].label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="rounded-lg p-2 text-muted-foreground hover:text-foreground transition" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => { if (confirmDelete) { onDelete(); } else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); } }}
              className={cn('rounded-lg p-2 transition', confirmDelete ? 'bg-red-500/10 text-red-400' : 'text-muted-foreground hover:text-red-400')}
              title={confirmDelete ? 'Click again to confirm' : 'Delete'}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Title */}
          <h2 className={cn('text-xl font-bold', task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground')}>
            {task.title}
          </h2>

          {/* Description */}
          {task.description && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{task.description}</p>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div className="rounded-lg border border-border bg-white/[0.02] p-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Status</p>
              <select
                value={task.status}
                onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
                className="w-full bg-transparent text-sm font-medium text-foreground focus:outline-none"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="rounded-lg border border-border bg-white/[0.02] p-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Priority</p>
              <select
                value={task.priority}
                onChange={(e) => onUpdate({ priority: e.target.value as TaskPriority })}
                className="w-full bg-transparent text-sm font-medium text-foreground focus:outline-none"
              >
                {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                ))}
              </select>
            </div>

            {/* Assignee */}
            <div className="rounded-lg border border-border bg-white/[0.02] p-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Assignee</p>
              <select
                value={task.assignee}
                onChange={(e) => onUpdate({ assignee: e.target.value })}
                className="w-full bg-transparent text-sm font-medium text-foreground focus:outline-none"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.email} value={m.email}>{m.email.split('@')[0]}</option>
                ))}
              </select>
            </div>

            {/* Due date */}
            <div className="rounded-lg border border-border bg-white/[0.02] p-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Due Date</p>
              <input
                type="date"
                value={task.dueDate}
                onChange={(e) => onUpdate({ dueDate: e.target.value })}
                className="w-full bg-transparent text-sm font-medium text-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Tags */}
          {task.tags.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Linked entities */}
          {task.linkedEntities.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Linked Items</p>
              <div className="space-y-1.5">
                {task.linkedEntities.map((entity) => {
                  const EntityIcon = ENTITY_ICONS[entity.type] ?? Package;
                  return (
                    <div key={entity.id} className={cn('flex items-center gap-2 rounded-lg px-3 py-2', ENTITY_COLORS[entity.type] ?? 'bg-zinc-500/10')}>
                      <EntityIcon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">{entity.label}</span>
                      <span className="ml-auto rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">{entity.type}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Created info */}
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground/60">
            <span>Created by {task.createdBy?.split('@')[0] || 'unknown'}</span>
            <span>{timeAgo(task.createdAt)}</span>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Comments */}
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Comments
              {task.comments.length > 0 && <span className="text-xs font-normal text-muted-foreground">({task.comments.length})</span>}
            </p>

            <div className="space-y-3">
              {task.comments.map((comment) => (
                <div key={comment.id} className="flex gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {getInitials(comment.author)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{comment.author.split('@')[0]}</span>
                      <span className="text-[10px] text-muted-foreground/60">{timeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground whitespace-pre-wrap">{comment.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment input */}
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    onAddComment(commentText.trim());
                    setCommentText('');
                  }
                }}
                className="flex-1 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none"
              />
              <button
                onClick={() => { if (commentText.trim()) { onAddComment(commentText.trim()); setCommentText(''); } }}
                disabled={!commentText.trim()}
                className="rounded-lg bg-primary/10 p-2 text-primary transition hover:bg-primary/20 disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
