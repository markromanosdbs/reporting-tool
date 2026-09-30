import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useMe } from './AuthGate';

// Settings → Users: who can use the app (Microsoft accounts) and whether they're an Admin or a Viewer
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface User {
  id: number; email: string; name: string | null; role: 'Admin' | 'Viewer';
  added_by: string | null; added_at: string; first_sign_in_at: string | null; last_sign_in_at: string | null;
}

const when = (s: string | null) => s ? new Date(s).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const errorText = (e: unknown) => (axios.isAxiosError(e) && e.response?.data?.error) || 'The server could not be reached. Check your connection and try again.';

export function UsersSettings() {
  const me = useMe();
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Viewer' | 'Admin'>('Viewer');
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setUsers((await axios.get(`${apiUrl}/users`)).data.users); }
    catch (e) { setMessage({ kind: 'error', text: errorText(e) }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setMessage(null); setBusy(true);
    try { await fn(); setMessage({ kind: 'ok', text: done }); setConfirmRemove(null); await load(); }
    catch (e) { setMessage({ kind: 'error', text: errorText(e) }); }
    finally { setBusy(false); }
  };

  const add = () => {
    const e = email.trim().toLowerCase();
    if (!e) return setMessage({ kind: 'error', text: "Enter the person's Microsoft email address." });
    void run(async () => { await axios.post(`${apiUrl}/users`, { email: e, role }); setEmail(''); setRole('Viewer'); }, `${e} added as ${role}. They can sign in now.`);
  };

  const cell = 'px-3 py-0 border-b border-r border-gray-200 last:border-r-0 whitespace-nowrap align-middle';
  const small = 'inline-block px-2 py-0.5 rounded text-xs font-medium leading-4';

  return (
    <section className="bg-white rounded-lg shadow p-5 grid gap-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Users</h3>
        <p className="text-sm text-gray-600">
          People sign in with their Davidsons Microsoft account. Only people on this list can use the app.
          <span className="font-medium"> Viewers</span> see the reports and can reconcile job sheets;
          <span className="font-medium"> Admins</span> can also update job sheet templates and manage users.
        </p>
        {me && !me.signInEnabled && (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Microsoft sign-in isn't switched on for this server yet, so everyone can use the app as an Admin. The list below takes effect once it is.
          </p>
        )}
      </div>

      {message && <div className={`rounded border px-4 py-3 ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>{message.text}</div>}

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] items-end">
        <label className="grid gap-1 text-sm text-gray-600">Microsoft email
          <input id="us-email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="name@davidsonsblinds.com.au" className="border border-gray-300 rounded px-3 py-2 text-gray-900" />
        </label>
        <label className="grid gap-1 text-sm text-gray-600">Access
          <select id="us-role" value={role} onChange={e => setRole(e.target.value as 'Viewer' | 'Admin')} className="border border-gray-300 rounded px-3 py-2 text-gray-900">
            <option value="Viewer">Viewer</option>
            <option value="Admin">Admin</option>
          </select>
        </label>
        <button onClick={add} disabled={busy} className="px-3 py-1 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 h-9">Add user</button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-300">
        <table className="w-full text-sm min-w-[800px] border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left text-gray-700">
              {['Name', 'Email', 'Access', 'Added by', 'Last signed in', 'Actions'].map(h => (
                <th key={h} className={`px-3 py-2.5 font-semibold border-b border-gray-300 border-r last:border-r-0 whitespace-nowrap ${h === 'Actions' ? 'text-center' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const self = me?.email === u.email;
              return (
                <tr key={u.id} className={`h-7 text-xs ${i % 2 ? 'bg-gray-50' : 'bg-white'}`}>
                  <td className={cell}>{u.name ?? <span className="text-gray-400">Not signed in yet</span>}{self && <span className="text-gray-500"> (you)</span>}</td>
                  <td className={cell}>{u.email}</td>
                  <td className={cell}>
                    <select id={`us-role-${u.id}`} aria-label={`Access for ${u.email}`} value={u.role} disabled={busy}
                      onChange={e => run(() => axios.patch(`${apiUrl}/users/${u.id}`, { role: e.target.value }), `${u.email} is now ${e.target.value === 'Admin' ? 'an Admin' : 'a Viewer'}.`)}
                      className={`rounded border px-1.5 py-0.5 text-xs font-medium ${u.role === 'Admin' ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white text-gray-800'}`}>
                      <option value="Viewer">Viewer</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </td>
                  <td className={cell}>{u.added_by ?? '—'} <span className="text-gray-500">· {when(u.added_at)}</span></td>
                  <td className={cell}>{u.last_sign_in_at ? when(u.last_sign_in_at) : <span className="text-gray-400">Never</span>}</td>
                  <td className={cell}>
                    <div className="flex gap-1.5 justify-center items-center">
                      {!self && confirmRemove !== u.id && (
                        <button onClick={() => setConfirmRemove(u.id)} className={`${small} bg-red-50 text-red-700 hover:bg-red-100`}>Remove</button>
                      )}
                      {confirmRemove === u.id && (
                        <>
                          <span className="font-medium text-red-800">Remove {u.email}?</span>
                          <button onClick={() => run(() => axios.delete(`${apiUrl}/users/${u.id}`), `${u.email} removed. They can't use the app any more.`)} disabled={busy}
                            className={`${small} bg-red-600 text-white hover:bg-red-700 disabled:opacity-60`}>Confirm</button>
                          <button onClick={() => setConfirmRemove(null)} className={`${small} bg-gray-200 text-gray-800 hover:bg-gray-300`}>Cancel</button>
                        </>
                      )}
                      {self && <span className="text-gray-400">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
