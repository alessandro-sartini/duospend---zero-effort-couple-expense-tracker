import React from 'react';
import { Mail, ShieldCheck } from 'lucide-react';

interface GmailConnectPromptProps {
  isLoggingIn: boolean;
  onSignIn: () => void;
}

export const GmailConnectPrompt: React.FC<GmailConnectPromptProps> = ({
  isLoggingIn,
  onSignIn,
}) => (
  <div className="text-center py-6 px-4 space-y-4">
    <div className="w-12 h-12 rounded-2xl bg-orange-500/12 border border-orange-500/25 text-orange-600 mx-auto flex items-center justify-center">
      <Mail className="w-6 h-6" />
    </div>
    <div>
      <h4 className="text-sm font-bold text-stone-900">
        Connetti il tuo Account Gmail
      </h4>
      <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
        DuoSpend si connette in modalità di sola lettura per rilevare automaticamente scontrini Amazon, Uber, viaggi e bollette senza doverli inserire a mano.
      </p>
    </div>

    <div className="pt-2 flex justify-center">
      <button
        type="button"
        onClick={onSignIn}
        disabled={isLoggingIn}
        className="ds-btn-secondary px-5 py-2.5 text-xs shadow-xs"
      >
        <svg className="w-4 h-4" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        <span>{isLoggingIn ? 'Connessione a Google...' : 'Accedi con Google'}</span>
      </button>
    </div>

    <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
      <span>Accesso in sola lettura. Il testo delle email candidate viene inviato a Gemini; gli allegati no.</span>
    </div>
  </div>
);
