import React from 'react';
import { SOURCE_META } from '../../constants/categories';
import type { Expense } from '../../types';

interface SourceBadgeProps {
  source: Expense['source'];
  compact?: boolean;
  className?: string;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({
  source,
  compact = false,
  className = '',
}) => {
  const meta = SOURCE_META[source] || SOURCE_META.manual;
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeClass} ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </span>
  );
};
