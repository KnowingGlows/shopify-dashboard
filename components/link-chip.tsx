'use client';

import { useState } from 'react';
import { ExternalLink, Link2, X, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LinkChipProps {
  value: string;
  onChange: (val: string) => void;
  onBlur?: (val: string) => void;
  placeholder?: string;
  label?: string;
}

function getDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    if (host.includes('drive.google.com')) return 'Google Drive';
    if (host.includes('docs.google.com')) return 'Google Docs';
    if (host.includes('sheets.google.com')) return 'Google Sheets';
    if (host.includes('figma.com')) return 'Figma';
    if (host.includes('notion.so') || host.includes('notion.site')) return 'Notion';
    if (host.includes('canva.com')) return 'Canva';
    if (host.includes('github.com')) return 'GitHub';
    // Return shortened domain
    const parts = host.split('.');
    return parts.length > 2 ? parts.slice(-2).join('.') : host;
  } catch {
    return 'Link';
  }
}

export function LinkChip({ value, onChange, onBlur, placeholder = 'https://...' }: LinkChipProps) {
  const [editing, setEditing] = useState(false);

  const isValidUrl = value && (value.startsWith('http://') || value.startsWith('https://'));

  if (isValidUrl && !editing) {
    const domain = getDomain(value);
    return (
      <div className="flex items-center gap-1.5">
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[12px] font-medium text-primary transition-all hover:border-primary/40 hover:bg-primary/10 hover:shadow-[0_0_12px_rgba(167,139,250,0.15)]"
        >
          <Link2 className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 transition" />
          <span className="max-w-[160px] truncate">{domain}</span>
          <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-40 group-hover:opacity-80 transition" />
        </a>
        <button
          onClick={() => setEditing(true)}
          className="rounded-md p-1 text-muted-foreground/30 hover:text-muted-foreground transition"
          title="Edit link"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            onChange('');
            onBlur?.('');
          }}
          className="rounded-md p-1 text-muted-foreground/30 hover:text-red-400 transition"
          title="Remove link"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        onBlur?.(e.target.value);
        if (e.target.value && (e.target.value.startsWith('http://') || e.target.value.startsWith('https://'))) {
          setEditing(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value && (value.startsWith('http://') || value.startsWith('https://'))) {
          setEditing(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className="form-input"
      autoFocus={editing}
    />
  );
}
