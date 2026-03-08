'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'boot' | 'load' | 'fade' | 'done'>('boot');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('load'), 100),
      setTimeout(() => setPhase('fade'), 900),
      setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 1200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (phase === 'done') return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#09090b] transition-opacity duration-300',
        phase === 'fade' ? 'opacity-0' : 'opacity-100'
      )}
    >
      <div className={cn(
        'flex flex-col items-center gap-4 transition-all duration-400',
        phase !== 'boot' ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      )}>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Zap className="h-6 w-6" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-wide text-foreground">Vaultik</h1>
          <p className="mt-1 text-[11px] text-muted-foreground">Loading workspace...</p>
        </div>
        <div className="h-[2px] w-32 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-primary/60 transition-all duration-700 ease-out"
            style={{ width: phase !== 'boot' ? '100%' : '0%' }}
          />
        </div>
      </div>
    </div>
  );
}
