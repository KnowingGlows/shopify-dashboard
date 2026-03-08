'use client';

import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  description?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export function StatsCard({ title, value, icon: Icon, description, trend }: StatsCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {description && (
        <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
      )}
      {trend && (
        <p className={`mt-1 text-[11px] font-medium ${trend.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {trend.value}
        </p>
      )}
    </div>
  );
}
