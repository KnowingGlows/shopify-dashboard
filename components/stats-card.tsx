'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="group relative overflow-hidden border-border/60 bg-card/70 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_-30px_rgba(34,211,238,0.6)]">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-[0_0_20px_rgba(34,211,238,0.35)]">
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
        {description && (
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-2">
            {description}
          </p>
        )}
        {trend && (
          <div className="mt-3 flex items-center">
            <span
              className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trend.value}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
