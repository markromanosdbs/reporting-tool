import type { ReactNode } from 'react';
import { TemplateUpdates } from './TemplateUpdates';
import { UsersSettings } from './UsersSettings';

// Settings page: pick an option, its form opens below. The choice lives in the address
// (#settings/templates, #settings/users), so a refresh keeps it. Settings is for Admins only;
// Reconcile (read-only, for everyone) is on each report, next to Comments and Export.
export type SettingsSection = 'templates' | 'users';

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);

export const GearIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.6-1 3.4.8 2.4 2.4a1.7 1.7 0 0 0 1 2.6c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c1 1.6-.8 3.4-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.6-1c-1.6 1-3.4-.8-2.4-2.4a1.7 1.7 0 0 0-1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 0 0 1-2.6c-1-1.6.8-3.4 2.4-2.4a1.7 1.7 0 0 0 2.6-1.1z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const OPTIONS: { key: SettingsSection; title: string; text: string; icon: ReactNode; adminOnly: boolean }[] = [
  {
    key: 'templates', title: 'Update job sheet template', text: 'Upload a new BUZ job sheet, check what it changes, apply or roll back.', adminOnly: true,
    icon: icon(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 17v-6" /><path d="m9.5 13.5 2.5-2.5 2.5 2.5" /></>),
  },
  {
    key: 'users', title: 'Users', text: 'Who can use the app, and who is an Admin or a Viewer.', adminOnly: true,
    icon: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>),
  },
];

export function Settings({ section, onSelect, username, role }: { section: SettingsSection | null; onSelect: (s: SettingsSection) => void; username: string | null; role: 'Admin' | 'Viewer' }) {
  const options = OPTIONS.filter(o => role === 'Admin' || !o.adminOnly);
  const allowed = options.find(o => o.key === section);
  return (
    <div className="w-full px-2 py-4 grid gap-4">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><GearIcon className="h-6 w-6 text-gray-500" /> Settings</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(o => {
          const active = section === o.key;
          return (
            <button key={o.key} onClick={() => onSelect(o.key)} aria-pressed={active}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                active ? 'border-blue-600 bg-blue-50 text-blue-800 shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/40'}`}>
              <span className={active ? 'text-blue-600' : 'text-gray-400'}>{o.icon}</span>
              <span className="grid gap-0.5">
                <span className="font-semibold text-gray-900">{o.title}</span>
                <span className="text-sm text-gray-600">{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {!section && <p className="text-sm text-gray-500">Choose an option above.</p>}
      {section && !allowed && <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Only Admins can use this. Ask an Admin if you need it.</p>}
      {allowed && section === 'templates' && <TemplateUpdates username={username} />}
      {allowed && section === 'users' && <UsersSettings />}
    </div>
  );
}
