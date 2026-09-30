import axios from 'axios';
import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-browser';

/**
 * Microsoft sign-in. The backend says whether sign-in is on (and the tenant / app IDs) at /api/auth-config;
 * when it is, every API request carries the signed-in person's Microsoft ID token, which the backend checks.
 */

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const SCOPES = ['openid', 'profile', 'email'];

let msal: PublicClientApplication | null = null;
let account: AccountInfo | null = null;

export interface AuthState { enabled: boolean; signedIn: boolean; account: AccountInfo | null }

export async function initAuth(): Promise<AuthState> {
  let cfg: { enabled: boolean; tenantId: string | null; clientId: string | null };
  try {
    cfg = (await axios.get(`${apiUrl}/auth-config`)).data;
  } catch (e) {
    // a backend from before sign-in (e.g. during a deploy): carry on without it, as the app worked then
    if (axios.isAxiosError(e) && e.response?.status === 404) return { enabled: false, signedIn: false, account: null };
    throw e;
  }
  if (!cfg.enabled || !cfg.tenantId || !cfg.clientId) return { enabled: false, signedIn: false, account: null };

  msal = new PublicClientApplication({
    auth: { clientId: cfg.clientId, authority: `https://login.microsoftonline.com/${cfg.tenantId}`, redirectUri: window.location.origin, postLogoutRedirectUri: window.location.origin },
    cache: { cacheLocation: 'localStorage' },
  });
  await msal.initialize();
  const back = await msal.handleRedirectPromise();          // returning from the Microsoft sign-in page
  account = back?.account ?? msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
  if (account) msal.setActiveAccount(account);

  // every API call carries the ID token; an expired one is renewed once, silently
  axios.interceptors.request.use(async config => {
    if (config.url?.endsWith('/auth-config')) return config;
    const token = await idToken();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });
  axios.interceptors.response.use(undefined, async error => {
    const cfgReq = error.config;
    if (error.response?.status === 401 && ['expired', 'bad-token'].includes(error.response?.data?.code) && !cfgReq._retried) {
      cfgReq._retried = true;
      const token = await idToken(true);
      if (token) { cfgReq.headers.Authorization = `Bearer ${token}`; return axios(cfgReq); }
    }
    return Promise.reject(error);
  });
  return { enabled: true, signedIn: !!account, account };
}

async function idToken(forceRefresh = false): Promise<string | null> {
  if (!msal || !account) return null;
  try {
    const r = await msal.acquireTokenSilent({ scopes: SCOPES, account, forceRefresh });
    return r.idToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) { await signIn(); }
    return null;
  }
}

export function signIn(): Promise<void> {
  return msal ? msal.loginRedirect({ scopes: SCOPES, prompt: 'select_account' }) : Promise.resolve();
}

export function signOut(): Promise<void> {
  return msal ? msal.logoutRedirect({ account: account ?? undefined }) : Promise.resolve();
}
