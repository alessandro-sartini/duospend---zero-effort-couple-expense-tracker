import React from 'react';
import {
  ArrowLeft,
  Compass,
  LayoutDashboard,
  Receipt,
  Scale,
  Sparkles,
} from 'lucide-react';

interface NotFoundViewProps {
  pathname: string;
  onNavigate: (tab: string) => void;
}

const QUICK_LINKS = [
  {
    id: 'dashboard',
    label: 'Panoramica',
    desc: 'Stato saldo e budget del mese',
    icon: LayoutDashboard,
  },
  {
    id: 'expenses',
    label: 'Registro Spese',
    desc: 'Cerca, modifica o filtra spese',
    icon: Receipt,
  },
  {
    id: 'settlement',
    label: 'Pareggio Saldo',
    desc: 'Calcolo equo 50/50 e rimborsi',
    icon: Scale,
  },
  {
    id: 'advisor',
    label: 'Consulente AI',
    desc: 'Analisi e consigli con Gemini',
    icon: Sparkles,
  },
];

export const NotFoundView: React.FC<NotFoundViewProps> = ({
  pathname,
  onNavigate,
}) => {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center py-8">
      <div className="ds-card max-w-2xl w-full p-6 sm:p-10 text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-500/25 bg-orange-500/12 text-orange-600">
          <Compass className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center rounded-full border border-stone-200/80 bg-stone-50 px-3 py-1 font-mono text-xs font-bold text-orange-600">
            Errore 404
          </span>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
            Pagina non trovata
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
            Il percorso{' '}
            <code className="rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-xs text-stone-800">
              {pathname}
            </code>{' '}
            non esiste o non è più disponibile in DuoSpend.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => onNavigate(link.id)}
                className="ds-subcard flex items-start gap-3 p-3.5 hover:border-orange-300 hover:bg-orange-50/50 transition-all cursor-pointer group"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-500/25 bg-orange-500/12 text-orange-600 group-hover:scale-105 transition-transform">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-stone-900">
                    {link.label}
                  </span>
                  <span className="block text-[11px] text-stone-500 mt-0.5">
                    {link.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="ds-btn-primary min-h-11 px-6 text-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Torna alla Panoramica</span>
          </button>
        </div>
      </div>
    </div>
  );
};
