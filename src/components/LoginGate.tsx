import React, { useState } from 'react';
import {
  AlertTriangle,
  Lock,
  Mail,
  Moon,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
} from 'lucide-react';
import { CoupleProfile } from '../types';
import type { Theme } from '../services/theme';
import { googleSignIn, loginDeveloperSession, logoutDeveloperSession } from '../services/auth';
import { DuoSpendLogo } from './ui/DuoSpendLogo';

interface LoginGateProps {
  profile: CoupleProfile;
  onUnlock: (authMethod: 'google' | 'development', email: string) => Promise<boolean>;
  enableLocalDevelopmentLogin?: boolean;
  theme?: Theme;
  onToggleTheme?: () => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({
  profile,
  onUnlock,
  enableLocalDevelopmentLogin,
  theme = 'dark',
  onToggleTheme,
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
    <div className="ds-login-page min-h-[100dvh] w-full flex flex-col sm:justify-center items-center px-5 sm:px-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="ds-login-card w-full max-w-[420px] flex-1 sm:flex-initial flex flex-col justify-between sm:justify-start sm:rounded-[28px] sm:p-8">
        {/* Barra superiore discreta */}
        <div className="flex items-center justify-between gap-2">
          <span className="ds-login-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium">
            <Lock className="w-3 h-3 text-emerald-500 shrink-0" aria-hidden="true" />
            <span>Cassaforte privata</span>
          </span>

          {onToggleTheme ? (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Attiva tema chiaro' : 'Attiva tema scuro'}
              title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
              className="ds-icon-btn h-10 w-10 rounded-xl"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-500" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" aria-hidden="true" />
              )}
            </button>
          ) : (
            <div className="h-10" aria-hidden="true" />
          )}
        </div>

        {/* Hero centrale */}
        <div className="my-auto py-8 sm:my-0 sm:pt-5 sm:pb-7 text-center flex flex-col items-center">
          <div className="relative inline-flex items-center justify-center">
            <div
              className="ds-login-logo-halo absolute -inset-5 rounded-full blur-lg pointer-events-none"
              aria-hidden="true"
            />
            <DuoSpendLogo variant="mark" size="xl" title="DuoSpend" className="relative drop-shadow-lg" />
          </div>

          <h1 className="mt-5 font-display text-[28px] sm:text-3xl font-extrabold tracking-tight leading-none">
            <span className="text-stone-900">Duo</span>
            <span className="text-orange-600">Spend</span>
          </h1>
          <p className="mt-2.5 text-sm text-stone-500 max-w-[280px] leading-relaxed">
            Le spese di coppia, sempre in equilibrio.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="ds-login-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
              <Scale className="w-3 h-3 text-orange-600 shrink-0" aria-hidden="true" />
              <span>Pareggio 50/50</span>
            </span>
            <span className="ds-login-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
              <Mail className="w-3 h-3 text-blue-500 shrink-0" aria-hidden="true" />
              <span>Ricevute Gmail</span>
            </span>
            <span className="ds-login-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
              <Sparkles className="w-3 h-3 text-emerald-500 shrink-0" aria-hidden="true" />
              <span>Budget &amp; AI</span>
            </span>
          </div>
        </div>

        {/* Azione di accesso in basso */}
        <div className="space-y-4 w-full">
          {error && (
            <div
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoadingGoogle}
            aria-busy={isLoadingGoogle}
            className="ds-login-google-btn min-h-[52px] w-full rounded-2xl px-5 py-3.5 text-sm font-semibold transition-all active:scale-[0.985] flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoadingGoogle ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-orange-600" aria-hidden="true" />
                <span>Verifica account Google...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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

          <div className="text-center text-[11px] text-stone-500 leading-relaxed space-y-0.5">
            <p>
              <ShieldCheck
                className="w-3.5 h-3.5 text-emerald-500 inline-block mr-1 -mt-0.5"
                aria-hidden="true"
              />
              Accesso verificato dal server · Solo account autorizzati della coppia.
            </p>
            <p className="text-stone-400">
              Include la sincronizzazione facoltativa delle ricevute Gmail.
            </p>
          </div>

          {enableLocalDevelopmentLogin && (
            <form onSubmit={handleDeveloperLogin} className="space-y-2.5 pt-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-stone-200/80" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  Sviluppo locale
                </span>
                <div className="h-px flex-1 bg-stone-200/80" />
              </div>
              <input
                type="password"
                autoComplete="current-password"
                value={developerPassword}
                onChange={(event) => setDeveloperPassword(event.target.value)}
                placeholder="Password di sviluppo locale"
                aria-label="Password di sviluppo locale"
                required
                className="ds-input min-h-11 w-full px-3.5 py-2.5 text-xs"
              />
              <button
                type="submit"
                disabled={isLoadingDeveloper}
                className="ds-btn-secondary min-h-11 w-full px-4 py-2.5 text-xs"
              >
                <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isLoadingDeveloper ? 'Accesso in corso…' : 'Entra nell’app (sviluppo locale)'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
