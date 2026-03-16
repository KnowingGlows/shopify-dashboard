'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function formatDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00+05:30');
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Mon=0, Sun=6
}

interface DatePickerProps {
  value: string;           // YYYY-MM-DD
  onChange: (date: string) => void;
  max?: string;            // YYYY-MM-DD
  min?: string;            // YYYY-MM-DD
  placeholder?: string;
  className?: string;
  compact?: boolean;       // smaller variant
}

export function DatePicker({ value, onChange, max, min, placeholder = 'Select date', className, compact }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Parse current value or default to today
  const today = todayIST();
  const [viewYear, setViewYear] = useState(() => {
    const d = value || today;
    return parseInt(d.split('-')[0]);
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value || today;
    return parseInt(d.split('-')[1]) - 1;
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Sync view when value changes
  useEffect(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [value]);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }, [viewMonth]);

  const selectDate = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(dateStr);
    setOpen(false);
  };

  const isDisabled = (day: number): boolean => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (max && dateStr > max) return true;
    if (min && dateStr < min) return true;
    return false;
  };

  const isSelected = (day: number): boolean => {
    if (!value) return false;
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr === value;
  };

  const isToday = (day: number): boolean => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr === today;
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border bg-card/60 text-foreground backdrop-blur-sm transition hover:bg-card/80',
          compact ? 'px-2.5 py-1.5 text-[12px]' : 'px-3 py-2 text-sm',
          !value && 'text-muted-foreground',
        )}
      >
        <Calendar className={cn('text-muted-foreground', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        {value ? formatDisplay(value) : placeholder}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-[280px] rounded-xl border border-border bg-[#0c0c0e] p-3 shadow-2xl"
          >
            {/* Month/Year Header */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-foreground">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-[10px] font-medium text-muted-foreground/50 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day Grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {/* Empty cells for offset */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const disabled = isDisabled(day);
                const selected = isSelected(day);
                const todayMark = isToday(day);

                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectDate(day)}
                    className={cn(
                      'relative h-9 w-full rounded-lg text-[13px] font-medium transition',
                      disabled
                        ? 'text-muted-foreground/20 cursor-not-allowed'
                        : selected
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                        : todayMark
                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                        : 'text-foreground hover:bg-white/5',
                    )}
                  >
                    {day}
                    {todayMark && !selected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-border/50">
              <button
                type="button"
                onClick={() => { onChange(today); setOpen(false); }}
                className="flex-1 rounded-lg bg-white/5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              >
                Today
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(value + 'T00:00:00+05:30');
                    d.setDate(d.getDate() - 1);
                    const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    if (!min || prev >= min) onChange(prev);
                  }}
                  className="flex-1 rounded-lg bg-white/5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                >
                  Yesterday
                </button>
              )}
              {value && (
                <button
                  type="button"
                  onClick={() => { onChange(''); setOpen(false); }}
                  className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground/50 transition hover:bg-white/10 hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
