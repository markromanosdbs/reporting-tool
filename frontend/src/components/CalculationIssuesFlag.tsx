import { useEffect, useState } from 'react';
import axios from 'axios';
import ROLLER_BLIND_HEADERS from '../config/rollerBlindHeaders.json';
import ROLLER_SHUTTER_HEADERS from '../config/rollerShutterHeaders.json';
import EXTERNAL_BLINDS_HEADERS from '../config/externalBlindsHeaders.json';
import SQUALONET_HEADERS from '../config/squalonetHeaders.json';
import PANEL_GLIDES_HEADERS from '../config/panelGlidesHeaders.json';
import CURTAIN_TRACKS_HEADERS from '../config/curtainTracksHeaders.json';

/**
 * Floating warning for reports calculated from BUZ data: lists lines where the job sheet
 * formulas give #N/A (or another Excel error), with the affected columns. Those cells are
 * blank in the table, so without this flag the problem would go unnoticed.
 */

interface IssueColumn { column: string; header: string; value: string }
interface IssueCause { message: string; lookupValue: string; lookupTable: string; jobSheetColumns: string[] }
interface Issue {
  id: number;
  quote_no: string;
  line_no: number | null;
  quote_ref: string;
  business_name: string;
  dispatch_date: string | null;
  columns: IssueColumn[];
  causes: IssueCause[];
}

// Tables calculated from BUZ data, with their report header labels ([Part No, Group, Label, ...] per column)
const REPORT_HEADERS: Record<string, Record<string, string[]>> = {
  roller_blind_components: ROLLER_BLIND_HEADERS as unknown as Record<string, string[]>,
  roller_shutter_components: ROLLER_SHUTTER_HEADERS as unknown as Record<string, string[]>,
  external_blinds_components: EXTERNAL_BLINDS_HEADERS as unknown as Record<string, string[]>,
  squalonet_retractable_screens: SQUALONET_HEADERS as unknown as Record<string, string[]>,
  panel_glides: PANEL_GLIDES_HEADERS as unknown as Record<string, string[]>,
  curtain_tracks: CURTAIN_TRACKS_HEADERS as unknown as Record<string, string[]>,
};
const COLUMNS_SHOWN = 12; // per line, before "+ n more"

/** "row ID 12" / "IDs 12, 40, 88" / "5 rows" for the collapsed flag */
function rowsLabel(issues: Issue[]): string {
  if (issues.length === 1) return `row ID ${issues[0].id}`;
  if (issues.length <= 3) return `IDs ${issues.map(i => i.id).join(', ')}`;
  return `${issues.length} rows`;
}

/** Column name as the page header shows it, e.g. "Tubes – 38mm Tube". */
function columnLabel(tableName: string, c: IssueColumn): string {
  const h = REPORT_HEADERS[tableName]?.[c.column];
  return h ? [h[1], h[2]].filter(Boolean).join(' – ') : c.header;
}

export function CalculationIssuesFlag({ tableName, refreshKey }: { tableName: string; refreshKey?: unknown }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!REPORT_HEADERS[tableName]) {
      setIssues([]);
      return;
    }
    let cancelled = false;
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    axios.get(`${apiUrl}/issues`, { params: { table: tableName } })
      .then(res => { if (!cancelled) setIssues(res.data.issues || []); })
      .catch(err => console.error('Error fetching calculation issues:', err));
    return () => { cancelled = true; };
  }, [tableName, refreshKey]);

  if (!issues.length) return null;

  const cellCount = issues.reduce((n, i) => n + i.columns.length, 0);
  // the Excel errors present, e.g. "#N/A" or "#N/A / #VALUE!"
  const errorNames = [...new Set(issues.flatMap(i => i.columns.map(c => c.value)))].join(' / ');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-8 left-8 z-50 flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-2xl border-2 border-white hover:bg-red-700"
        title={`Rows where the job sheet shows ${errorNames}`}
      >
        <span aria-hidden="true">⚠</span>
        {errorNames} in {rowsLabel(issues)}
      </button>
    );
  }

  return (
    <div className="fixed bottom-8 left-8 z-50 flex max-h-[70vh] w-[30rem] max-w-[calc(100vw-4rem)] flex-col rounded-lg border border-red-300 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 rounded-t-lg bg-red-600 px-4 py-3 text-white">
        <div>
          <div className="font-semibold">⚠ {errorNames} in {issues.length} {issues.length === 1 ? 'row' : 'rows'} ({cellCount} {cellCount === 1 ? 'cell' : 'cells'})</div>
          <div className="mt-0.5 text-xs text-red-100">
            These cells show {errorNames} on the Excel job sheet too, so they are blank in the table.
            The cause of each is shown below.
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="text-lg leading-none text-white hover:text-red-100" title="Minimise">✕</button>
      </div>
      <div className="overflow-y-auto px-4 py-2">
        {issues.map(issue => {
          const key = `${issue.quote_no}_${issue.line_no}`;
          const showAll = expanded.has(key);
          const cols = showAll ? issue.columns : issue.columns.slice(0, COLUMNS_SHOWN);
          return (
            <div key={key} className="border-b border-gray-200 py-2 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="rounded bg-gray-800 px-1.5 text-xs font-semibold text-white">ID {issue.id}</span>
                <span className="font-semibold text-gray-900">Quote {issue.quote_no}</span>
                <span className="text-gray-700">Line {issue.line_no ?? '-'}</span>
                {issue.dispatch_date && <span className="text-xs text-gray-500">Dispatch {issue.dispatch_date}</span>}
              </div>
              <div className="text-xs text-gray-600">
                Quote Ref: <span className="text-gray-800">{issue.quote_ref || '-'}</span>
                {issue.business_name && <> · {issue.business_name.trim()}</>}
              </div>
              {issue.causes.map(cause => (
                <div key={cause.message} className="mt-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  <span className="font-semibold">Cause:</span> {cause.message}
                  <div className="text-amber-800">
                    Job sheet {cause.jobSheetColumns.length === 1 ? 'column' : 'columns'} affected: {cause.jobSheetColumns.join(', ')}
                  </div>
                </div>
              ))}
              <div className="mt-1.5 text-[11px] text-gray-500">
                {issue.columns.length} {issue.columns.length === 1 ? 'cell shows' : 'cells show'} an error as a result:
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {cols.map(c => (
                  <span key={c.column} className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-800 border border-red-200">
                    {columnLabel(tableName, c)} <span className="font-semibold">{c.value}</span>
                  </span>
                ))}
                {issue.columns.length > COLUMNS_SHOWN && (
                  <button
                    onClick={() => setExpanded(prev => {
                      const next = new Set(prev);
                      if (showAll) next.delete(key); else next.add(key);
                      return next;
                    })}
                    className="text-[11px] text-blue-700 hover:underline"
                  >
                    {showAll ? 'show less' : `+ ${issue.columns.length - COLUMNS_SHOWN} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
