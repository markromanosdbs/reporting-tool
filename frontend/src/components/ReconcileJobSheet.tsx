import { useRef, useState } from 'react';
import axios from 'axios';

// "Reconcile a job sheet with the report": the job sheet's Components tab against the live report, line by line.
// Checking only - nothing is saved.
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface ReconcileLine {
  line: number; lineKey: string; code: string; descn: string; report: string | null; reportTable: string | null;
  result: 'match' | 'different' | 'not-on-report' | 'not-supported';
  differences: { heading: string; jobSheet: unknown; report: unknown }[];
  compared: number; columns: number;   // component columns with data on either side, of all the report's columns
}
interface ReconcileResult {
  fileName: string; orderNo: string | null; seconds: number;
  summary: { lines: number; match: number; different: number; notOnReport: number; notSupported: number };
  lines: ReconcileLine[];
}

const shown = (v: unknown) => v === null || v === undefined || v === '' ? 'blank' : String(v);
const RESULT: Record<ReconcileLine['result'], { label: (l: ReconcileLine) => string; style: string }> = {
  match: { label: () => 'Match', style: 'bg-emerald-50 text-emerald-700' },
  different: { label: l => `${l.differences.length} ${l.differences.length === 1 ? 'difference' : 'differences'}`, style: 'bg-red-50 text-red-700' },
  'not-on-report': { label: () => 'Not on the report', style: 'bg-gray-100 text-gray-600' },
  'not-supported': { label: () => 'No report for this product', style: 'bg-gray-100 text-gray-600' },
};

/** reportTable/reportName: the report it was opened from (notes a job sheet for another report); onClose: popup close */
export function ReconcileJobSheet({ reportTable, reportName, onClose }: { reportTable?: string; reportName?: string; onClose?: () => void } = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async () => {
    setError(null);
    if (!file) return setError('Choose the job sheet file (.xlsm) to reconcile.');
    setBusy(true); setResult(null);
    try {
      const r = await axios.post(`${apiUrl}/reconcile-jobsheet`, file, { params: { fileName: file.name }, headers: { 'Content-Type': 'application/octet-stream' } });
      setResult(r.data);
    } catch (e) {
      setError((axios.isAxiosError(e) && e.response?.data?.error) || 'The server could not be reached. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  const cell = 'px-3 py-0 border-b border-r border-gray-200 last:border-r-0 whitespace-nowrap align-middle';
  const s = result?.summary;

  return (
    <section className="bg-white rounded-lg shadow p-5 grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Reconcile a job sheet{reportName ? ` with ${reportName}` : ' with the report'}</h3>
          <p className="text-sm text-gray-600">Compares the job sheet's Components tab with the components report, line by line. For checking only: nothing is saved or changed.</p>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>

      <label
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setResult(null); } }}
        className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-600 cursor-pointer hover:border-blue-400">
        <input id="rc-file" ref={fileInput} type="file" accept=".xlsm,.xlsx" className="sr-only" onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
        {file ? <span className="text-gray-900">{file.name} <span className="text-gray-500">({Math.round(file.size / 1024)} KB)</span></span>
              : <span>Drop a BUZ job sheet here, or click to choose it. The report is found from its product code.</span>}
      </label>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-gray-500">{busy ? 'Reading the job sheet and comparing…' : ' '}</span>
        <button onClick={run} disabled={busy} className="px-3 py-1 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60">Reconcile</button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>}

      {result && s && (
        <div className="grid gap-3">
          <div className={`rounded border px-4 py-3 ${s.different ? 'border-red-200 bg-red-50 text-red-800' : s.match ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
            <span className="font-semibold">
              {s.lines === 1
                ? (s.different ? 'The line differs from the report.' : s.match ? 'The line matches the report.' : 'The line is not on the report.')
                : s.different ? `${s.different} of ${s.lines} lines differ from the report.` : s.match === s.lines ? `All ${s.lines} lines match the report.` : `${s.match} of ${s.lines} lines match the report.`}
            </span>{' '}
            {result.fileName}{result.orderNo ? ` (order ${result.orderNo})` : ''}
            {s.notOnReport > 0 && <> · {s.notOnReport} not on the report</>}
            {s.notSupported > 0 && <> · {s.notSupported} with no report</>}
          </div>

          {reportTable && result.lines.some(l => l.reportTable && l.reportTable !== reportTable) && (
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              This job sheet is for {[...new Set(result.lines.filter(l => l.reportTable && l.reportTable !== reportTable).map(l => l.report))].join(', ')}, not {reportName ?? 'this report'}. It was checked against that report instead.
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-300">
            <table className="w-full text-sm min-w-[700px] border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-700">
                  {['Line', 'Report', 'Item', 'Columns checked', 'Result'].map(h => <th key={h} className="px-3 py-2.5 font-semibold border-b border-gray-300 border-r last:border-r-0">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.lines.map((l, i) => (
                  <tr key={l.line} className={`h-7 text-xs ${i % 2 ? 'bg-gray-50' : 'bg-white'}`}>
                    <td className={`${cell} font-mono`}>{l.lineKey}</td>
                    <td className={cell}>{l.report ?? l.code}</td>
                    <td className={`${cell} truncate max-w-[28rem]`} title={l.descn}>{l.descn}</td>
                    <td className={cell}>{l.columns ? <>{l.compared} with data <span className="text-gray-500">(of {l.columns})</span></> : <span className="text-gray-400">—</span>}</td>
                    <td className={cell}><span className={`inline-block rounded px-2 py-0.5 font-medium leading-4 ${RESULT[l.result].style}`}>{RESULT[l.result].label(l)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.lines.some(l => l.differences.length) && (
            <div className="overflow-x-auto rounded-lg border border-gray-300">
              <table className="w-full text-sm min-w-[700px] border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-left text-gray-700">
                    {['Line', 'Column', 'Job sheet', 'Report'].map(h => <th key={h} className="px-3 py-2.5 font-semibold border-b border-gray-300 border-r last:border-r-0">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.lines.flatMap(l => l.differences.map((d, j) => (
                    <tr key={`${l.line}-${j}`} className="h-7 text-xs bg-white">
                      <td className={`${cell} font-mono`}>{l.lineKey}</td>
                      <td className={cell}>{d.heading}</td>
                      <td className={cell}>{shown(d.jobSheet)}</td>
                      <td className={`${cell} font-medium text-red-700`}>{shown(d.report)}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Every component column on the report is compared for each line; columns blank on both sides count as a match. Values are compared the way the job sheet shows them. A difference usually means the order changed in BUZ after the job sheet was printed.
            Lines that are not on the report are finished, cancelled or not open jobs. Checked in {result.seconds}s.
          </p>
        </div>
      )}
    </section>
  );
}
