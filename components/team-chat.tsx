'use client';

import {
  useCallback, useEffect, useRef, useState, useLayoutEffect,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, X, Loader2, Smile, Minus, Maximize2, AtSign,
  Paperclip, FileText, Film, Image as ImageIcon, Download, ExternalLink,
  CheckCheck, Check,
} from 'lucide-react';
import { useAuth } from './auth-provider';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type Attachment = {
  url: string;
  name: string;
  type: string;
  size: number;
  ext: string;
};

type ChatMessage = {
  id: string;
  senderEmail: string;
  message: string;
  timestamp: number;
  readBy?: string[];
  attachments?: Attachment[];
};

type TeamMember = { id: string; email: string; role: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(email: string) {
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'text-violet-400 bg-violet-400/10 border-violet-400/30',
  'text-blue-400 bg-blue-400/10 border-blue-400/30',
  'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  'text-amber-400 bg-amber-400/10 border-amber-400/30',
  'text-rose-400 bg-rose-400/10 border-rose-400/30',
  'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  'text-orange-400 bg-orange-400/10 border-orange-400/30',
];

function getAvatarColor(email: string) {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return time;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shouldShowHeader(msgs: ChatMessage[], i: number) {
  if (i === 0) return true;
  return msgs[i].senderEmail !== msgs[i - 1].senderEmail || msgs[i].timestamp - msgs[i - 1].timestamp > 5 * 60_000;
}

const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

function renderMessage(text: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  const matches = [...text.matchAll(URL_REGEX)];
  for (const match of matches) {
    const start = match.index!;
    if (start > last) {
      // Render text chunk with @mention highlighting
      parts.push(renderTextWithMentions(text.slice(last, start), `t${last}`));
    }
    const url = match[0];
    parts.push(
      <a
        key={`url${start}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-primary hover:bg-primary/20 transition text-[11px] font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate max-w-[200px]">{url.replace(/^https?:\/\//, '')}</span>
      </a>
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(renderTextWithMentions(text.slice(last), `t${last}`));
  return <>{parts}</>;
}

function renderTextWithMentions(text: string, key: string) {
  const parts = text.split(/(@\w+)/g);
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} className="font-semibold text-primary/90 bg-primary/10 px-0.5 rounded">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

// ── Attachment rendering ───────────────────────────────────────────────────────

function AttachmentView({ att }: { att: Attachment }) {
  const isImage = att.type.startsWith('image/');
  const isVideo = att.type.startsWith('video/');
  const isPdf = att.type === 'application/pdf' || att.ext === 'pdf';

  if (isImage) {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.url}
          alt={att.name}
          className="max-w-[240px] max-h-[200px] rounded-xl border border-border/40 object-cover cursor-pointer hover:opacity-90 transition"
        />
      </a>
    );
  }

  if (isVideo) {
    return (
      <div className="mt-1.5">
        <video
          src={att.url}
          controls
          className="max-w-[280px] rounded-xl border border-border/40 bg-black"
          style={{ maxHeight: 200 }}
        />
      </div>
    );
  }

  // PDF / generic file chip
  const Icon = isPdf ? FileText : att.type.startsWith('video/') ? Film : FileText;
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-border/50 bg-background/40 px-3 py-2 hover:bg-background/70 transition max-w-[260px]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-foreground truncate">{att.name}</p>
        <p className="text-[10px] text-muted-foreground">{formatBytes(att.size)}</p>
      </div>
      <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </a>
  );
}

// ── Sound ──────────────────────────────────────────────────────────────────────

function playChatSound() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.28);
    osc.start(); osc.stop(ctx.currentTime + 0.28);
    setTimeout(() => ctx.close(), 500);
  } catch { /* ignore */ }
}

// ── Persistence helpers ────────────────────────────────────────────────────────

const LAST_READ_KEY = 'orbit_chat_last_read';
const SIZE_KEY = 'orbit_chat_size';

function getLastRead() { return typeof window === 'undefined' ? 0 : parseInt(localStorage.getItem(LAST_READ_KEY) ?? '0', 10); }
function setLastRead(ts: number) { if (typeof window !== 'undefined') localStorage.setItem(LAST_READ_KEY, String(ts)); }
function getSavedSize() {
  if (typeof window === 'undefined') return { w: 500, h: 640 };
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY) ?? '{}');
    return { w: Math.max(360, Math.min(900, s.w ?? 500)), h: Math.max(400, Math.min(window.innerHeight * 0.9, s.h ?? 640)) };
  } catch { return { w: 500, h: 640 }; }
}
function saveSize(w: number, h: number) { if (typeof window !== 'undefined') localStorage.setItem(SIZE_KEY, JSON.stringify({ w, h })); }

// ── Main Component ─────────────────────────────────────────────────────────────

export function TeamChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [size, setSize] = useState({ w: 500, h: 640 });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const latestTsRef = useRef(0);
  const lastReadRef = useRef(getLastRead());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ edge: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  useLayoutEffect(() => {
    const s = getSavedSize();
    setSize({ w: s.w, h: s.h });
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch('/api/notifications?action=users')
      .then((r) => r.json())
      .then((d) => setMembers(d.users ?? []))
      .catch(() => {});
  }, [user]);

  const fetchInitial = useCallback(async () => {
    try {
      const res = await fetch('/api/chat');
      if (!res.ok) return;
      const data = await res.json();
      const msgs: ChatMessage[] = data.messages ?? [];
      setMessages(msgs);
      if (msgs.length > 0) latestTsRef.current = msgs[msgs.length - 1].timestamp;
      const lastRead = lastReadRef.current;
      setUnreadCount(msgs.filter((m) => m.senderEmail !== user?.email && m.timestamp > lastRead).length);
    } catch { /* ignore */ }
  }, [user?.email]);

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
        return [...prev, ...newMsgs.filter((m) => !ids.has(m.id))];
      });
      latestTsRef.current = newMsgs[newMsgs.length - 1].timestamp;
      const fromOthers = newMsgs.filter((m) => m.senderEmail !== user?.email);
      if (fromOthers.length > 0 && (!open || minimized)) {
        setUnreadCount((c) => c + fromOthers.length);
        playChatSound();
      }
    } catch { /* ignore */ }
  }, [user?.email, open, minimized]);

  useEffect(() => { if (user) fetchInitial(); }, [user, fetchInitial]);
  useEffect(() => {
    if (!user) return;
    const id = setInterval(fetchNew, 3000);
    return () => clearInterval(id);
  }, [user, fetchNew]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  }, [messages, open, minimized]);

  // Mark read on open — call API and update local state
  useEffect(() => {
    if (!open || minimized || !user) return;
    setUnreadCount(0);
    const unreadIds = messages
      .filter((m) => m.senderEmail !== user.email && !(m.readBy ?? []).includes(user.email))
      .map((m) => m.id)
      .filter((id) => !id.startsWith('opt_'));

    if (unreadIds.length > 0) {
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-read', messageIds: unreadIds }),
      }).catch(() => {});
      setMessages((prev) =>
        prev.map((m) =>
          unreadIds.includes(m.id)
            ? { ...m, readBy: [...new Set([...(m.readBy ?? []), user.email])] }
            : m
        )
      );
    }

    if (messages.length > 0) {
      const maxTs = Math.max(...messages.map((m) => m.timestamp));
      setLastRead(maxTs);
      lastReadRef.current = maxTs;
    }
    setTimeout(() => {
      inputRef.current?.focus();
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }, 120);
  }, [open, minimized, user]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── @mention ─────────────────────────────────────────────────────────────────

  const mentionMatches = mentionQuery !== null
    ? members.filter((m) => m.email !== user?.email && m.email.split('@')[0].toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : [];

  const handleDraftChange = (val: string) => {
    setDraft(val);
    const match = val.match(/@(\w*)$/);
    if (match) { setMentionQuery(match[1]); setMentionIndex(0); }
    else setMentionQuery(null);
  };

  const insertMention = (email: string) => {
    const handle = email.split('@')[0];
    setDraft(draft.replace(/@(\w*)$/, `@${handle} `));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  // ── File attach ───────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles((prev) => [...prev, ...files].slice(0, 5)); // max 5 files
    e.target.value = '';
  };

  const removePendingFile = (idx: number) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

  // ── Send ─────────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if ((!draft.trim() && pendingFiles.length === 0) || sending) return;
    const msg = draft.trim();
    setDraft('');
    setMentionQuery(null);
    setSending(true);
    setUploading(pendingFiles.length > 0);

    // Upload files first
    const attachments: Attachment[] = [];
    for (const file of pendingFiles) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/chat/upload', { method: 'POST', body: fd });
        if (res.ok) {
          const data = await res.json();
          attachments.push(data);
        }
      } catch { /* ignore */ }
    }
    setPendingFiles([]);
    setUploading(false);

    const optimistic: ChatMessage = {
      id: `opt_${Date.now()}`,
      senderEmail: user!.email,
      message: msg,
      timestamp: Date.now(),
      readBy: [user!.email],
      attachments,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, attachments }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => prev.map((m) => m.id === optimistic.id ? { ...m, id: data.message.id } : m));
        latestTsRef.current = data.message.timestamp;
        setLastRead(data.message.timestamp);
        lastReadRef.current = data.message.timestamp;
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  // ── Resize ────────────────────────────────────────────────────────────────────

  const startResize = (edge: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { edge, startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const { edge: ed, startX, startY, startW, startH } = resizeRef.current;
      const dx = startX - ev.clientX;
      const dy = startY - ev.clientY;
      let newW = startW, newH = startH;
      if (ed === 'left' || ed === 'corner') newW = Math.max(360, Math.min(900, startW + dx));
      if (ed === 'top' || ed === 'corner') newH = Math.max(400, Math.min(window.innerHeight * 0.9, startH + dy));
      setSize({ w: newW, h: newH });
    };
    const onUp = () => {
      if (resizeRef.current) saveSize(size.w, size.h);
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Read receipt display ──────────────────────────────────────────────────────

  function ReadReceipts({ msg }: { msg: ChatMessage }) {
    const readers = (msg.readBy ?? []).filter((e) => e !== msg.senderEmail);
    if (readers.length === 0) return <Check className="h-3 w-3 text-muted-foreground/40" />;
    return (
      <span className="flex items-center gap-0.5">
        <CheckCheck className="h-3 w-3 text-primary/60" />
        <span className="text-[9px] text-muted-foreground/50">{readers.length}</span>
      </span>
    );
  }

  if (!user) return null;

  return (
    <>
      {/* ── Button ── */}
      <motion.button
        type="button"
        onClick={() => { setOpen(true); setMinimized(false); }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200',
          open && !minimized
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
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -right-1 -top-1 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-white shadow-sm"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* ── Window ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            style={{ width: minimized ? 320 : size.w, height: minimized ? 'auto' : size.h }}
            className="fixed bottom-4 right-4 z-[80] flex flex-col rounded-2xl border border-border/50 bg-[#111113] shadow-[0_8px_60px_rgba(0,0,0,0.55)] overflow-hidden"
          >
            {/* Resize handles */}
            {!minimized && (
              <>
                <div onMouseDown={startResize('left')} className="absolute left-0 top-10 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/20 transition z-10" />
                <div onMouseDown={startResize('top')} className="absolute top-0 left-10 right-0 h-1.5 cursor-ns-resize hover:bg-primary/20 transition z-10" />
                <div onMouseDown={startResize('corner')} className="absolute left-0 top-0 w-10 h-10 cursor-nwse-resize hover:bg-primary/10 transition z-10 rounded-tl-2xl" />
              </>
            )}

            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 shrink-0 bg-[#111113]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-foreground leading-none">Team Chat</p>
                  {!minimized && <p className="text-[10px] text-muted-foreground mt-0.5">{members.length + 1} members · everyone</p>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setMinimized((m) => !m)} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground">
                  {minimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => { setOpen(false); setMinimized(false); }} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <AnimatePresence>
              {!minimized && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1, flex: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col overflow-hidden"
                  style={{ minHeight: 0, flex: 1 }}
                >
                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5" style={{ minHeight: 0 }}>
                    {messages.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground py-16">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/50 bg-background/30">
                          <Smile className="h-6 w-6 opacity-30" />
                        </div>
                        <div className="text-center">
                          <p className="text-[12px] font-medium">No messages yet</p>
                          <p className="text-[11px] opacity-50 mt-0.5">Kick things off</p>
                        </div>
                      </div>
                    ) : (
                      messages.map((msg, i) => {
                        const isMine = msg.senderEmail === user.email;
                        const showHeader = shouldShowHeader(messages, i);
                        const isLast = i === messages.length - 1;
                        return (
                          <div key={msg.id}>
                            {showHeader && (
                              <div className={cn('flex items-center gap-2 mt-4 mb-1', isMine ? 'flex-row-reverse' : '')}>
                                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold', isMine ? 'border-primary/30 bg-primary/10 text-primary' : getAvatarColor(msg.senderEmail))}>
                                  {getInitials(msg.senderEmail)}
                                </div>
                                <span className="text-[11px] font-semibold text-foreground/80 truncate max-w-[150px]">
                                  {isMine ? 'You' : msg.senderEmail.split('@')[0]}
                                </span>
                                <span className="text-[10px] text-muted-foreground/50 shrink-0">{formatTime(msg.timestamp)}</span>
                              </div>
                            )}
                            <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start', 'mt-0.5')}>
                              {(msg.message || (msg.attachments ?? []).length > 0) && (
                                <div className={cn(
                                  'max-w-[78%]',
                                  msg.message && cn(
                                    'rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed',
                                    isMine
                                      ? 'rounded-tr-sm bg-primary/[0.18] text-foreground border border-primary/20'
                                      : 'rounded-tl-sm bg-white/[0.05] text-foreground border border-white/[0.06]',
                                    showHeader && isMine && 'rounded-tr-2xl',
                                    showHeader && !isMine && 'rounded-tl-2xl',
                                  )
                                )}>
                                  {msg.message && renderMessage(msg.message)}
                                  {(msg.attachments ?? []).map((att, ai) => (
                                    <AttachmentView key={ai} att={att} />
                                  ))}
                                </div>
                              )}
                              {/* Read receipts — only on sender's last message */}
                              {isMine && (isLast || shouldShowHeader(messages, i + 1)) && (
                                <div className="mt-0.5 flex items-center gap-1 pr-1">
                                  <ReadReceipts msg={msg} />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* @mention dropdown */}
                  <AnimatePresence>
                    {mentionQuery !== null && mentionMatches.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="mx-3 mb-1 rounded-xl border border-border/60 bg-[#16161a] shadow-lg overflow-hidden">
                        {mentionMatches.slice(0, 5).map((m, idx) => (
                          <button key={m.id} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(m.email); }}
                            className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-[12px] transition text-left', idx === mentionIndex ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-white/[0.04]')}>
                            <div className={cn('flex h-6 w-6 items-center justify-center rounded-md border text-[9px] font-bold shrink-0', getAvatarColor(m.email))}>
                              {getInitials(m.email)}
                            </div>
                            <span className="font-medium truncate">{m.email.split('@')[0]}</span>
                            <span className="ml-auto text-[10px] opacity-50 capitalize shrink-0">{m.role === 'customer_success' ? 'CS' : m.role}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Pending files preview */}
                  <AnimatePresence>
                    {pendingFiles.length > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="border-t border-border/30 px-3 py-2 flex flex-wrap gap-2">
                        {pendingFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 text-[11px]">
                            {f.type.startsWith('image/') ? <ImageIcon className="h-3 w-3 text-blue-400" /> : f.type.startsWith('video/') ? <Film className="h-3 w-3 text-violet-400" /> : <FileText className="h-3 w-3 text-amber-400" />}
                            <span className="truncate max-w-[100px] text-foreground/80">{f.name}</span>
                            <button type="button" onClick={() => removePendingFile(i)} className="text-muted-foreground hover:text-foreground transition">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Input */}
                  <div className="border-t border-border/50 px-3 py-2.5 shrink-0">
                    <div className="flex items-end gap-2">
                      {/* Attach */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/40 text-muted-foreground transition hover:text-foreground hover:border-border"
                        title="Attach file"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" className="hidden" onChange={handleFileChange} />

                      <div className="flex-1 relative">
                        <textarea
                          ref={inputRef}
                          value={draft}
                          onChange={(e) => handleDraftChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (mentionQuery !== null && mentionMatches.length > 0) {
                              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, Math.min(4, mentionMatches.length - 1))); return; }
                              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
                              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIndex]?.email ?? mentionMatches[0].email); return; }
                              if (e.key === 'Escape') { setMentionQuery(null); return; }
                            }
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                          }}
                          placeholder="Message everyone… (@ to mention)"
                          rows={1}
                          className="w-full resize-none rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition max-h-28 leading-relaxed pr-8"
                          style={{ scrollbarWidth: 'none' }}
                          onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 112) + 'px'; }}
                        />
                        <button type="button" onMouseDown={(e) => { e.preventDefault(); handleDraftChange(draft + '@'); inputRef.current?.focus(); }} className="absolute right-2 bottom-2 text-muted-foreground/40 hover:text-primary/70 transition" title="Mention">
                          <AtSign className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={(!draft.trim() && pendingFiles.length === 0) || sending}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-primary/25"
                      >
                        {(sending || uploading) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="mt-1 text-[9px] text-muted-foreground/30 text-center">Enter to send · Shift+Enter for new line · @ to mention</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
