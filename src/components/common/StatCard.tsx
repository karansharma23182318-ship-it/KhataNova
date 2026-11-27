import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  icon: LucideIcon;
  tone?: 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose';
}

const toneClasses: Record<NonNullable<StatCardProps['tone']>, string> = {
  blue: 'text-blue-400 bg-blue-500/10 border-blue-400/20',
  cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-400/20',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-400/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-400/20',
  rose: 'text-rose-400 bg-rose-500/10 border-rose-400/20',
};

export function StatCard({ label, value, subtext, icon: Icon, tone = 'blue' }: StatCardProps) {
  return (
    <div className="glass-surface rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400/35">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs sm:text-sm font-medium text-slate-400 leading-snug">{label}</span>
        <span className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${toneClasses[tone]}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div>
        <div className="text-xl sm:text-2xl font-bold text-white font-mono-num tabular-nums tracking-tight">
          {value}
        </div>
        {subtext ? <p className="mt-1 text-xs text-slate-400">{subtext}</p> : null}
      </div>
    </div>
  );
}
