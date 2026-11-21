import React, { useEffect, useState } from 'react';
import { Calendar, Check, Flag, Lock, Mail, ShieldCheck, Sparkles, Terminal, UserCheck, Users, Wallet } from 'lucide-react';
import { deriveNameFromEmail } from '../services/storage';
import { CoupleProfile } from '../types';
import { ModalShell } from './ui/ModalShell';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CoupleProfile;
  onUpdateProfile: (updated: Partial<CoupleProfile>) => void;
  onLockVault: () => void;
  currentUserEmail?: string;
  isDevelopmentSession?: boolean;
  onOpenDevModal?: () => void;
  onOpenStartingPoint?: () => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  profile,
  onUpdateProfile,
  onLockVault,
  currentUserEmail,
  isDevelopmentSession = false,
  onOpenDevModal,
  onOpenStartingPoint,
}) => {
  const [userName, setUserName] = useState(profile.userName || 'Partner 1');
  const [partnerName, setPartnerName] = useState(profile.partnerName || 'Partner 2');
  const [monthlyBudget, setMonthlyBudget] = useState(String(profile.monthlyBudget || 2800));
  const [partnerEmail, setPartnerEmail] = useState(profile.partnerEmail || '');
  const [trackingStartDate, setTrackingStartDate] = useState(profile.trackingStartDate || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isOwner =
    isDevelopmentSession ||
    !profile.userEmail ||
    currentUserEmail?.toLowerCase().trim() === profile.userEmail?.toLowerCase().trim();

  useEffect(() => {
    if (!isOpen) return;
    setUserName(profile.userName || 'Partner 1');
    setPartnerName(profile.partnerName || 'Partner 2');
    setMonthlyBudget(String(profile.monthlyBudget || 2800));
    setPartnerEmail(profile.partnerEmail || '');
    setTrackingStartDate(profile.trackingStartDate || '');
    setSavedSuccess(false);
  }, [
    isOpen,
    profile.userName,
    profile.partnerName,
    profile.monthlyBudget,
    profile.partnerEmail,
    profile.trackingStartDate,
  ]);

  const handleUseEmailNames = () => {
    const derivedUser = deriveNameFromEmail(currentUserEmail || profile.userEmail);
    const derivedPartner = deriveNameFromEmail(partnerEmail || profile.partnerEmail);
    setUserName(derivedUser || 'Partner 1');
    setPartnerName(derivedPartner || 'Partner 2');
  };

  const handleUseAnonymousNames = () => {
    setUserName('Partner 1');
    setPartnerName('Partner 2');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedBudget = Number(monthlyBudget.replace(',', '.'));
    const validBudget =
      Number.isFinite(parsedBudget) && parsedBudget > 0
        ? Math.round(parsedBudget * 100) / 100
        : profile.monthlyBudget;

    onUpdateProfile({
      userName: userName.trim().slice(0, 100) || 'Partner 1',
      partnerName: partnerName.trim().slice(0, 100) || 'Partner 2',
      monthlyBudget: validBudget,
      trackingStartDate: trackingStartDate.trim() ? trackingStartDate.trim() : undefined,
      ...(isOwner ? { partnerEmail: partnerEmail.trim().toLowerCase().slice(0, 254) } : {}),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const sessionLabel = isDevelopmentSession
    ? 'Sessione locale autenticata'
    : currentUserEmail || profile.userEmail
      ? `Account Google: ${currentUserEmail || profile.userEmail}`
      : 'Sessione Google attiva';

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Profilo, Sicurezza & Accessi"
      subtitle="Nomi coppia, budget mensile e account autorizzati"
      icon={ShieldCheck}
      iconClassName="bg-emerald-500/12 text-emerald-600 border-emerald-500/25"
      maxWidth="md"
      closeLabel="Chiudi impostazioni sicurezza"
    >
      <div className="p-4 sm:p-6 space-y-5 text-xs">
        <div className="ds-subcard p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-600 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-stone-900 block">
                Sessione Attiva e Sbloccata
              </span>
              <span className="text-stone-500 text-[11px] truncate block">
                {sessionLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onLockVault();
            }}
            className="min-h-10 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[11px] flex items-center gap-1 shadow-xs shrink-0 cursor-pointer"
          >
            <Lock className="w-3 h-3" />
            <span>Blocca Ora</span>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-stone-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-orange-600" />
                Nomi visualizzati nella coppia
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleUseEmailNames}
                  className="ds-btn-secondary min-h-8 px-2.5 py-1 text-[11px]"
                >
                  <Sparkles className="w-3 h-3 text-orange-600" />
                  <span>Usa nomi da email</span>
                </button>
                <button
                  type="button"
                  onClick={handleUseAnonymousNames}
                  className="ds-btn-secondary min-h-8 px-2.5 py-1 text-[11px]"
                >
                  <span>Usa nomi anonimi</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="security-user-name" className="block text-[11px] font-semibold text-stone-600 mb-1">
                  Nome Partner 1 (Tu)
                </label>
                <input
                  id="security-user-name"
                  type="text"
                  maxLength={100}
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Partner 1"
                  className="ds-input w-full px-3 py-2 text-xs min-h-10"
                />
              </div>
              <div>
                <label htmlFor="security-partner-name" className="block text-[11px] font-semibold text-stone-600 mb-1">
                  Nome Partner 2
                </label>
                <input
                  id="security-partner-name"
                  type="text"
                  maxLength={100}
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Partner 2"
                  className="ds-input w-full px-3 py-2 text-xs min-h-10"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="security-monthly-budget" className="font-bold text-stone-700 block mb-1">
              Budget Mensile Coppia ({profile.currency})
            </label>
            <div className="relative">
              <Wallet className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="security-monthly-budget"
                type="number"
                min="0"
                step="any"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                placeholder="2800"
                className="ds-input w-full pl-9 pr-3 py-2 text-xs font-mono min-h-10"
              />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label htmlFor="security-tracking-start" className="font-bold text-stone-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-orange-600" />
                Data di inizio tracciamento (Punto Zero)
              </label>
              {onOpenStartingPoint && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenStartingPoint();
                  }}
                  className="text-[11px] font-semibold text-orange-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Flag className="w-3 h-3" />
                  <span>Setup guidato</span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="security-tracking-start"
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                value={trackingStartDate}
                onChange={(e) => setTrackingStartDate(e.target.value)}
                className="ds-input flex-1 min-w-[150px] px-3 py-2 text-xs font-mono min-h-10"
              />
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setTrackingStartDate(
                    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
                  );
                }}
                className="ds-btn-secondary min-h-10 px-2.5 text-[11px]"
              >
                1° mese
              </button>
              <button
                type="button"
                onClick={() => setTrackingStartDate(`${new Date().getFullYear()}-01-01`)}
                className="ds-btn-secondary min-h-10 px-2.5 text-[11px]"
              >
                1° gen
              </button>
              <button
                type="button"
                onClick={() => setTrackingStartDate('')}
                className="ds-btn-secondary min-h-10 px-2.5 text-[11px]"
              >
                Tutto
              </button>
            </div>
            <span className="text-[10px] text-stone-500 mt-1 block">
              Le spese prima di questa data restano salvate ma vengono escluse da saldo, grafici e scansioni Gmail.
            </span>
          </div>

          <div>
            <label htmlFor="security-partner-email" className="font-bold text-stone-700 block mb-1">
              Email Google del Partner (per login con Google):
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="security-partner-email"
                type="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                disabled={!isOwner}
                placeholder="partner@gmail.com"
                className="ds-input w-full pl-9 pr-3 py-2 text-xs min-h-10"
              />
            </div>
            <span className="text-[10px] text-stone-500 mt-1 block">
              Solo il titolare può modificare l’account partner autorizzato sul server.
            </span>
          </div>

          <div className="ds-subcard p-3.5 space-y-1.5">
            <span className="font-bold text-stone-700 block">
              Webhook notifiche bancarie
            </span>
            <span className="text-[10px] text-stone-500 leading-relaxed block">
              Il segreto è configurato solo sul server e non viene inviato al browser. Per integrare un’automazione esterna, usa l’header x-duospend-secret configurato in modo sicuro sul dispositivo.
            </span>
          </div>

          {onOpenDevModal && (
            <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
              <div>
                <span className="font-bold text-stone-800 block">
                  Console Sviluppatore &amp; Gestione DB:
                </span>
                <span className="text-[10px] text-stone-500">
                  Protetta dalla password configurata sul server (.env).
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDevModal();
                }}
                className="min-h-10 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-semibold text-[11px] flex items-center gap-1 shadow-xs shrink-0 cursor-pointer"
              >
                <Terminal className="w-3 h-3 text-orange-400" />
                <span>Apri Console Dev</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 gap-3">
            {savedSuccess ? (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Impostazioni salvate!
              </span>
            ) : (
              <span className="text-stone-400">
                Le modifiche saranno sincronizzate con il server.
              </span>
            )}
            <button
              type="submit"
              className="ds-btn-primary min-h-10 px-4 py-2 text-xs shrink-0"
            >
              Salva Impostazioni
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
};
