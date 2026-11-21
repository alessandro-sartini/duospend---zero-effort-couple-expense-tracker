import React, { useId } from 'react';

type LogoVariant = 'mark' | 'full' | 'monochrome' | 'loader';
type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type LogoConcept = 'v1' | 'v2';

interface DuoSpendLogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  concept?: LogoConcept;
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

const V1_HEART_PATH =
  'M 256 168 C 234 152 218 139 218 122 A 20 20 0 0 1 256 113 A 20 20 0 0 1 294 122 C 294 139 278 152 256 168 Z';

const V2_LEFT_HEART_PATH =
  'M 256 170 C 232 130 174 126 142 158 C 108 192 112 250 156 298 L 256 394';

const V2_RIGHT_HEART_PATH =
  'M 256 170 C 280 130 338 126 370 158 C 404 192 400 250 356 298 L 256 394';

const V2_PULSE_PATH = 'M 148 282 L 204 282 L 236 318 L 292 208 L 356 208';

export const DuoSpendLogo: React.FC<DuoSpendLogoProps> = ({
  variant = 'mark',
  size = 'md',
  concept = 'v2',
  className = '',
  title,
}) => {
  const uid = useId().replace(/:/g, '');
  const bgGradId = `ds-bg-${uid}`;
  const glowGradId = `ds-glow-${uid}`;
  const rimGradId = `ds-rim-${uid}`;
  const leftHeartGradId = `ds-lh-${uid}`;
  const rightHeartGradId = `ds-rh-${uid}`;
  const coinMaskId = `ds-coin-cut-${uid}`;
  const pulseMaskId = `ds-pulse-cut-${uid}`;

  const px = ICON_PX[size];
  const isMono = variant === 'monochrome';
  const isLoader = variant === 'loader';
  const svgClassName = `shrink-0 ${variant === 'full' ? '' : className}`;

  const renderV1 = () => (
    <svg
      width={px}
      height={px}
      viewBox="0 0 512 512"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={svgClassName}
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
          <path d={V1_HEART_PATH} fill="currentColor" />
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
            d={V1_HEART_PATH}
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

  const renderV2 = () => (
    <svg
      width={px}
      height={px}
      viewBox="0 0 512 512"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={svgClassName}
    >
      {isMono ? (
        <>
          <defs>
            <mask id={pulseMaskId}>
              <rect width="512" height="512" fill="white" />
              <path
                d={V2_PULSE_PATH}
                fill="none"
                stroke="black"
                strokeWidth="44"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="356" cy="208" r="28" fill="black" />
            </mask>
          </defs>
          <g mask={`url(#${pulseMaskId})`}>
            <rect x="198" y="300" width="22" height="46" rx="11" fill="currentColor" fillOpacity="0.34" />
            <rect x="245" y="276" width="22" height="70" rx="11" fill="currentColor" fillOpacity="0.34" />
            <rect x="292" y="252" width="22" height="94" rx="11" fill="currentColor" fillOpacity="0.38" />
            <path
              d={V2_LEFT_HEART_PATH}
              fill="none"
              stroke="currentColor"
              strokeWidth="36"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={V2_RIGHT_HEART_PATH}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.72"
              strokeWidth="36"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <path
            d={V2_PULSE_PATH}
            fill="none"
            stroke="currentColor"
            strokeWidth="28"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="356" cy="208" r="20" fill="currentColor" />
        </>
      ) : (
        <>
          <defs>
            <linearGradient id={bgGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#26211d" />
              <stop offset="55%" stopColor="#171412" />
              <stop offset="100%" stopColor="#110f0d" />
            </linearGradient>
            <radialGradient id={glowGradId} cx="35%" cy="25%" r="58%">
              <stop offset="0%" stopColor="#fb923c" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={rimGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
            <linearGradient id={leftHeartGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fdba74" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
            <linearGradient id={rightHeartGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fda4af" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
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
            stroke={`url(#${rimGradId})`}
            strokeOpacity="0.44"
            strokeWidth="4"
          />

          <rect x="198" y="300" width="22" height="46" rx="11" fill="#fb923c" fillOpacity="0.32" />
          <rect x="245" y="276" width="22" height="70" rx="11" fill="#fb7185" fillOpacity="0.32" />
          <rect x="292" y="252" width="22" height="94" rx="11" fill="#34d399" fillOpacity="0.35" />

          <path
            d={V2_LEFT_HEART_PATH}
            fill="none"
            stroke={`url(#${leftHeartGradId})`}
            strokeWidth="36"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={V2_RIGHT_HEART_PATH}
            fill="none"
            stroke={`url(#${rightHeartGradId})`}
            strokeWidth="36"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d={V2_PULSE_PATH}
            fill="none"
            stroke="#171412"
            strokeOpacity="0.88"
            strokeWidth="42"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={V2_PULSE_PATH}
            fill="none"
            stroke="#fff7ed"
            strokeWidth="28"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isLoader ? 'animate-pulse' : undefined}
          />

          <circle
            cx="356"
            cy="208"
            r="20"
            fill="#34d399"
            stroke="#fff7ed"
            strokeWidth="6"
            className={isLoader ? 'animate-pulse [animation-delay:200ms]' : undefined}
          />
        </>
      )}
    </svg>
  );

  const symbolSvg = concept === 'v1' ? renderV1() : renderV2();

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
