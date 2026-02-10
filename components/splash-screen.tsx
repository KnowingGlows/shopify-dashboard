'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// ─── Concept 1: Vault Unlock ─────────────────────────────────────────────────
// A circular vault door rotates, tumblers click in, door opens revealing the app.

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'spin' | 'unlock' | 'open' | 'done'>('spin');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('unlock'), 800);
    const t2 = setTimeout(() => setPhase('open'), 1600);
    const t3 = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  if (phase === 'done') return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0e17] transition-opacity duration-500',
        phase === 'open' ? 'opacity-0' : 'opacity-100'
      )}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.06)_0%,transparent_60%)]" />

      {/* Vault mechanism */}
      <div className="relative flex h-40 w-40 items-center justify-center">
        {/* Outer ring */}
        <svg
          viewBox="0 0 160 160"
          className={cn(
            'absolute inset-0 h-full w-full transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
            phase === 'spin' ? 'rotate-0' : 'rotate-[135deg]'
          )}
        >
          <circle
            cx="80"
            cy="80"
            r="74"
            fill="none"
            stroke="rgba(34,211,238,0.15)"
            strokeWidth="1.5"
          />
          {/* Tick marks around the ring */}
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 15 * Math.PI) / 180;
            const r1 = 68;
            const r2 = 74;
            return (
              <line
                key={i}
                x1={80 + r1 * Math.cos(angle)}
                y1={80 + r1 * Math.sin(angle)}
                x2={80 + r2 * Math.cos(angle)}
                y2={80 + r2 * Math.sin(angle)}
                stroke={i % 6 === 0 ? 'rgba(34,211,238,0.5)' : 'rgba(34,211,238,0.15)'}
                strokeWidth={i % 6 === 0 ? '2' : '1'}
              />
            );
          })}
        </svg>

        {/* Middle ring */}
        <svg
          viewBox="0 0 160 160"
          className={cn(
            'absolute inset-0 h-full w-full transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-100',
            phase === 'spin' ? 'rotate-0' : '-rotate-[90deg]'
          )}
        >
          <circle
            cx="80"
            cy="80"
            r="56"
            fill="none"
            stroke="rgba(34,211,238,0.2)"
            strokeWidth="1"
            strokeDasharray="4 8"
          />
        </svg>

        {/* Inner ring */}
        <svg
          viewBox="0 0 160 160"
          className={cn(
            'absolute inset-0 h-full w-full transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-200',
            phase === 'spin' ? 'rotate-0' : 'rotate-[60deg]'
          )}
        >
          <circle
            cx="80"
            cy="80"
            r="40"
            fill="none"
            stroke="rgba(34,211,238,0.25)"
            strokeWidth="1.5"
          />
        </svg>

        {/* Tumbler dots - 3 that "click" into place */}
        {[0, 1, 2].map((i) => {
          const angles = [0, 120, 240];
          const radius = 56;
          const baseAngle = angles[i];
          const unlocked = phase !== 'spin';
          const targetAngle = baseAngle;
          const rad = (targetAngle * Math.PI) / 180;
          const x = 80 + radius * Math.cos(rad);
          const y = 80 + radius * Math.sin(rad);

          return (
            <svg key={i} viewBox="0 0 160 160" className="absolute inset-0 h-full w-full">
              <circle
                cx={x}
                cy={y}
                r="4"
                className={cn(
                  'transition-all duration-300',
                  unlocked ? 'fill-cyan-400' : 'fill-cyan-400/20'
                )}
                style={{ transitionDelay: `${300 + i * 200}ms` }}
              />
              {unlocked && (
                <circle
                  cx={x}
                  cy={y}
                  r="7"
                  fill="none"
                  stroke="rgba(34,211,238,0.4)"
                  strokeWidth="1"
                  className="animate-ping"
                  style={{ animationDelay: `${400 + i * 200}ms`, animationDuration: '1s' }}
                />
              )}
            </svg>
          );
        })}

        {/* Center keyhole / V monogram */}
        <div
          className={cn(
            'relative z-10 flex h-16 w-16 items-center justify-center rounded-full border transition-all duration-500',
            phase === 'unlock' || phase === 'open'
              ? 'border-cyan-400/60 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,0.3)]'
              : 'border-cyan-400/20 bg-cyan-400/5'
          )}
        >
          <span
            className={cn(
              'text-2xl font-bold tracking-wider transition-all duration-500',
              phase === 'unlock' || phase === 'open'
                ? 'text-cyan-400'
                : 'text-cyan-400/40'
            )}
          >
            V
          </span>
        </div>
      </div>

      {/* Text */}
      <div className="mt-8 flex flex-col items-center gap-2">
        <h1
          className={cn(
            'text-lg font-semibold tracking-[0.35em] uppercase transition-all duration-500',
            phase !== 'spin' ? 'text-foreground' : 'text-foreground/40'
          )}
        >
          Vaultik
        </h1>
        <p
          className={cn(
            'text-[10px] uppercase tracking-[0.3em] transition-all duration-500',
            phase === 'unlock' ? 'text-cyan-400/70' : 'text-muted-foreground/40'
          )}
        >
          {phase === 'spin' ? 'Initializing...' : phase === 'unlock' ? 'Access granted' : 'Entering...'}
        </p>
      </div>
    </div>
  );
}
