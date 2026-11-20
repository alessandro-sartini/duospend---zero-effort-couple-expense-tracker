import React from 'react';
import { getCategoryMeta } from '../../constants/categories';

interface CategoryBadgeProps {
  category: string;
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
  size = 'md',
  showLabel = false,
  className = '',
}) => {
  const meta = getCategoryMeta(category);
  const Icon = meta.icon;

  if (showLabel) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${meta.bgClass} ${meta.textClass} ${meta.borderClass} ${className}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{category}</span>
      </span>
    );
  }

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center border ${BOX_SIZES[size]} ${meta.bgClass} ${meta.textClass} ${meta.borderClass} ${className}`}
      title={category}
      aria-hidden="true"
    >
      <Icon className={ICON_SIZES[size]} />
    </div>
  );
};
