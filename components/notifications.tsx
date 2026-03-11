'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, BellRing, X, Send, Check, Loader2, MessageCircle,
  Volume2, VolumeX, Zap, Clock, User as UserIcon, Reply,
} from 'lucide-react';
import { useAuth } from './auth-provider';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type Notification = {
  id: string;
  type: 'ping' | 'system';
  subtype?: string;
  targetEmail: string;
  senderEmail: string;
  message: string;
  status: 'unread' | 'read' | 'dismissed';
  createdAt: number;
};

type TeamUser = {
  id: string;
  email: string;
  role: string;
};

// ── Sound Engine ──────────────────────────────────────────────────────────────

class NotificationSound {
  private audioCtx: AudioContext | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private playing = false;

  private getCtx(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    return this.audioCtx;
  }

  private playTone() {
    const ctx = this.getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Soft, warm two-tone chime (lower frequencies, gentle envelope)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(520, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.08);
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.15);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.22);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.55);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.55);
  }

  startLoop() {
    if (this.playing) return;
    this.playing = true;
    this.playTone();
    this.intervalId = setInterval(() => this.playTone(), 3000);
  }

  stop() {
    this.playing = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isPlaying() {
    return this.playing;
  }
}

const notifSound = typeof window !== 'undefined' ? new NotificationSound() : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getInitials(email: string): string {
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    ceo: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    cmo: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
    operations: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    customer_success: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    warehouse: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  };
  return colors[role] ?? 'text-zinc-400 bg-zinc-400/10 border-zinc-400/30';
}

// ── Notification Bell & Panel ─────────────────────────────────────────────────

export function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pingOpen, setPingOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const prevUnreadIdsRef = useRef<Set<string>>(new Set());

  // Poll for notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?action=list');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  // Sound management
  const active = notifications.filter((n) => n.status === 'unread' || n.status === 'read');
  const unread = notifications.filter((n) => n.status === 'unread');
  const hasUnread = unread.length > 0;

  // Track whether we need to play sound after user interaction (browser requires gesture for AudioContext)
  const pendingSoundRef = useRef(false);

  useEffect(() => {
    if (!notifSound) return;

    const currentUnreadIds = new Set(unread.map((n) => n.id));
    const prevIds = prevUnreadIdsRef.current;
    const hasNew = [...currentUnreadIds].some((id) => !prevIds.has(id));
    prevUnreadIdsRef.current = currentUnreadIds;

    if (hasUnread && hasNew && !muted) {
      // Try to play immediately; if AudioContext is suspended, queue for first user interaction
      try {
        notifSound.startLoop();
      } catch { /* ignore */ }
      pendingSoundRef.current = true;
    } else if (!hasUnread || muted) {
      notifSound.stop();
      pendingSoundRef.current = false;
    }

    return () => { notifSound.stop(); };
  }, [hasUnread, muted, unread]);

  // Resume AudioContext on first user interaction (browser policy requires gesture)
  useEffect(() => {
    if (!notifSound) return;
    const resumeAudio = () => {
      if (pendingSoundRef.current && hasUnread && !muted) {
        notifSound.stop();
        notifSound.startLoop();
      }
    };
    document.addEventListener('click', resumeAudio, { once: true });
    document.addEventListener('keydown', resumeAudio, { once: true });
    return () => {
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };
  }, [hasUnread, muted]);

  // Actions
  const dismiss = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss', notificationId: id }),
    }).catch(() => {});
  };

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, status: 'read' as const } : n));
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-read', notificationId: id }),
    }).catch(() => {});
  };

  const dismissAll = async () => {
    setNotifications([]);
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss-all' }),
    }).catch(() => {});
  };

  // Reply to a ping
  const replyToPing = async (notif: Notification, replyMsg: string) => {
    if (!replyMsg.trim()) return false;
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-ping',
          targetEmail: notif.senderEmail,
          message: `↩ Re: "${notif.message.slice(0, 60)}${notif.message.length > 60 ? '…' : ''}"\n${replyMsg.trim()}`,
        }),
      });
      if (res.ok) {
        // Auto-mark the original notification as read
        markRead(notif.id);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  };

  if (!user) return null;

  return (
    <>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => { setPanelOpen(!panelOpen); if (pingOpen) setPingOpen(false); }}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200',
          hasUnread
            ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
            : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground hover:border-border'
        )}
        aria-label={`${active.length} notifications`}
      >
        {hasUnread ? (
          <motion.div
            animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
          >
            <BellRing className="h-4 w-4" />
          </motion.div>
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {active.length > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-1 -top-1 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white min-w-[18px] h-[18px] px-0.5"
          >
            {active.length}
          </motion.span>
        )}
      </button>

      {/* Notification Panel — fixed center modal */}
      <AnimatePresence>
        {panelOpen && (
          <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] md:pt-[12vh]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setPanelOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-[90vw] max-w-[400px] rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl mx-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Notifications</span>
                  {active.length > 0 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {active.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMuted(!muted)}
                    className="rounded-lg p-1.5 text-muted-foreground transition hover:text-foreground"
                    title={muted ? 'Unmute' : 'Mute'}
                  >
                    {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                  {active.length > 0 && (
                    <button
                      type="button"
                      onClick={dismissAll}
                      className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>

              {/* Ping button */}
              <div className="border-b border-border/50 px-4 py-2">
                <button
                  type="button"
                  onClick={() => { setPingOpen(true); setPanelOpen(false); }}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5 text-[12px] font-medium text-primary transition hover:bg-primary/10 hover:border-primary/50"
                >
                  <Zap className="h-4 w-4" />
                  Ping a teammate
                </button>
              </div>

              {/* Notifications list */}
              <div className="max-h-[400px] overflow-y-auto">
                {active.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <Bell className="h-8 w-8 opacity-30" />
                    <p className="text-[12px]">All caught up</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {active.map((notif) => (
                      <NotificationItem
                        key={notif.id}
                        notif={notif}
                        onMarkRead={markRead}
                        onDismiss={dismiss}
                        onReply={replyToPing}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
          )}
        </AnimatePresence>

      {/* Ping Modal */}
      <AnimatePresence>
        {pingOpen && (
          <PingModal
            currentUserEmail={user.email}
            onClose={() => setPingOpen(false)}
            onSent={() => { setPingOpen(false); fetchNotifications(); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Notification Item ─────────────────────────────────────────────────────────

function NotificationItem({
  notif,
  onMarkRead,
  onDismiss,
  onReply,
}: {
  notif: Notification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onReply: (notif: Notification, msg: string) => Promise<boolean>;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyMsg, setReplyMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replyOpen && inputRef.current) inputRef.current.focus();
  }, [replyOpen]);

  const handleSendReply = async () => {
    if (!replyMsg.trim() || sending) return;
    setSending(true);
    const ok = await onReply(notif, replyMsg);
    setSending(false);
    if (ok) {
      setSent(true);
      setTimeout(() => { setSent(false); setReplyOpen(false); setReplyMsg(''); }, 1200);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={cn(
        'group relative rounded-xl p-3 transition',
        notif.status === 'unread'
          ? 'bg-primary/5 border border-primary/10'
          : 'hover:bg-white/[0.03]'
      )}
    >
      <div className="flex gap-3">
        {/* Avatar */}
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[11px] font-bold',
          notif.type === 'ping'
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-amber-400/30 bg-amber-400/10 text-amber-400'
        )}>
          {notif.type === 'ping' ? getInitials(notif.senderEmail) : <Zap className="h-4 w-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-foreground truncate">
              {notif.type === 'ping' ? notif.senderEmail.split('@')[0] : 'Orbit'}
            </span>
            {notif.status === 'unread' && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground leading-relaxed whitespace-pre-line">
            {notif.message}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
              <Clock className="h-3 w-3" />
              {timeAgo(notif.createdAt)}
            </span>
            {notif.type === 'ping' && !replyOpen && !sent && (
              <button
                type="button"
                onClick={() => setReplyOpen(true)}
                className="flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary transition"
              >
                <Reply className="h-3 w-3" />
                Reply
              </button>
            )}
            {sent && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <Check className="h-3 w-3" />
                Replied
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-start gap-1 opacity-0 group-hover:opacity-100 transition">
          {notif.status === 'unread' && (
            <button
              type="button"
              onClick={() => onMarkRead(notif.id)}
              className="rounded-lg p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
              title="Mark as read"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(notif.id)}
            className="rounded-lg p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Inline reply input */}
      <AnimatePresence>
        {replyOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-12 flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={replyMsg}
                onChange={(e) => setReplyMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendReply(); if (e.key === 'Escape') setReplyOpen(false); }}
                placeholder={`Reply to ${notif.senderEmail.split('@')[0]}...`}
                className="flex-1 rounded-lg border border-border/50 bg-background/60 px-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition"
              />
              <button
                type="button"
                onClick={handleSendReply}
                disabled={!replyMsg.trim() || sending}
                className="rounded-lg bg-primary/90 p-1.5 text-white transition hover:bg-primary disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => { setReplyOpen(false); setReplyMsg(''); }}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Ping Modal ────────────────────────────────────────────────────────────────

function PingModal({ currentUserEmail, onClose, onSent }: { currentUserEmail: string; onClose: () => void; onSent: () => void }) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notifications?action=users');
        const data = await res.json();
        setUsers((data.users ?? []).filter((u: TeamUser) => u.email !== currentUserEmail));
      } catch { /* ignore */ }
      finally { setLoadingUsers(false); }
    })();
  }, [currentUserEmail]);

  useEffect(() => {
    if (selectedUser && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedUser]);

  const handleSend = async () => {
    if (!selectedUser || !message.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-ping', targetEmail: selectedUser, message: message.trim() }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(onSent, 1200);
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  const selectedUserObj = users.find((u) => u.email === selectedUser);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg mx-4 rounded-3xl border border-border/50 bg-card/95 shadow-[0_0_80px_rgba(15,23,42,0.6)] backdrop-blur-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ping a teammate</h2>
              <p className="text-[11px] text-muted-foreground">Send a notification that rings until they see it</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sent confirmation */}
        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3 py-16"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10"
              >
                <Check className="h-8 w-8 text-emerald-400" />
              </motion.div>
              <p className="text-sm font-medium text-foreground">Ping sent!</p>
              <p className="text-[12px] text-muted-foreground">
                {selectedUserObj?.email.split('@')[0]} will be notified
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* User selection */}
              <div className="px-6 pt-5 pb-3">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">
                  Who to ping
                </label>
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : users.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground py-4">No other team members found</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {users.map((u) => {
                      const isSelected = selectedUser === u.email;
                      return (
                        <motion.button
                          key={u.id}
                          type="button"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setSelectedUser(isSelected ? null : u.email)}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium transition-all',
                            isSelected
                              ? 'border-primary/50 bg-primary/15 text-primary shadow-[0_0_12px_rgba(167,139,250,0.15)]'
                              : 'border-border/50 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground'
                          )}
                        >
                          <div className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-lg border text-[9px] font-bold',
                            isSelected ? 'border-primary/40 bg-primary/20 text-primary' : getRoleColor(u.role)
                          )}>
                            {getInitials(u.email)}
                          </div>
                          <span>{u.email.split('@')[0]}</span>
                          <span className={cn(
                            'rounded-md px-1.5 py-0.5 text-[9px] uppercase',
                            getRoleColor(u.role)
                          )}>
                            {u.role === 'customer_success' ? 'CS' : u.role}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Message input */}
              <AnimatePresence>
                {selectedUser && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-5">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2 block">
                        Message
                      </label>
                      <textarea
                        ref={inputRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleSend(); }}
                        placeholder={`What do you need ${selectedUserObj?.email.split('@')[0]} to know?`}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-border/50 bg-background/60 px-4 py-3 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition"
                      />
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground/50">
                          ⌘ + Enter to send
                        </p>
                        <button
                          type="button"
                          onClick={handleSend}
                          disabled={!message.trim() || sending}
                          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {sending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Send Ping
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
