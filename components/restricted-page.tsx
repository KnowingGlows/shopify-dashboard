'use client';

import { useEffect, useState } from 'react';
import { ShieldOff } from 'lucide-react';

const glitchMessages = [
  'SECTOR LOCKED',
  'CLEARANCE DENIED',
  'VAULT SEALED',
  'ACCESS RESTRICTED',
  'ZONE OFFLINE',
];

const matrixChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&';

function useGlitchText(finalText: string, duration = 1500) {
  const [text, setText] = useState('');

  useEffect(() => {
    const len = finalText.length;
    const interval = duration / (len * 3);
    let iteration = 0;

    const timer = setInterval(() => {
      setText(
        finalText
          .split('')
          .map((char, i) => {
            if (i < iteration / 3) return char;
            return matrixChars[Math.floor(Math.random() * matrixChars.length)];
          })
          .join('')
      );
      iteration++;
      if (iteration > len * 3) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, [finalText, duration]);

  return text;
}

export function RestrictedPage() {
  const [msgIndex] = useState(() => Math.floor(Math.random() * glitchMessages.length));
  const glitchedTitle = useGlitchText(glitchMessages[msgIndex], 1200);
  const [scanline, setScanline] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setScanline((p) => (p + 1) % 100);
    }, 30);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative flex min-h-[80vh] items-center justify-center overflow-hidden">
      {/* Animated grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(rgba(239,68,68,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.06) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
        }}
      />

      {/* Red radial pulse */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.08)_0%,transparent_60%)] motion-safe:animate-pulse" />

      {/* Scanline */}
      <div
        className="pointer-events-none absolute left-0 right-0 h-[2px] bg-red-500/20"
        style={{ top: `${scanline}%`, transition: 'none' }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-4 text-center">
        {/* Glitching shield icon */}
        <div className="relative">
          <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-red-500/30 bg-red-500/5 shadow-[0_0_60px_rgba(239,68,68,0.15),inset_0_0_30px_rgba(239,68,68,0.05)]">
            <ShieldOff className="h-14 w-14 text-red-500/70" />
          </div>
          {/* Glitch copies */}
          <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-30 motion-safe:animate-[glitchShift_3s_ease-in-out_infinite]">
            <ShieldOff className="h-14 w-14 text-cyan-400" />
          </div>
          {/* Rotating ring */}
          <div className="absolute -inset-3 rounded-full border border-dashed border-red-500/20 motion-safe:animate-[spin_20s_linear_infinite]" />
          <div className="absolute -inset-6 rounded-full border border-dotted border-red-500/10 motion-safe:animate-[spin_30s_linear_infinite_reverse]" />
        </div>

        {/* Glitch title */}
        <div className="relative">
          <h1 className="font-mono text-3xl font-black tracking-[0.3em] text-red-500/90 sm:text-4xl">
            {glitchedTitle}
          </h1>
          {/* Glitch layers */}
          <h1
            className="absolute inset-0 font-mono text-3xl font-black tracking-[0.3em] text-cyan-400/40 sm:text-4xl motion-safe:animate-[glitchShift_2s_ease-in-out_infinite]"
            aria-hidden
          >
            {glitchedTitle}
          </h1>
          <h1
            className="absolute inset-0 font-mono text-3xl font-black tracking-[0.3em] text-red-400/30 sm:text-4xl motion-safe:animate-[glitchShift2_2.5s_ease-in-out_infinite]"
            aria-hidden
          >
            {glitchedTitle}
          </h1>
        </div>

        {/* Subtitle */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">
            You don&apos;t have clearance for this sector.
          </p>
          <div className="flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/5 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-red-500 motion-safe:animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-400/80">
              Contact your admin to unlock
            </span>
          </div>
        </div>

        {/* Fake terminal log */}
        <div className="w-full max-w-sm rounded-2xl border border-border/30 bg-black/40 p-4 text-left font-mono text-[11px] leading-relaxed text-muted-foreground/60 backdrop-blur">
          <p><span className="text-red-400">$</span> vault access --sector=current</p>
          <p className="text-red-400/70">ERR: permission_denied</p>
          <p><span className="text-red-400">$</span> vault status</p>
          <p>user: authenticated</p>
          <p>clearance: <span className="text-red-400">insufficient</span></p>
          <p className="text-muted-foreground/30">───────────────────────────</p>
          <p className="motion-safe:animate-pulse">
            <span className="text-cyan-400">_</span> awaiting admin override...
          </p>
        </div>
      </div>

      {/* CSS keyframes */}
      <style jsx>{`
        @keyframes glitchShift {
          0%, 100% { transform: translate(0); clip-path: inset(0); }
          20% { transform: translate(-2px, 1px); clip-path: inset(20% 0 60% 0); }
          40% { transform: translate(2px, -1px); clip-path: inset(50% 0 20% 0); }
          60% { transform: translate(-1px, 2px); clip-path: inset(10% 0 70% 0); }
          80% { transform: translate(1px, -2px); clip-path: inset(60% 0 10% 0); }
        }
        @keyframes glitchShift2 {
          0%, 100% { transform: translate(0); clip-path: inset(0); }
          25% { transform: translate(3px, -1px); clip-path: inset(30% 0 40% 0); }
          50% { transform: translate(-2px, 2px); clip-path: inset(60% 0 10% 0); }
          75% { transform: translate(1px, -3px); clip-path: inset(10% 0 50% 0); }
        }
      `}</style>
    </div>
  );
}
