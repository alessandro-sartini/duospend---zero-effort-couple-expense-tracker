import React from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { DuoSpendLogo } from './DuoSpendLogo';

interface FullScreenLoaderProps {
  label?: string;
  sublabel?: string;
}

export const FullScreenLoader: React.FC<FullScreenLoaderProps> = ({
  label = 'Verifica sessione in corso…',
  sublabel = 'Accesso sicuro alla cassaforte di coppia DuoSpend',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[100dvh] bg-[#FAFAF8] text-stone-900 flex flex-col items-center justify-center px-4 py-12"
    >
      <div className="ds-card relative max-w-sm w-full p-8 text-center space-y-5 overflow-hidden shadow-xl">
        <div className="pointer-events-none absolute -top-16 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-orange-500/15 blur-2xl" />

        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-2xl border-2 border-orange-500/20" />
          <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-orange-500 border-r-orange-500/60 animate-spin" />
          <DuoSpendLogo variant="loader" size="lg" />
        </div>

        <div className="space-y-1.5">
          <h1 className="font-display text-base font-bold text-stone-900">
            {label}
          </h1>
          <p className="text-xs text-stone-500 leading-relaxed">{sublabel}</p>
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-bounce" />
        </div>
      </div>
    </div>
  );
};

interface InlineLoaderProps {
  title: string;
  subtitle?: string;
  compact?: boolean;
  children?: React.ReactNode;
}

export const InlineLoader: React.FC<InlineLoaderProps> = ({
  title,
  subtitle,
  compact = false,
  children,
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`ds-subcard ${compact ? 'py-3 px-4' : 'py-6 px-5'} text-center space-y-3`}
    >
      <div className="relative mx-auto flex h-10 w-10 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-orange-500/20" />
        <div className="h-10 w-10 rounded-full border-2 border-transparent border-t-orange-600 animate-spin" />
        <DuoSpendLogo variant="monochrome" size="xs" className="absolute text-orange-600" />
      </div>
      <div>
        <p className="text-xs font-semibold text-stone-800">{title}</p>
        {subtitle && <p className="text-[11px] text-stone-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
};

interface SyncStatusBadgeProps {
  isSyncing: boolean;
  authMethod?: 'google' | 'development' | null;
  className?: string;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  isSyncing,
  authMethod,
  className = '',
}) => {
  if (isSyncing) {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`hidden sm:inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-700 ${className}`}
        title="Sincronizzazione con il database centrale in corso"
      >
        <RefreshCw className="h-2.5 w-2.5 animate-spin shrink-0" />
        <span className="hidden 2xl:inline">Sincronizzazione…</span>
      </span>
    );
  }

  return (
    <span
      className={`hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ${className}`}
      title={
        authMethod === 'development'
          ? 'Sessione locale autenticata sul server'
          : 'Cassaforte autenticata e sincronizzata'
      }
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
      <span className="hidden 2xl:inline">
        {authMethod === 'development' ? 'Locale' : 'Protetto'}
      </span>
    </span>
  );
};
