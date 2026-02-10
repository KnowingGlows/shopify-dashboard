'use client';

import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

// ─── Vault Unlock Splash ─────────────────────────────────────────────────────
// Phases: boot → scan → spin → unlock → open → done

// Deterministic pseudo-random using a seed so SSR matches client
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'boot' | 'scan' | 'spin' | 'unlock' | 'open' | 'done'>('boot');

  // Stable particle positions (generated once, deterministic)
  const particles = useMemo(() => {
    const rng = seededRandom(42);
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: rng() * 100,
      y: rng() * 100,
      size: 1 + rng() * 2,
      delay: rng() * 1500,
      duration: 2000 + rng() * 3000,
    }));
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('scan'), 400),
      setTimeout(() => setPhase('spin'), 1000),
      setTimeout(() => setPhase('unlock'), 1900),
      setTimeout(() => setPhase('open'), 2700),
      setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 3300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (phase === 'done') return null;

  const phaseIndex = ['boot', 'scan', 'spin', 'unlock', 'open'].indexOf(phase);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#060a12] transition-opacity duration-500',
        phase === 'open' ? 'opacity-0' : 'opacity-100'
      )}
    >
      {/* ── Background grid ── */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 transition-opacity duration-700',
          phaseIndex >= 1 ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          backgroundImage:
            'linear-gradient(rgba(34,211,238,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* ── Floating particles ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <div
            key={p.id}
            className={cn(
              'absolute rounded-full bg-cyan-400 transition-opacity duration-1000',
              phaseIndex >= 1 ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              transitionDelay: `${p.delay}ms`,
              animation: phaseIndex >= 1
                ? `splashFloat ${p.duration}ms ease-in-out ${p.delay}ms infinite alternate`
                : 'none',
            }}
          />
        ))}
      </div>

      {/* ── Radial glow (builds up) ── */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 transition-opacity duration-1000',
          phaseIndex >= 2 ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          background:
            'radial-gradient(circle at center, rgba(34,211,238,0.08) 0%, rgba(34,211,238,0.03) 30%, transparent 60%)',
        }}
      />

      {/* ── Horizontal scanline ── */}
      <div
        className={cn(
          'pointer-events-none absolute left-0 right-0 h-[2px] transition-opacity duration-300',
          phase === 'scan' || phase === 'spin' ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.5), transparent)',
          animation: phase === 'scan' || phase === 'spin'
            ? 'splashScanline 1.2s ease-in-out forwards'
            : 'none',
        }}
      />

      {/* ── Vault mechanism ── */}
      <div
        className={cn(
          'relative flex h-44 w-44 items-center justify-center transition-all duration-700',
          phaseIndex >= 1 ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
        )}
      >
        {/* Outer ring - 24 tick marks */}
        <svg
          viewBox="0 0 176 176"
          className={cn(
            'absolute inset-0 h-full w-full transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
            phaseIndex >= 2 ? 'rotate-[135deg]' : 'rotate-0'
          )}
        >
          <circle
            cx="88" cy="88" r="82"
            fill="none"
            stroke="rgba(34,211,238,0.12)"
            strokeWidth="1.5"
          />
          {Array.from({ length: 36 }).map((_, i) => {
            const a = (i * 10 * Math.PI) / 180;
            const major = i % 9 === 0;
            const r1 = major ? 72 : 76;
            return (
              <line
                key={i}
                x1={88 + r1 * Math.cos(a)}
                y1={88 + r1 * Math.sin(a)}
                x2={88 + 82 * Math.cos(a)}
                y2={88 + 82 * Math.sin(a)}
                stroke={major ? 'rgba(34,211,238,0.5)' : 'rgba(34,211,238,0.12)'}
                strokeWidth={major ? '2' : '1'}
              />
            );
          })}
        </svg>

        {/* Second ring - dashed, counter-rotates */}
        <svg
          viewBox="0 0 176 176"
          className={cn(
            'absolute inset-0 h-full w-full transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-75',
            phaseIndex >= 2 ? '-rotate-[100deg]' : 'rotate-0'
          )}
        >
          <circle
            cx="88" cy="88" r="64"
            fill="none"
            stroke="rgba(34,211,238,0.18)"
            strokeWidth="1"
            strokeDasharray="3 7"
          />
        </svg>

        {/* Third ring */}
        <svg
          viewBox="0 0 176 176"
          className={cn(
            'absolute inset-0 h-full w-full transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] delay-150',
            phaseIndex >= 2 ? 'rotate-[55deg]' : 'rotate-0'
          )}
        >
          <circle
            cx="88" cy="88" r="48"
            fill="none"
            stroke="rgba(34,211,238,0.22)"
            strokeWidth="1.5"
          />
        </svg>

        {/* Arc sweep that traces around during spin phase */}
        <svg
          viewBox="0 0 176 176"
          className={cn(
            'absolute inset-0 h-full w-full transition-opacity duration-300',
            phase === 'spin' ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            animation: phase === 'spin' ? 'splashArcSpin 0.9s linear forwards' : 'none',
          }}
        >
          <circle
            cx="88" cy="88" r="74"
            fill="none"
            stroke="rgba(34,211,238,0.6)"
            strokeWidth="2"
            strokeDasharray="40 425"
            strokeLinecap="round"
          />
        </svg>

        {/* Tumbler dots - 3 that click into place */}
        {[0, 1, 2].map((i) => {
          const angle = [0, 120, 240][i];
          const rad = (angle * Math.PI) / 180;
          const x = 88 + 64 * Math.cos(rad);
          const y = 88 + 64 * Math.sin(rad);
          const active = phaseIndex >= 3;

          return (
            <svg key={i} viewBox="0 0 176 176" className="absolute inset-0 h-full w-full">
              <circle
                cx={x} cy={y} r="5"
                className={cn('transition-all duration-300', active ? 'fill-cyan-400' : 'fill-cyan-400/15')}
                style={{ transitionDelay: `${i * 150}ms` }}
              />
              {active && (
                <>
                  <circle
                    cx={x} cy={y} r="9"
                    fill="none" stroke="rgba(34,211,238,0.35)" strokeWidth="1"
                    className="animate-ping"
                    style={{ animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
                  />
                  {/* Connecting line from tumbler to center */}
                  <line
                    x1={x} y1={y} x2={88} y2={88}
                    stroke="rgba(34,211,238,0.1)" strokeWidth="1"
                    className={cn('transition-opacity duration-500', active ? 'opacity-100' : 'opacity-0')}
                    style={{ transitionDelay: `${200 + i * 150}ms` }}
                  />
                </>
              )}
            </svg>
          );
        })}

        {/* Center V monogram */}
        <div
          className={cn(
            'relative z-10 flex h-18 w-18 items-center justify-center rounded-full border-2 transition-all duration-600',
            phaseIndex >= 3
              ? 'border-cyan-400/70 bg-cyan-400/10 shadow-[0_0_40px_rgba(34,211,238,0.35),0_0_80px_rgba(34,211,238,0.15)]'
              : phaseIndex >= 1
                ? 'border-cyan-400/20 bg-cyan-400/5 shadow-none'
                : 'border-transparent bg-transparent'
          )}
          style={{ width: 72, height: 72 }}
        >
          <span
            className={cn(
              'text-3xl font-bold tracking-wider transition-all duration-500 select-none',
              phaseIndex >= 3 ? 'text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.6)]' : 'text-cyan-400/30'
            )}
          >
            V
          </span>
        </div>
      </div>

      {/* ── Text block ── */}
      <div className="mt-10 flex flex-col items-center gap-3">
        <h1
          className={cn(
            'text-xl font-semibold tracking-[0.4em] uppercase transition-all duration-600',
            phaseIndex >= 2 ? 'text-foreground translate-y-0 opacity-100' : 'text-foreground/0 translate-y-2 opacity-0'
          )}
        >
          Vaultik
        </h1>

        {/* Animated status line */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-all duration-300',
              phaseIndex >= 3
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                : phaseIndex >= 1
                  ? 'bg-cyan-400/50 animate-pulse'
                  : 'bg-transparent'
            )}
          />
          <p
            className={cn(
              'text-[10px] uppercase tracking-[0.3em] transition-all duration-400',
              phaseIndex >= 3 ? 'text-emerald-400/80' : phaseIndex >= 1 ? 'text-cyan-400/50' : 'text-transparent'
            )}
          >
            {phase === 'boot'
              ? ''
              : phase === 'scan'
                ? 'Establishing secure link...'
                : phase === 'spin'
                  ? 'Authenticating...'
                  : phase === 'unlock'
                    ? 'Access granted'
                    : 'Welcome back'}
          </p>
        </div>

        {/* Progress bar */}
        <div
          className={cn(
            'h-[2px] w-48 overflow-hidden rounded-full bg-white/5 transition-opacity duration-500',
            phaseIndex >= 1 ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400/80 to-emerald-400/80 transition-all ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              width:
                phase === 'boot' ? '0%'
                  : phase === 'scan' ? '20%'
                    : phase === 'spin' ? '55%'
                      : phase === 'unlock' ? '100%'
                        : '100%',
              transitionDuration: phase === 'scan' ? '600ms' : phase === 'spin' ? '900ms' : '500ms',
            }}
          />
        </div>
      </div>

      {/* Inline keyframes */}
      <style jsx>{`
        @keyframes splashFloat {
          from { transform: translateY(0px) scale(1); opacity: 0.3; }
          to { transform: translateY(-8px) scale(1.5); opacity: 0.08; }
        }
        @keyframes splashScanline {
          0% { top: -2px; }
          100% { top: 100%; }
        }
        @keyframes splashArcSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
