import React from 'react';
import { getCategoryMeta } from '../../constants/categories';
import type { SavingGoal } from '../../types';

interface CategoryBadgeProps {
  category: string;
  goals?: SavingGoal[];
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const BOX_SIZES = {
  sm: 'h-7 w-7 rounded-lg',
  md: 'h-9 w-9 rounded-xl',
  lg: 'h-10 w-10 rounded-xl',
};

const ICON_SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  category,
  goals,
  size = 'md',
  showLabel = false,
  className = '',
}) => {
  const meta = getCategoryMeta(category, goals);
  const Icon = meta.icon;
  const hasExplicitDisplay = /(?:^|\s)(hidden|block|inline|inline-block|flex|inline-flex|grid|inline-grid)\b/.test(
    className
  );
  const displayClass = hasExplicitDisplay ? '' : 'inline-flex';

  if (showLabel) {
    return (
      <span
        className={`${displayClass} items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass} ${className}`.trim()}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{category}</span>
      </span>
    );
  }

  return (
    <div
      className={`${displayClass} shrink-0 items-center justify-center border ${BOX_SIZES[size]} ${meta.bgClass} ${meta.textClass} ${meta.borderClass} ${className}`.trim()}
      title={category}
      aria-hidden="true"
    >
      <Icon className={ICON_SIZES[size]} />
    </div>
  );
};
