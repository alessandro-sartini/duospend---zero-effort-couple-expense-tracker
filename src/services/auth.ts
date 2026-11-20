type GoogleUser = {
  email?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleCodeResponse = {
  code?: string;
  error?: string;
  error_description?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }) => { requestAccessToken: () => void };
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: 'popup' | 'redirect';
            callback: (response: GoogleCodeResponse) => void;
          }) => { requestCode: () => void };
        };
      };
    };
  }
}

let runtimeGoogleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GMAIL_SESSION_TOKEN_KEY = 'duospend_gmail_oauth_token_v1';
let googleScriptPromise: Promise<void> | null = null;
let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;
let gmailAccessGranted = false;
let developerSessionActive = false;
let codeFlowEnabled = false;
let developerConsoleEnabled = false;
let authConfigPromise: Promise<{
  codeFlowEnabled: boolean;
  developerConsoleEnabled: boolean;
  googleClientId?: string;
}> | null = null;

const getGoogleClientId = (): string => runtimeGoogleClientId;

const hydrateGmailSessionToken = () => {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(GMAIL_SESSION_TOKEN_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      accessToken?: unknown;
      expiresAt?: unknown;
      gmailAccessGranted?: unknown;
    };
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.expiresAt === 'number' &&
      parsed.expiresAt > Date.now()
    ) {
      cachedAccessToken = parsed.accessToken;
      cachedAccessTokenExpiresAt = parsed.expiresAt;
      gmailAccessGranted = Boolean(parsed.gmailAccessGranted);
    } else {
      sessionStorage.removeItem(GMAIL_SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore sessionStorage errors
  }
};

const persistGmailSessionToken = () => {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (!cachedAccessToken || cachedAccessTokenExpiresAt <= Date.now()) {
      sessionStorage.removeItem(GMAIL_SESSION_TOKEN_KEY);
      return;
    }
    sessionStorage.setItem(
      GMAIL_SESSION_TOKEN_KEY,
      JSON.stringify({
        accessToken: cachedAccessToken,
        expiresAt: cachedAccessTokenExpiresAt,
        gmailAccessGranted,
      }),
    );
  } catch {
    // Ignore sessionStorage errors
  }
};

hydrateGmailSessionToken();

const buildGoogleScopes = (includeGmailScope: boolean): string => {
  const scopes = ['openid', 'email', 'profile'];
  if (includeGmailScope) scopes.push('https://www.googleapis.com/auth/gmail.readonly');
  return scopes.join(' ');
};

const fetchAuthConfig = async (): Promise<{
  codeFlowEnabled: boolean;
  developerConsoleEnabled: boolean;
  googleClientId?: string;
}> => {
  if (!authConfigPromise) {
    authConfigPromise = fetch('/api/auth/config')
      .then(async (res) => {
        if (!res.ok) return { codeFlowEnabled: false, developerConsoleEnabled: false };
        const data = await res.json().catch(() => ({}));
        const googleClientId =
          typeof data.googleClientId === 'string' && data.googleClientId.trim()
            ? data.googleClientId.trim()
            : undefined;
        return {
          codeFlowEnabled: Boolean(data.codeFlowEnabled),
          developerConsoleEnabled: Boolean(data.developerConsoleEnabled),
          googleClientId,
        };
      })
      .catch(() => ({ codeFlowEnabled: false, developerConsoleEnabled: false }))
      .then(
        (config: {
          codeFlowEnabled: boolean;
          developerConsoleEnabled: boolean;
          googleClientId?: string;
        }) => {
          codeFlowEnabled = config.codeFlowEnabled;
          developerConsoleEnabled = config.developerConsoleEnabled;
          if (!runtimeGoogleClientId && config.googleClientId) {
            runtimeGoogleClientId = config.googleClientId;
          }
          return config;
        }
      );
  }
  return authConfigPromise;
};

export const getAuthConfig = fetchAuthConfig;
export const isDeveloperConsoleEnabled = (): boolean => developerConsoleEnabled;
export const usesServerSideOAuth = (): boolean => codeFlowEnabled;

const loadGoogleIdentityServices = async (): Promise<void> => {
  if (!getGoogleClientId()) {
    await fetchAuthConfig();
  }
  if (!getGoogleClientId()) {
    throw new Error('Configura VITE_GOOGLE_CLIENT_ID nel file .env o nelle variabili d’ambiente.');
  }
  if (window.google?.accounts.oauth2) return;

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GOOGLE_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        googleScriptPromise = null;
        reject(new Error('Impossibile caricare il servizio di accesso Google.'));
      };
      document.head.appendChild(script);
    });
  }
  await googleScriptPromise;
};

if (getGoogleClientId()) {
  void loadGoogleIdentityServices().catch((error) => {
    console.error('Google Identity Services failed to initialize:', error);
  });
}

const requestGoogleAuthorizationCode = async (includeGmailScope: boolean): Promise<string> => {
  await loadGoogleIdentityServices();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: getGoogleClientId(),
      scope: buildGoogleScopes(includeGmailScope),
      ux_mode: 'popup',
      callback: (response) => {
        if (response.error || !response.code) {
          reject(new Error(response.error_description || response.error || 'Accesso Google non riuscito.'));
          return;
        }
        resolve(response.code);
      },
    });
    client.requestCode();
  });
};

const requestGoogleAccessToken = async (includeGmailScope: boolean): Promise<string> => {
  await loadGoogleIdentityServices();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: getGoogleClientId(),
      scope: buildGoogleScopes(includeGmailScope),
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Accesso Google non riuscito.'));
          return;
        }
        cachedAccessToken = response.access_token;
        cachedAccessTokenExpiresAt = Date.now() + (response.expires_in || 3600) * 1000;
        resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
};

export const initAuth = (
  onAuthSuccess?: (user: GoogleUser) => void,
  onAuthFailure?: () => void
) => {
  let cancelled = false;
  void (async () => {
    try {
      const [config, response] = await Promise.all([
        fetchAuthConfig(),
        fetch('/api/auth/session'),
      ]);
      if (!response.ok) throw new Error('Verifica della sessione non riuscita.');
      const session = await response.json();
      if (cancelled) return;
      if (config.codeFlowEnabled) {
        cachedAccessToken = null;
        cachedAccessTokenExpiresAt = 0;
        gmailAccessGranted = Boolean(session.authenticated && session.gmailAccess);
        persistGmailSessionToken();
      }
      if (session.authenticated) {
        if (session.method === 'development') developerSessionActive = true;
        onAuthSuccess?.(session.user || {});
      } else {
        gmailAccessGranted = false;
        onAuthFailure?.();
      }
    } catch (error) {
      console.error('Session check failed:', error);
      if (!cancelled) onAuthFailure?.();
    }
  })();
  return () => {
    cancelled = true;
  };
};

const SERVER_UNREACHABLE_ERROR =
  'Impossibile contattare il server DuoSpend. Verifica che il server o "npm run tunnel" siano attivi sul PC e che l’URL .trycloudflare.com non sia scaduto.';

async function fetchAuthApi(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (
      error instanceof TypeError ||
      /failed to fetch|networkerror/i.test((error as Error)?.message || '')
    ) {
      throw new Error(SERVER_UNREACHABLE_ERROR);
    }
    throw error;
  }
}

export const googleSignIn = async (
  includeGmailScope = false
): Promise<{ user: GoogleUser; accessToken: string | null; gmailAccess?: boolean } | null> => {
  const { codeFlowEnabled: useCodeFlow } = await fetchAuthConfig();

  if (useCodeFlow) {
    const code = await requestGoogleAuthorizationCode(includeGmailScope);
    const response = await fetchAuthApi('/api/auth/google-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ code }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Verifica dell’account Google non riuscita.');
    }

    cachedAccessToken = null;
    cachedAccessTokenExpiresAt = 0;
    gmailAccessGranted = Boolean(data.gmailAccess);
    persistGmailSessionToken();
    return { user: data.user, accessToken: null, gmailAccess: Boolean(data.gmailAccess) };
  }

  const accessToken = await requestGoogleAccessToken(includeGmailScope);
  const response = await fetchAuthApi('/api/auth/google-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Verifica dell’account Google non riuscita.');
  }

  gmailAccessGranted = includeGmailScope;
  persistGmailSessionToken();
  return { user: data.user, accessToken, gmailAccess: includeGmailScope };
};

export const getAccessToken = async (): Promise<string | null> => {
  if (codeFlowEnabled) {
    return null;
  }
  if (cachedAccessTokenExpiresAt <= Date.now()) {
    cachedAccessToken = null;
    gmailAccessGranted = false;
    persistGmailSessionToken();
  }
  return cachedAccessToken;
};

export const hasGmailAccess = (): boolean => gmailAccessGranted;

export const loginDeveloperSession = async (password: string): Promise<void> => {
  const response = await fetchAuthApi('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Accesso sviluppatore locale non riuscito.');
  }
  developerSessionActive = true;
};

export const logoutDeveloperSession = async (force = false): Promise<void> => {
  if (!force && !developerSessionActive) return;
  try {
    const response = await fetch('/api/dev/logout', { method: 'POST' });
    if (!response.ok && response.status !== 401 && response.status !== 404) {
      throw new Error('Impossibile chiudere la sessione sviluppatore.');
    }
  } finally {
    developerSessionActive = false;
  }
};

export const logout = async () => {
  await logoutDeveloperSession(false);
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) {
    throw new Error('Impossibile chiudere la sessione Google.');
  }
  cachedAccessToken = null;
  cachedAccessTokenExpiresAt = 0;
  gmailAccessGranted = false;
  persistGmailSessionToken();
};
