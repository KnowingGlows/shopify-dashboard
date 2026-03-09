'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'boot' | 'load' | 'fade' | 'done'>('boot');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('load'), 100),
      setTimeout(() => setPhase('fade'), 1100),
      setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (phase === 'done') return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#09090b] transition-opacity duration-400',
        phase === 'fade' ? 'opacity-0' : 'opacity-100'
      )}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(167,139,250,0.12)_0%,transparent_60%)]" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 8 }}
        animate={phase !== 'boot' ? { opacity: 1, scale: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col items-center gap-5"
      >
        {/* Icon */}
        <motion.div
          initial={{ boxShadow: '0 0 0px rgba(167,139,250,0)' }}
          animate={phase !== 'boot' ? { boxShadow: '0 0 40px rgba(167,139,250,0.25)' } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/20"
        >
          <Zap className="h-7 w-7" />
        </motion.div>

        {/* Text */}
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-[0.15em] text-foreground">Orbit</h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={phase !== 'boot' ? { opacity: 1 } : {}}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="mt-1.5 text-[11px] text-muted-foreground/70"
          >
            Loading workspace...
          </motion.p>
        </div>

        {/* Progress bar */}
        <div className="h-[2px] w-36 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: '0%' }}
            animate={phase !== 'boot' ? { width: '100%' } : {}}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/40"
          />
        </div>
      </motion.div>
    </div>
  );
}
