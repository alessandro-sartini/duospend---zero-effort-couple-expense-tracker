import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Scale } from 'lucide-react';
import { formatCurrency } from '../constants/categories';
import { CoupleProfile, Payer, Settlement } from '../types';
import { ModalShell } from './ui/ModalShell';

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSettlement: (settlement: Omit<Settlement, 'id'>) => void;
  profile: CoupleProfile;
  netBalance: number;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  isOpen,
  onClose,
  onConfirmSettlement,
  profile,
  netBalance,
}) => {
  const defaultAmount = Math.abs(netBalance);
  const [amount, setAmount] = useState(defaultAmount > 0 ? defaultAmount.toFixed(2) : '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromPayer, setFromPayer] = useState<Payer>(netBalance < 0 ? 'user' : 'partner');
  const [toPayer, setToPayer] = useState<Payer>(netBalance < 0 ? 'partner' : 'user');
  const [method, setMethod] = useState('Revolut');
  const [note, setNote] = useState('Pareggio spese di coppia');

  useEffect(() => {
    if (!isOpen) return;
    const abs = Math.abs(netBalance);
    setAmount(abs > 0 ? abs.toFixed(2) : '');
    setDate(new Date().toISOString().slice(0, 10));
    setFromPayer(netBalance < 0 ? 'user' : 'partner');
    setToPayer(netBalance < 0 ? 'partner' : 'user');
  }, [isOpen, netBalance]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    onConfirmSettlement({
      amount: parsedAmount,
      currency: profile.currency,
      date,
      from: fromPayer,
      to: toPayer,
      note: `${note} (${method})`.trim(),
    });
    onClose();
  };

  const payerName = fromPayer === 'user' ? profile.userName : profile.partnerName;
  const receiverName = toPayer === 'user' ? profile.userName : profile.partnerName;

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="ds-btn-secondary min-h-10 px-4 text-xs"
      >
        Annulla
      </button>
      <button
        type="submit"
        form="settlement-form"
        className="ds-btn-primary min-h-10 px-5 text-xs"
      >
        <Check className="w-4 h-4" />
        <span>Registra Pareggio</span>
      </button>
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Registra Pareggio Saldo"
      subtitle="Azzera il debito condiviso registrando il rimborso"
      icon={Scale}
      maxWidth="md"
      closeLabel="Chiudi pareggio saldo"
      footer={footer}
    >
      <form id="settlement-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
        <div className="p-4 rounded-xl bg-orange-50/60 border border-orange-200/60 flex items-center justify-between">
          <div className="text-center">
            <span className="block text-[11px] text-stone-500 uppercase tracking-wide">
              Chi Paga
            </span>
            <span className="font-bold text-sm text-stone-900">{payerName}</span>
          </div>
          <div className="flex flex-col items-center">
            <ArrowRight className="w-5 h-5 text-orange-600" />
            <span className="text-[10px] text-orange-700 font-semibold mt-0.5">
              Rimborsa a
            </span>
          </div>
          <div className="text-center">
            <span className="block text-[11px] text-stone-500 uppercase tracking-wide">
              Chi Riceve
            </span>
            <span className="font-bold text-sm text-stone-900">{receiverName}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Importo del Bonifico / Pagamento ({profile.currency})
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-xs text-stone-400 font-mono">
              €
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="ds-input w-full pl-7 pr-3 py-2 text-base font-mono font-bold"
            />
          </div>
          {defaultAmount > 0 && (
            <button
              type="button"
              onClick={() => setAmount(defaultAmount.toFixed(2))}
              className="mt-1.5 text-[11px] text-orange-600 hover:underline font-semibold cursor-pointer"
            >
              Imposta saldo esatto completo: {formatCurrency(defaultAmount, profile.currency)}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Data</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ds-input w-full px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Metodo
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="ds-input w-full px-3 py-2 text-xs"
            >
              <option value="Revolut">Revolut</option>
              <option value="Bonifico Bancario">Bonifico Bancario</option>
              <option value="Satispay">Satispay</option>
              <option value="PayPal">PayPal</option>
              <option value="Contanti">Contanti</option>
              <option value="Altro">Altro</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Causale / Nota
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="es. Pareggio spese spesa e cene novembre"
            className="ds-input w-full px-3 py-2 text-xs"
          />
        </div>
      </form>
    </ModalShell>
  );
};
