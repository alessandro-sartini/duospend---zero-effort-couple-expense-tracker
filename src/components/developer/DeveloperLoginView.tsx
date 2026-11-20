import React from 'react';
import { AlertTriangle, Terminal } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';

interface DeveloperLoginViewProps {
  isOpen: boolean;
  onClose: () => void;
  developerPassword: string;
  onChangePassword: (val: string) => void;
  loginError: string | null;
  onSubmit: (e: React.FormEvent) => void;
}

export const DeveloperLoginView: React.FC<DeveloperLoginViewProps> = ({
  isOpen,
  onClose,
  developerPassword,
  onChangePassword,
  loginError,
  onSubmit,
}) => {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Accesso Console Sviluppatore"
      subtitle="Protetta da password .env (DUOSPEND_DEV_PASSWORD)"
      icon={Terminal}
      maxWidth="sm"
    >
      <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-4">
        <p className="text-xs text-stone-500 leading-relaxed">
          Inserisci la password sviluppatore configurata nel file <code className="font-mono">.env</code> del server per sbloccare diagnostica, esportazione backup e reset del database.
        </p>
        {loginError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{loginError}</span>
          </div>
        )}
        <input
          type="password"
          autoComplete="current-password"
          value={developerPassword}
          onChange={(event) => onChangePassword(event.target.value)}
          className="ds-input w-full px-3.5 py-2.5 text-sm"
          placeholder="Password sviluppatore"
          required
        />
        <button
          type="submit"
          className="ds-btn-primary w-full px-4 py-2.5 text-xs active:scale-[0.98]"
        >
          Accedi alla console
        </button>
      </form>
    </ModalShell>
  );
};
