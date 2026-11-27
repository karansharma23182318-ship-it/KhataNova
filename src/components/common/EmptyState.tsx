import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="glass-surface rounded-3xl p-8 sm:p-10 text-center flex flex-col items-center justify-center gap-3">
      <div className="w-14 h-14 rounded-3xl bg-blue-500/12 border border-blue-400/25 flex items-center justify-center text-cyan-400">
        <Icon className="w-6 h-6" />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-base font-semibold text-white font-display">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-950/40 whitespace-nowrap shrink-0"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
