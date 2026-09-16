import { useState } from 'react';

interface FilterPanelProps {
  onFilterChange: (filters: {
    search: string;
    product: string;
    customer: string;
  }) => void;
  isLoading: boolean;
}

export default function FilterPanel({ onFilterChange, isLoading }: FilterPanelProps) {
  const [search, setSearch] = useState('');

  const handleApplyFilters = () => {
    onFilterChange({
      search,
      product: '',
      customer: '',
    });
  };

  const handleReset = () => {
    setSearch('');
    onFilterChange({
      search: '',
      product: '',
      customer: '',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow p-3">
      <div className="mb-2">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Search by Quote No
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Enter quote no..."
          className="w-full px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleApplyFilters}
          disabled={isLoading}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Search
        </button>
        <button
          onClick={handleReset}
          disabled={isLoading}
          className="px-3 py-1 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
