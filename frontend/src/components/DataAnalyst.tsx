import { useEffect, useState } from 'react';
import axios from 'axios';

interface AnalysisResult {
  table: string;
  missingJobs: Array<{
    buzNo: string;
    lineNo: number;
    inventoryItem: string;
    message: string;
  }>;
  completedJobs: Array<{
    buzNo: string;
    lineNo: number;
    inventoryItem: string;
    productionStatus: string;
    message: string;
  }>;
  totalIssues: number;
}

interface DataAnalystProps {
  tableName: string;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export function DataAnalyst({ tableName, isOpen, onClose, onOpen }: DataAnalystProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPulse, setShowPulse] = useState(true);

  useEffect(() => {
    if (!isOpen || !tableName) return;

    const runAnalysis = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const response = await axios.post(`${apiUrl}/analyst/analyze`, {
          table: tableName,
        });
        setAnalysis(response.data);
        setShowPulse(false);
      } catch (err) {
        console.error('Error running analysis:', err);
        setError('Failed to run analysis');
      } finally {
        setLoading(false);
      }
    };

    runAnalysis();
  }, [tableName, isOpen]);

  return (
    <>
      {/* Floating Avatar Button */}
      {!isOpen && (
        <button
          onClick={onOpen}
          className="fixed bottom-24 right-8 w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-2xl flex items-center justify-center text-2xl transition-all duration-300 hover:scale-110 z-50 border-4 border-white"
          title="Click to open Data Analyst"
        >
          <span className="text-3xl">🤖</span>
          {showPulse && (
            <span className="absolute inset-0 rounded-full bg-blue-400 opacity-75 animate-pulse"></span>
          )}
        </button>
      )}

      {/* Side Panel */}
      {isOpen && (
        <div className="fixed right-0 top-0 h-screen w-96 bg-white border-l border-gray-300 shadow-lg z-40 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h2 className="font-bold">Data Quality Analyst</h2>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-blue-800 rounded p-1 w-8 h-8 flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <div className="animate-spin mb-2">⏳</div>
              <p className="text-gray-600">Analyzing {tableName}...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700">
            {error}
          </div>
        )}

        {analysis && !loading && (
          <div>
            {/* Summary */}
            <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
              <p className="font-semibold text-blue-900">
                Total Issues Found: {analysis.totalIssues}
              </p>
              <p className="text-sm text-blue-700 mt-1">
                {analysis.missingJobs.length} missing • {analysis.completedJobs.length} completed
              </p>
            </div>

            {/* Missing Jobs */}
            {analysis.missingJobs.length > 0 && (
              <div className="mb-4">
                <h3 className="font-bold text-amber-700 mb-2 flex items-center gap-2">
                  <span>⬆️</span> Missing Jobs ({analysis.missingJobs.length})
                </h3>
                <div className="space-y-2">
                  {analysis.missingJobs.map((job, idx) => (
                    <div
                      key={idx}
                      className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded text-sm"
                    >
                      <p className="font-semibold text-amber-900">
                        {job.buzNo}.{job.lineNo}
                      </p>
                      <p className="text-amber-800 text-xs mt-1">{job.inventoryItem}</p>
                      <p className="text-amber-700 italic mt-1">"{job.message}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Jobs */}
            {analysis.completedJobs.length > 0 && (
              <div className="mb-4">
                <h3 className="font-bold text-red-700 mb-2 flex items-center gap-2">
                  <span>✓</span> Completed But Still Here ({analysis.completedJobs.length})
                </h3>
                <div className="space-y-2">
                  {analysis.completedJobs.map((job, idx) => (
                    <div
                      key={idx}
                      className="bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm"
                    >
                      <p className="font-semibold text-red-900">
                        {job.buzNo}.{job.lineNo}
                      </p>
                      <p className="text-red-800 text-xs mt-1">{job.inventoryItem}</p>
                      <p className="text-red-700 text-xs mt-1">
                        Status: {job.productionStatus}
                      </p>
                      <p className="text-red-700 italic mt-1">"{job.message}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.totalIssues === 0 && (
              <div className="bg-green-50 border border-green-200 rounded p-4 text-center">
                <p className="text-green-700 font-semibold">✓ No issues found!</p>
                <p className="text-green-600 text-sm mt-1">
                  This table is in sync with production.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-3 bg-gray-50 text-xs text-gray-600">
        <p>Last checked: {new Date().toLocaleTimeString()}</p>
      </div>
    </div>
      )}
    </>
  );
}
