import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  PauseCircle,
  RefreshCw,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import type { SavingsChallengeHealthState } from '../../types';

export interface ChallengeHealthDisplay {
  label: string;
  badgeClass: string;
  barClass: string;
  ringStroke: string;
  icon: LucideIcon;
}

export function getChallengeHealthDisplay(
  healthState: SavingsChallengeHealthState
): ChallengeHealthDisplay {
  switch (healthState) {
    case 'completed':
      return {
        label: 'Completata',
        badgeClass: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25',
        barClass: 'bg-emerald-600',
        ringStroke: 'var(--chart-color-2)',
        icon: CheckCircle2,
      };
    case 'warning':
      return {
        label: 'Quasi al limite',
        badgeClass: 'bg-amber-500/12 text-amber-700 border-amber-500/25',
        barClass: 'bg-amber-500',
        ringStroke: 'var(--chart-color-6)',
        icon: AlertTriangle,
      };
    case 'exceeded':
      return {
        label: 'Limite superato',
        badgeClass: 'bg-rose-500/12 text-rose-700 border-rose-500/25',
        barClass: 'bg-rose-500',
        ringStroke: 'var(--theme-progress-danger)',
        icon: AlertTriangle,
      };
    case 'paused':
      return {
        label: 'In pausa',
        badgeClass: 'bg-stone-500/10 text-stone-600 border-stone-500/20',
        barClass: 'bg-stone-400',
        ringStroke: 'var(--chart-color-11)',
        icon: PauseCircle,
      };
    case 'cancelled':
      return {
        label: 'Annullata',
        badgeClass: 'bg-stone-500/10 text-stone-600 border-stone-500/20',
        barClass: 'bg-stone-400',
        ringStroke: 'var(--chart-color-11)',
        icon: CircleSlash,
      };
    case 'needs_recalculation':
      return {
        label: 'Da ricalcolare',
        badgeClass: 'bg-amber-500/12 text-amber-700 border-amber-500/25',
        barClass: 'bg-amber-500',
        ringStroke: 'var(--chart-color-6)',
        icon: RefreshCw,
      };
    case 'neutral':
      return {
        label: 'Nessuna spesa',
        badgeClass: 'bg-blue-500/12 text-blue-700 border-blue-500/25',
        barClass: 'bg-blue-500',
        ringStroke: 'var(--chart-color-3)',
        icon: Target,
      };
    case 'positive':
    default:
      return {
        label: 'In linea',
        badgeClass: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25',
        barClass: 'bg-emerald-600',
        ringStroke: 'var(--chart-color-2)',
        icon: Sparkles,
      };
  }
}

const MONTHS_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

export function formatYearMonthIt(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!match) return ym;
  const idx = Number(match[2]) - 1;
  return `${MONTHS_IT[idx] ?? match[2]} ${match[1]}`;
}

export function formatDateTimeShort(iso?: string): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(parsed));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}
