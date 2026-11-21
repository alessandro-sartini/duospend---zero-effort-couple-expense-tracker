import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, Terminal } from 'lucide-react';
import { CoupleProfile } from '../types';
import { googleSignIn, loginDeveloperSession, logoutDeveloperSession } from '../services/auth';
import { DuoSpendLogo } from './ui/DuoSpendLogo';

interface LoginGateProps {
  profile: CoupleProfile;
  onUnlock: (authMethod: 'google' | 'development', email: string) => Promise<boolean>;
  enableLocalDevelopmentLogin?: boolean;
}

export const LoginGate: React.FC<LoginGateProps> = ({
  profile,
  onUnlock,
  enableLocalDevelopmentLogin,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [developerPassword, setDeveloperPassword] = useState('');
  const [isLoadingDeveloper, setIsLoadingDeveloper] = useState(false);

  // Normalizza gli indirizzi email autorizzati (la verifica definitiva viene sempre svolta sul server)
  const authorizedEmails = [
    (profile.userEmail || '').toLowerCase().trim(),
    (profile.partnerEmail || '').toLowerCase().trim(),
  ].filter(Boolean);

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoadingGoogle(true);
    try {
      const res = await googleSignIn();
      if (!res?.user?.email) {
        throw new Error('Impossibile recuperare l\'indirizzo email di Google.');
      }

      const loggedEmail = res.user.email.toLowerCase().trim();

      const isAuthorizedUser =
        authorizedEmails.length === 0 || authorizedEmails.includes(loggedEmail);

      if (isAuthorizedUser) {
        const unlocked = await onUnlock('google', loggedEmail);
        if (!unlocked) {
          setError('Google ha autenticato l’account, ma il server non ha autorizzato il caricamento dei dati. Verifica che il server sia avviato e che il tuo account sia autorizzato.');
        }
      } else {
        setError(
          `Accesso Negato: l'account Google "${loggedEmail}" non è autorizzato per questo spazio DuoSpend.`
        );
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Accesso Google non riuscito.');
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  const handleDeveloperLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoadingDeveloper(true);
    try {
      await loginDeveloperSession(developerPassword);
      const unlocked = await onUnlock('development', profile.userEmail || 'sviluppo-locale');
      if (!unlocked) {
        await logoutDeveloperSession();
        setError('Accesso locale riuscito, ma il server non ha caricato i dati. Verifica che il database sia disponibile.');
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Accesso locale non riuscito.');
    } finally {
      setDeveloperPassword('');
      setIsLoadingDeveloper(false);
    }
  };

  return (
    <div className="h-[100dvh] overflow-hidden overscroll-none bg-[#FAFAF8] flex flex-col justify-center items-center sm:px-4 sm:py-6">
      <div className="w-full h-full sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-md bg-white sm:rounded-3xl sm:shadow-xl sm:border sm:border-stone-200/80 overflow-hidden flex flex-col">
        {/* Banner superiore sicurezza */}
        <div className="bg-stone-900 px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] pb-6 sm:py-8 text-white text-center relative overflow-hidden shrink-0">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="inline-flex items-center justify-center mb-3 drop-shadow-md">
            <DuoSpendLogo variant="mark" size="lg" title="DuoSpend" />
          </div>

          <h1 className="text-xl font-bold tracking-tight">DuoSpend · Cassaforte Privata</h1>
          <p className="text-xs text-stone-400 mt-1 max-w-xs mx-auto">
            Registro spese e pareggio conti riservato alla coppia autorizzata.
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-stone-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Crittografia e Accesso Limitato alla Coppia</span>
          </div>
        </div>

        {/* Corpo del Form di Accesso */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-8 space-y-5 sm:space-y-6 flex flex-col justify-center">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {/* Accesso con Google */}
          <div>
            <span className="block text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">
              Accesso con account Google autorizzato
            </span>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoadingGoogle}
              className="w-full py-3 px-4 rounded-xl border border-stone-300 hover:border-stone-400 bg-white hover:bg-stone-50 font-semibold text-xs text-stone-800 transition-all flex items-center justify-center gap-3 shadow-xs disabled:opacity-60"
            >
              {isLoadingGoogle ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-orange-600" />
                  <span>Verifica credenziali Google in corso...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Accedi con Google</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-stone-500 mt-1.5 text-center">
              Consente anche di sincronizzare automaticamente le ricevute Gmail.
            </p>
          </div>

          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 space-y-1.5 text-[11px] text-stone-600">
            <div className="flex items-center gap-1.5 font-bold text-stone-900">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Accesso verificato dal server</span>
            </div>
            <p className="leading-relaxed">
              Solo gli account Google autorizzati dal proprietario possono accedere ai dati della coppia.
            </p>
          </div>
          {enableLocalDevelopmentLogin && (
            <form onSubmit={handleDeveloperLogin} className="space-y-2 border-t border-stone-100 pt-4">
              <p className="text-center text-[11px] text-stone-500">
                Google non configurato? Entra nella home locale con la password di sviluppo.
              </p>
              <input
                type="password"
                autoComplete="current-password"
                value={developerPassword}
                onChange={(event) => setDeveloperPassword(event.target.value)}
                placeholder="Password di sviluppo locale"
                aria-label="Password di sviluppo locale"
                required
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={isLoadingDeveloper}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-stone-800 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-60"
              >
                <Terminal className="h-3.5 w-3.5" />
                {isLoadingDeveloper ? 'Accesso in corso…' : 'Entra nell’app (sviluppo locale)'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
