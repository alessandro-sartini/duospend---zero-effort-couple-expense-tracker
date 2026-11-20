import React from 'react';
import { ArrowRight, CheckCircle2, Scale, Users, Wallet } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import type { CoupleProfile } from '../../types';
import { StatCard } from '../ui/StatCard';

interface BalanceHeroCardProps {
  profile: CoupleProfile;
  netBalance: number;
  totalSharedSpend: number;
  userTotalPaid: number;
  partnerTotalPaid: number;
  expensesCount?: number;
  variant?: 'dashboard' | 'settlement';
  onOpenSettlement: () => void;
  onNavigateToSettlement?: () => void;
}

export const BalanceHeroCard: React.FC<BalanceHeroCardProps> = ({
  profile,
  netBalance,
  totalSharedSpend,
  userTotalPaid,
  partnerTotalPaid,
  expensesCount = 0,
  variant = 'dashboard',
  onOpenSettlement,
  onNavigateToSettlement,
}) => {
  const isSettled = Math.abs(netBalance) < 0.01;
  const balanceAbs = Math.abs(netBalance);
  const fairShareEach = totalSharedSpend / 2;
  const totalPaid = userTotalPaid + partnerTotalPaid;
  const userPercent = totalPaid > 0 ? Math.round((userTotalPaid / totalPaid) * 100) : 50;
  const partnerPercent = totalPaid > 0 ? 100 - userPercent : 50;

  return (
    <section className="ds-card p-5 sm:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/25 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-orange-700">
              Stato Pareggio Spese di Coppia
            </span>
            <span className="text-xs font-medium text-stone-500">
              Fondo Comune 50 / 50
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isSettled ? (
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/12 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 font-display">
                  Siete Perfettamente Pari!
                </h2>
              </div>
            ) : netBalance > 0 ? (
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 font-display">
                {profile.partnerName} ti deve{' '}
                <span className="font-mono text-emerald-600 tabular-nums">
                  {formatCurrency(balanceAbs, profile.currency)}
                </span>
              </h2>
            ) : (
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 font-display">
                Devi a {profile.partnerName}{' '}
                <span className="font-mono text-orange-600 tabular-nums">
                  {formatCurrency(balanceAbs, profile.currency)}
                </span>
              </h2>
            )}
          </div>

          <p className="text-xs text-stone-500 max-w-xl leading-relaxed">
            {variant === 'settlement' ? (
              isSettled
                ? `Sia ${profile.userName} che ${profile.partnerName} hanno contribuito in parti uguali.`
                : netBalance > 0
                  ? `Hai sostenuto più del tuo 50% di spese comuni.`
                  : `${profile.partnerName} ha anticipato più spese comuni. Effettua un rimborso per pareggiare.`
            ) : (
              <>
                Calcolato in tempo reale su {expensesCount} spese registrate.
                {isSettled
                  ? ` Tu e ${profile.partnerName} avete contribuito in parti uguali.`
                  : ' Pareggiate con un tocco quando effettuate il bonifico o scambio.'}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!isSettled && (
            <button
              type="button"
              onClick={onOpenSettlement}
              className="ds-btn-primary min-h-11 px-5 text-xs"
            >
              <Scale className="w-4 h-4" />
              <span>
                {variant === 'settlement' ? 'Registra Pareggio Saldo' : 'Pareggia Saldo Ora'}
              </span>
            </button>
          )}
          {variant === 'dashboard' && onNavigateToSettlement && (
            <button
              type="button"
              onClick={onNavigateToSettlement}
              className="ds-btn-secondary min-h-11 px-4 text-xs"
            >
              <span>Vedi Calcolo Matematico</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Barra Visiva Ripartizione Contributi */}
      {totalPaid > 0 && (
        <div className="mt-5 pt-4 border-t border-stone-100 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-stone-500">
            <span>
              <strong className="text-stone-800">{profile.userName}</strong> · {userPercent}%
            </span>
            <span className="text-stone-400">Ripartizione pagamenti</span>
            <span>
              {partnerPercent}% · <strong className="text-stone-800">{profile.partnerName}</strong>
            </span>
          </div>
          <div className="progress-track flex h-2 w-full overflow-hidden rounded-full">
            <div
              className="h-full bg-orange-500 transition-all duration-500"
              style={{ width: `${userPercent}%` }}
            />
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${partnerPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Striscia di Ripartizione Contributi */}
      <div className="mt-5 pt-4 border-t border-stone-100">
        {variant === 'settlement' && (
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
            Calcolo Matematico Trasparente del Pareggio
          </h3>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <StatCard
            variant="subcard"
            label={`Pagato da ${profile.userName}`}
            value={formatCurrency(userTotalPaid, profile.currency)}
            icon={Wallet}
            iconClassName="bg-orange-500/12 text-orange-600 border-orange-500/25"
            subtitle={
              variant === 'settlement'
                ? userTotalPaid >= fairShareEach
                  ? `+${formatCurrency(userTotalPaid - fairShareEach, profile.currency)} oltre la quota del 50%`
                  : `-${formatCurrency(fairShareEach - userTotalPaid, profile.currency)} sotto la quota del 50%`
                : totalSharedSpend > 0
                  ? `${userPercent}% del totale coppia`
                  : 'Nessuna spesa'
            }
          />

          <StatCard
            variant="subcard"
            label={`Pagato da ${profile.partnerName}`}
            value={formatCurrency(partnerTotalPaid, profile.currency)}
            icon={Users}
            iconClassName="bg-emerald-500/12 text-emerald-600 border-emerald-500/25"
            subtitle={
              variant === 'settlement'
                ? partnerTotalPaid >= fairShareEach
                  ? `+${formatCurrency(partnerTotalPaid - fairShareEach, profile.currency)} oltre la quota del 50%`
                  : `-${formatCurrency(fairShareEach - partnerTotalPaid, profile.currency)} sotto la quota del 50%`
                : totalSharedSpend > 0
                  ? `${partnerPercent}% del totale coppia`
                  : 'Nessuna spesa'
            }
          />

          <StatCard
            variant="subcard"
            label="Totale Spese Condivise"
            value={formatCurrency(totalSharedSpend, profile.currency)}
            valueClassName="text-orange-600"
            icon={Scale}
            iconClassName="bg-blue-500/12 text-blue-600 border-blue-500/25"
            subtitle={
              <>
                <strong className="text-stone-700 font-mono">
                  {formatCurrency(fairShareEach, profile.currency)}
                </strong>{' '}
                quota equa a testa (50%)
              </>
            }
          />
        </div>
      </div>
    </section>
  );
};
