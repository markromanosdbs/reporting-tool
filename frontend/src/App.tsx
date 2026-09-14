import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import DataTable from './components/DataTable';
import FilterPanel from './components/FilterPanel';
import { UsernameSetup } from './components/UsernameSetup';
import { CommentsSummary } from './components/CommentsSummary';
import { useUsername } from './hooks/useUsername';

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
  const { username, setUsername, showSetup, setShowSetup } = useUsername();
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
    axios.get('/api/tables').then((res) => {
      setTables(res.data.tables);
    });
  }, []);

  const { data, isLoading, isError, error } = useQuery<ApiResponse>({
    queryKey: ['data', selectedTable, filters, page],
    queryFn: async () => {
      const response = await axios.get('/api/data', {
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
          <button
            onClick={() => setShowCommentsSummary(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap"
          >
            📋 Comments Summary
          </button>
        </div>
      </div>

      {/* Table Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
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

      <div className="w-full px-2 py-6">
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
          <div className="bg-white rounded-lg shadow mt-6">
            <DataTable
              data={data.data}
              total={data.total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              isLoading={isLoading}
              tableName={selectedTable}
              username={username}
            />
          </div>
        )}

        {isLoading && (
          <div className="bg-white rounded-lg shadow p-8 mt-6 text-center">
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
