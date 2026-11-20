import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  valueClassName?: string;
  variant?: 'card' | 'subcard';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  icon: Icon,
  iconClassName = 'bg-orange-500/12 text-orange-600 border-orange-500/25',
  valueClassName = 'text-stone-900',
  variant = 'card',
  className = '',
}) => {
  const containerClass = variant === 'subcard' ? 'ds-subcard p-4' : 'ds-card p-5';

  return (
    <div className={`${containerClass} flex flex-col justify-between gap-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          {label}
        </span>
        {Icon && (
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${iconClassName}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      <div className={`text-xl sm:text-2xl font-bold font-mono tabular-nums tracking-tight ${valueClassName}`}>
        {value}
      </div>

      {subtitle && (
        <div className="text-xs text-stone-500 leading-relaxed">{subtitle}</div>
      )}
    </div>
  );
};
