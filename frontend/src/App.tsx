import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import DataTable from './components/DataTable';
import FilterPanel from './components/FilterPanel';
import { UsernameSetup } from './components/UsernameSetup';
import { CommentsSummary } from './components/CommentsSummary';
import { useUsername } from './hooks/useUsername';
import { useMe, signOut } from './components/AuthGate';
import { Settings, SettingsSection, GearIcon } from './components/Settings';

interface ComponentData {
  [key: string]: any;
}

interface ApiResponse {
  data: ComponentData[];
  total: number;
  skip: number;
  take: number;
  table: string;
}

interface Table {
  name: string;
  label: string;
}

function App() {
  const me = useMe();
  const typed = useUsername();
  // signed in with Microsoft: their name is used everywhere; otherwise (sign-in off) the typed name, as before
  const signedIn = !!me?.signInEnabled;
  const username = signedIn ? me!.name : typed.username;
  const { setUsername } = typed;
  const showSetup = !signedIn && typed.showSetup;
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState(() => {
    try {
      return localStorage.getItem('selectedTable') || 'door_screen_components';
    } catch {
      return 'door_screen_components';
    }
  });
  const [filters, setFilters] = useState({
    search: '',
    product: '',
    customer: '',
  });
  const [page, setPage] = useState(0);
  const [showCommentsSummary, setShowCommentsSummary] = useState(false);
  // Settings lives in the address (#settings, #settings/templates, ...), so a refresh (or a bookmark) stays on it
  const settingsFromHash = (): { open: boolean; section: SettingsSection | null } => {
    const m = window.location.hash.match(/^#settings(?:\/(templates|reconcile|users))?$/);
    return { open: !!m, section: (m?.[1] as SettingsSection) ?? null };
  };
  const [settings, setSettings] = useState(settingsFromHash);
  const openSettings = (section: SettingsSection | null) => {
    window.location.hash = section ? `settings/${section}` : 'settings';
    setSettings({ open: true, section });
  };
  const closeSettings = () => {
    history.pushState(null, '', window.location.pathname + window.location.search);
    setSettings({ open: false, section: null });
  };
  const showSettings = settings.open;
  useEffect(() => {
    const onChange = () => setSettings(settingsFromHash());
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => { window.removeEventListener('hashchange', onChange); window.removeEventListener('popstate', onChange); };
  }, []);
  const pageSize = 100;

  // Save selected table to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('selectedTable', selectedTable);
    } catch {
      // localStorage not available
    }
  }, [selectedTable]);

  // Fetch available tables
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    axios.get(`${apiUrl}/tables`).then((res) => {
      setTables(res.data.tables);
    });
  }, []);

  const { data, isLoading, isError, error } = useQuery<ApiResponse>({
    queryKey: ['data', selectedTable, filters, page],
    queryFn: async () => {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await axios.get(`${apiUrl}/data`, {
        params: {
          table: selectedTable,
          ...filters,
          skip: page * pageSize,
          take: pageSize,
        },
      });
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleTableChange = (tableName: string) => {
    setSelectedTable(tableName);
    setPage(0);
    setFilters({ search: '', product: '', customer: '' });
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setPage(0);
  };

  return (
    <>
      {showSetup && <UsernameSetup onSetUsername={setUsername} />}
      <CommentsSummary
        isOpen={showCommentsSummary}
        onClose={() => setShowCommentsSummary(false)}
        tableName={selectedTable}
      />
      <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="w-full px-2 py-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Components Report
            </h1>
            <p className="text-gray-600 mt-2">
              Davidsons Blinds & Shutters Database
            </p>
          </div>
          <div className="flex items-center gap-3">
          {signedIn && (
            <span className="text-sm text-gray-600 whitespace-nowrap">
              {me!.name} <span className="text-gray-400">· {me!.role}</span>
              <button onClick={() => signOut()} className="ml-2 text-blue-700 hover:underline">Sign out</button>
            </span>
          )}
          <button
            onClick={() => (showSettings ? closeSettings() : openSettings(null))}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-medium whitespace-nowrap"
            aria-label={showSettings ? 'Back to reports' : 'Settings'}
          >
            {showSettings ? 'Back to reports' : <span className="inline-flex items-center gap-1.5"><GearIcon /> Settings</span>}
          </button>
          </div>
        </div>
      </div>

      {showSettings && <Settings section={settings.section} onSelect={openSettings} username={username} role={me?.role ?? 'Viewer'} />}

      {/* Table Tabs */}
      <div className={`bg-white border-b border-gray-200 sticky top-0 z-20 ${showSettings ? 'hidden' : ''}`}>
        <div className="w-full px-2">
          <div className="flex gap-2 overflow-x-auto">
            {tables.map((table) => (
              <button
                key={table.name}
                onClick={() => handleTableChange(table.name)}
                className={`px-4 py-3 font-medium whitespace-nowrap border-b-2 transition ${
                  selectedTable === table.name
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {table.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`w-full px-2 py-2 ${showSettings ? 'hidden' : ''}`}>
        <FilterPanel
          onFilterChange={handleFilterChange}
          isLoading={isLoading}
        />

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-4">
            <p className="text-red-800">
              Error loading data: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}

        {data && (
          <div className="bg-white rounded-lg shadow mt-2">
            <DataTable
              data={data.data}
              total={data.total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              isLoading={isLoading}
              tableName={selectedTable}
              username={username}
              onShowCommentsSummary={() => setShowCommentsSummary(true)}
            />
          </div>
        )}

        {isLoading && (
          <div className="bg-white rounded-lg shadow p-8 mt-2 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading data...</p>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

export default App;
