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
  iconClassName = 'text-orange-600',
  valueClassName = 'text-stone-900',
  variant = 'card',
  className = '',
}) => {
  const containerClass = variant === 'subcard' ? 'ds-subcard p-3.5 sm:p-4' : 'ds-card p-4';
  const iconColorClass =
    iconClassName.split(/\s+/).find((cls) => cls.startsWith('text-')) ?? 'text-orange-600';

  return (
    <div className={`${containerClass} flex flex-col justify-between gap-1.5 min-w-0 ${className}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {Icon && (
          <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColorClass}`} aria-hidden="true" />
        )}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 truncate">
          {label}
        </span>
      </div>

      <div className={`text-lg sm:text-xl font-bold font-mono tabular-nums tracking-tight ${valueClassName}`}>
        {value}
      </div>

      {subtitle && (
        <div className="text-xs text-stone-500 leading-relaxed">{subtitle}</div>
      )}
    </div>
  );
};
