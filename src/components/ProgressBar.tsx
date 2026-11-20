import React from 'react';

interface ProgressBarProps {
  value: number;
  size?: 'sm' | 'md';
  variant?: 'default' | 'danger';
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  size = 'sm',
  variant = 'default',
  label,
}) => {
  const progress = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className={`progress-track w-full overflow-hidden rounded-full ${size === 'md' ? 'h-3' : 'h-1.5'}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          variant === 'danger' ? 'progress-fill-danger' : 'progress-fill'
        }`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};
