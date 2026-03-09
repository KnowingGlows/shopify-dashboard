'use client';

import { motion, type Variants } from 'framer-motion';

interface OrbytLogoProps {
  className?: string;
  size?: number;
  animate?: boolean;
}

export function OrbytLogo({ className = '', size = 24, animate = true }: OrbytLogoProps) {
  const pathVariants: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => ({
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { duration: 1.2, delay: i * 0.2 },
        opacity: { duration: 0.3, delay: i * 0.2 },
      },
    }),
  };

  const circleVariants: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: (i: number) => ({
      scale: 1,
      opacity: 1,
      transition: {
        duration: 0.4,
        delay: 0.6 + i * 0.15,
        type: 'spring',
        stiffness: 300,
        damping: 20,
      },
    }),
  };

  if (!animate) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        className={className}
      >
        <path d="M 30 15 A 38 38 0 0 0 20 72" stroke="currentColor" strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M 70 85 A 38 38 0 0 0 80 28" stroke="currentColor" strokeWidth="8" strokeLinecap="round" fill="none" />
        <circle cx="50" cy="50" r="14" stroke="currentColor" strokeWidth="8" fill="none" />
        <circle cx="50" cy="50" r="5" fill="currentColor" />
        <circle cx="80" cy="25" r="6" fill="currentColor" />
        <circle cx="20" cy="75" r="5" fill="currentColor" />
      </svg>
    );
  }

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      initial="hidden"
      animate="visible"
    >
      <motion.path
        d="M 30 15 A 38 38 0 0 0 20 72"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
        variants={pathVariants}
        custom={0}
      />
      <motion.path
        d="M 70 85 A 38 38 0 0 0 80 28"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
        variants={pathVariants}
        custom={1}
      />
      <motion.circle
        cx="50"
        cy="50"
        r="14"
        stroke="currentColor"
        strokeWidth="8"
        fill="none"
        variants={pathVariants}
        custom={0.5}
      />
      <motion.circle cx="50" cy="50" r="5" fill="currentColor" variants={circleVariants} custom={0} />
      <motion.circle cx="80" cy="25" r="6" fill="currentColor" variants={circleVariants} custom={1} />
      <motion.circle cx="20" cy="75" r="5" fill="currentColor" variants={circleVariants} custom={2} />
    </motion.svg>
  );
}
