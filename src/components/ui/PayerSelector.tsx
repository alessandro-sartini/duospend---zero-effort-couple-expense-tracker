import React from 'react';
import type { CoupleProfile, Payer } from '../../types';

interface PayerSelectorProps {
  value: Payer;
  onChange: (payer: Payer) => void;
  profile: CoupleProfile;
  size?: 'sm' | 'md';
  showSelfHint?: boolean;
  className?: string;
}

export const PayerSelector: React.FC<PayerSelectorProps> = ({
  value,
  onChange,
  profile,
  size = 'md',
  showSelfHint = true,
  className = '',
}) => {
  const heightClass = size === 'sm' ? 'min-h-9 py-1.5 px-2.5 text-[11px]' : 'min-h-11 py-2 px-3 text-xs';

  return (
    <div
      className={`ds-nav-track grid grid-cols-2 gap-1 rounded-xl border border-stone-200/70 p-1 ${className}`}
      role="group"
      aria-label="Seleziona chi ha pagato"
    >
      <button
        type="button"
        onClick={() => onChange('user')}
        aria-pressed={value === 'user'}
        className={`${heightClass} truncate rounded-lg font-semibold transition-all cursor-pointer ${
          value === 'user'
            ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-orange-500/30'
            : 'text-stone-600 hover:text-stone-900'
        }`}
      >
        {profile.userName}
        {showSelfHint ? ' (Tu)' : ''}
      </button>
      <button
        type="button"
        onClick={() => onChange('partner')}
        aria-pressed={value === 'partner'}
        className={`${heightClass} truncate rounded-lg font-semibold transition-all cursor-pointer ${
          value === 'partner'
            ? 'ds-nav-pill-active text-stone-900 shadow-xs border border-orange-500/30'
            : 'text-stone-600 hover:text-stone-900'
        }`}
      >
        {profile.partnerName}
      </button>
    </div>
  );
};
