import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { initAuth, signIn, signOut, type AuthState } from '../auth';

// Who is using the app: the Microsoft account, and their role from Settings → Users
export interface Me { email: string; name: string; role: 'Admin' | 'Viewer'; signInEnabled: boolean }
const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext);

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow p-8 grid gap-4 text-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Components Report</h1>
          <p className="text-gray-600 text-sm">Davidsons Blinds & Shutters Database</p>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const MicrosoftLogo = () => (
  <svg viewBox="0 0 21 21" className="h-4 w-4" aria-hidden="true"><path fill="#f25022" d="M1 1h9v9H1z" /><path fill="#7fba00" d="M11 1h9v9h-9z" /><path fill="#00a4ef" d="M1 11h9v9H1z" /><path fill="#ffb900" d="M11 11h9v9h-9z" /></svg>
);

export function AuthGate({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [problem, setProblem] = useState<{ text: string; code?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const a = await initAuth();
        setAuth(a);
        if (a.enabled && !a.signedIn) return;
        try {
          setMe((await axios.get(`${apiUrl}/me`)).data);
        } catch (e) {
          // a backend from before sign-in: no users or roles yet, so everything stays open as it was
          if (!a.enabled && axios.isAxiosError(e) && e.response?.status === 404) setMe({ email: '', name: '', role: 'Admin', signInEnabled: false });
          else throw e;
        }
      } catch (e) {
        const d = axios.isAxiosError(e) ? e.response?.data : null;
        setProblem({ text: d?.error || 'The report server could not be reached. Check your connection and refresh the page.', code: d?.code });
      }
    })();
  }, []);

  if (problem) {
    const noAccess = problem.code === 'no-access';
    return (
      <Screen title={noAccess ? "You don't have access yet" : 'Something went wrong'}>
        <p className="text-sm text-gray-700">{problem.text}</p>
        {auth?.enabled && (
          <button onClick={() => signOut()} className="justify-self-center px-3 py-1 text-sm rounded bg-gray-200 text-gray-800 font-medium hover:bg-gray-300">
            Sign out{auth.account ? ` (${auth.account.username})` : ''}
          </button>
        )}
      </Screen>
    );
  }
  if (auth?.enabled && !auth.signedIn) {
    return (
      <Screen title="Sign in">
        <p className="text-sm text-gray-600">Use your Davidsons Microsoft account.</p>
        <button onClick={() => signIn()} className="justify-self-center inline-flex items-center gap-2 px-4 py-2 rounded border border-gray-300 bg-white text-gray-800 font-medium hover:bg-gray-50">
          <MicrosoftLogo /> Sign in with Microsoft
        </button>
      </Screen>
    );
  }
  if (!me) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" aria-label="Loading" />
      </div>
    );
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export { signOut };
