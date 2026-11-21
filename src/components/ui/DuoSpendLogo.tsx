import React, { useId } from 'react';

type LogoVariant = 'mark' | 'full' | 'monochrome' | 'loader';
type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface DuoSpendLogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
  title?: string;
}

const ICON_PX: Record<LogoSize, number> = {
  xs: 20,
  sm: 36,
  md: 40,
  lg: 48,
  xl: 64,
};

const WORDMARK_CLASS: Record<LogoSize, string> = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
  xl: 'text-2xl',
};

const HEART_PATH =
  'M 256 168 C 234 152 218 139 218 122 A 20 20 0 0 1 256 113 A 20 20 0 0 1 294 122 C 294 139 278 152 256 168 Z';

export const DuoSpendLogo: React.FC<DuoSpendLogoProps> = ({
  variant = 'mark',
  size = 'md',
  className = '',
  title,
}) => {
  const uid = useId().replace(/:/g, '');
  const bgGradId = `ds-bg-${uid}`;
  const glowGradId = `ds-glow-${uid}`;
  const coinMaskId = `ds-coin-cut-${uid}`;
  const px = ICON_PX[size];
  const isMono = variant === 'monochrome';
  const isLoader = variant === 'loader';

  const symbolSvg = (
    <svg
      width={px}
      height={px}
      viewBox="0 0 512 512"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`shrink-0 ${variant === 'full' ? '' : className}`}
    >
      {isMono ? (
        <>
          <defs>
            <mask id={coinMaskId}>
              <rect width="512" height="512" fill="white" />
              <rect x="228" y="253" width="56" height="16" rx="8" fill="black" />
              <rect x="228" y="283" width="56" height="16" rx="8" fill="black" />
            </mask>
          </defs>
          <path
            d="M 206 184 A 104 104 0 0 0 206 368"
            fill="none"
            stroke="currentColor"
            strokeWidth="44"
            strokeLinecap="round"
          />
          <path
            d="M 306 184 A 104 104 0 0 1 306 368"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.72"
            strokeWidth="44"
            strokeLinecap="round"
          />
          <circle
            cx="256"
            cy="276"
            r="58"
            fill="currentColor"
            mask={`url(#${coinMaskId})`}
          />
          <path d={HEART_PATH} fill="currentColor" />
        </>
      ) : (
        <>
          <defs>
            <linearGradient id={bgGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="55%" stopColor="#ea580c" />
              <stop offset="100%" stopColor="#9a3412" />
            </linearGradient>
            <radialGradient id={glowGradId} cx="76%" cy="22%" r="58%">
              <stop offset="0%" stopColor="#fff7ed" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#fff7ed" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="512" height="512" rx="116" fill={`url(#${bgGradId})`} />
          <rect width="512" height="512" rx="116" fill={`url(#${glowGradId})`} />
          <rect
            x="18"
            y="18"
            width="476"
            height="476"
            rx="100"
            fill="none"
            stroke="#fed7aa"
            strokeOpacity="0.3"
            strokeWidth="4"
          />

          <path
            d="M 206 184 A 104 104 0 0 0 206 368"
            fill="none"
            stroke="#fff7ed"
            strokeWidth="40"
            strokeLinecap="round"
          />
          <path
            d="M 306 184 A 104 104 0 0 1 306 368"
            fill="none"
            stroke="#fed7aa"
            strokeWidth="40"
            strokeLinecap="round"
          />

          <g className={isLoader ? 'animate-pulse' : undefined}>
            <circle cx="256" cy="276" r="58" fill="#fff7ed" />
            <rect x="228" y="253" width="56" height="16" rx="8" fill="#c2410c" />
            <rect x="228" y="283" width="56" height="16" rx="8" fill="#c2410c" />
          </g>

          <path
            d={HEART_PATH}
            fill="#fb7185"
            stroke="#fff7ed"
            strokeWidth="6"
            strokeLinejoin="round"
            className={isLoader ? 'animate-pulse [animation-delay:200ms]' : undefined}
          />
        </>
      )}
    </svg>
  );

  if (variant !== 'full') {
    return symbolSvg;
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {symbolSvg}
      <span
        className={`font-display font-extrabold tracking-tight leading-none ${WORDMARK_CLASS[size]}`}
      >
        <span className="text-stone-900">Duo</span>
        <span className="text-orange-600">Spend</span>
      </span>
    </span>
  );
};
