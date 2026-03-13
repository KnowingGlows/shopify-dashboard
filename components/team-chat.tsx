'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, Loader2, Smile } from 'lucide-react';
import { useAuth } from './auth-provider';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  senderEmail: string;
  message: string;
  timestamp: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(email: string): string {
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

function getRoleColor(email: string): string {
  // Deterministic color from email hash
  const colors = [
    'text-violet-400 bg-violet-400/10 border-violet-400/30',
    'text-blue-400 bg-blue-400/10 border-blue-400/30',
    'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    'text-amber-400 bg-amber-400/10 border-amber-400/30',
    'text-rose-400 bg-rose-400/10 border-rose-400/30',
    'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  ];
  let hash = 0;
  for (const ch of email) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function shouldShowHeader(messages: ChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  // Show header if different sender or >5 min gap
  return prev.senderEmail !== curr.senderEmail || curr.timestamp - prev.timestamp > 5 * 60 * 1000;
}

// ── Sound ──────────────────────────────────────────────────────────────────────

function playChatSound() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close(), 500);
  } catch { /* ignore */ }
}

// ── Main Component ─────────────────────────────────────────────────────────────

const LAST_READ_KEY = 'orbit_chat_last_read';

function getLastRead(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(LAST_READ_KEY) ?? '0', 10);
}

function setLastRead(ts: number) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_READ_KEY, String(ts));
}

export function TeamChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const latestTsRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastReadRef = useRef(getLastRead());

  // Initial load
  const fetchInitial = useCallback(async () => {
    try {
      const res = await fetch('/api/chat');
      if (!res.ok) return;
      const data = await res.json();
      const msgs: ChatMessage[] = data.messages ?? [];
      setMessages(msgs);
      if (msgs.length > 0) latestTsRef.current = msgs[msgs.length - 1].timestamp;
      // Calculate unread (from others, newer than last read)
      const lastRead = lastReadRef.current;
      const unread = msgs.filter((m) => m.senderEmail !== user?.email && m.timestamp > lastRead);
      setUnreadCount(unread.length);
    } catch { /* ignore */ }
  }, [user?.email]);

  // Polling for new messages
  const fetchNew = useCallback(async () => {
    if (!latestTsRef.current) return;
    try {
      const res = await fetch(`/api/chat?since=${latestTsRef.current}`);
      if (!res.ok) return;
      const data = await res.json();
      const newMsgs: ChatMessage[] = data.messages ?? [];
      if (newMsgs.length === 0) return;

      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const toAdd = newMsgs.filter((m) => !ids.has(m.id));
        return [...prev, ...toAdd];
      });
      latestTsRef.current = newMsgs[newMsgs.length - 1].timestamp;

      // Unread badge: messages from others
      const fromOthers = newMsgs.filter((m) => m.senderEmail !== user?.email);
      if (fromOthers.length > 0) {
        if (!open) {
          setUnreadCount((c) => c + fromOthers.length);
          playChatSound();
        }
      }
    } catch { /* ignore */ }
  }, [user?.email, open]);

  useEffect(() => {
    if (!user) return;
    fetchInitial();
  }, [user, fetchInitial]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(fetchNew, 3000);
    return () => clearInterval(id);
  }, [user, fetchNew]);

  // Auto-scroll to bottom when messages change and panel is open
  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages, open]);

  // Mark read when opening
  useEffect(() => {
    if (open) {
      setUnreadCount(0);
      if (messages.length > 0) {
        const maxTs = Math.max(...messages.map((m) => m.timestamp));
        setLastRead(maxTs);
        lastReadRef.current = maxTs;
      }
      setTimeout(() => {
        inputRef.current?.focus();
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 100);
    }
  }, [open, messages]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    const msg = draft.trim();
    setDraft('');
    setSending(true);

    // Optimistic
    const optimistic: ChatMessage = {
      id: `opt_${Date.now()}`,
      senderEmail: user!.email,
      message: msg,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      if (res.ok) {
        const data = await res.json();
        // Replace optimistic with real
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? { ...m, id: data.message.id } : m))
        );
        latestTsRef.current = data.message.timestamp;
        setLastRead(data.message.timestamp);
        lastReadRef.current = data.message.timestamp;
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  if (!user) return null;

  return (
    <>
      {/* Chat button */}
      <motion.button
        type="button"
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200',
          open
            ? 'border-primary/50 bg-primary/15 text-primary shadow-[0_0_12px_rgba(167,139,250,0.2)]'
            : unreadCount > 0
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground hover:border-border'
        )}
        aria-label="Team chat"
      >
        <MessageSquare className="h-4 w-4" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -right-1 -top-1 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-white"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] flex items-end justify-end md:items-start md:justify-end p-4 md:pt-16 md:pr-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-auto"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="relative z-10 pointer-events-auto flex flex-col w-[90vw] max-w-[380px] h-[70vh] max-h-[600px] rounded-2xl border border-border/50 bg-card/95 shadow-[0_8px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Team Chat</p>
                    <p className="text-[10px] text-muted-foreground">Everyone · {messages.length} messages</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border/60 bg-background/60 p-1.5 text-muted-foreground transition hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/50 bg-background/50">
                      <Smile className="h-6 w-6 opacity-40" />
                    </div>
                    <div className="text-center">
                      <p className="text-[12px] font-medium">No messages yet</p>
                      <p className="text-[11px] opacity-60 mt-0.5">Be the first to say something</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const isMine = msg.senderEmail === user.email;
                    const showHeader = shouldShowHeader(messages, i);
                    return (
                      <div key={msg.id}>
                        {showHeader && (
                          <div className={cn('flex items-center gap-2 mt-3 mb-1', isMine ? 'flex-row-reverse' : '')}>
                            <div className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[9px] font-bold',
                              isMine ? 'border-primary/30 bg-primary/10 text-primary' : getRoleColor(msg.senderEmail)
                            )}>
                              {getInitials(msg.senderEmail)}
                            </div>
                            <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[140px]">
                              {isMine ? 'You' : msg.senderEmail.split('@')[0]}
                            </span>
                            <span className="text-[9px] text-muted-foreground/50 shrink-0">
                              {formatTime(msg.timestamp)}
                            </span>
                          </div>
                        )}
                        <div className={cn('flex', isMine ? 'justify-end' : 'justify-start', showHeader ? 'mt-0' : 'mt-0.5')}>
                          <div className={cn(
                            'max-w-[78%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed',
                            isMine
                              ? 'rounded-tr-sm bg-primary/20 text-foreground border border-primary/15'
                              : 'rounded-tl-sm bg-white/[0.06] text-foreground border border-border/40',
                            !showHeader && isMine && 'rounded-tr-2xl',
                            !showHeader && !isMine && 'rounded-tl-2xl',
                          )}>
                            {msg.message}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border/50 p-3 shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Message the team… (Enter to send)"
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-border/50 bg-background/60 px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition max-h-24 leading-relaxed"
                    style={{ scrollbarWidth: 'none' }}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 96) + 'px';
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim() || sending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-primary/30"
                  >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[9px] text-muted-foreground/40 text-center">Shift+Enter for new line</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
