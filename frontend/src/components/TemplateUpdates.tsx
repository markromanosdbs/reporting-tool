import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

// "Upload job sheet templates": upload a new BUZ job sheet, see what it changes, apply it, roll it back.
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface Target {
  product: string; reportTable: string; reportLabel: string; codes: string[]; templateFile: string;
  current: { ref: string | null; sourceFileName: string | null; orderNo: string | null; appliedBy: string | null; appliedAt: string | null };
}
interface Problem { severity: 'error' | 'warning'; text: string }
interface Check {
  problems: Problem[]; orderNo?: string | null; checkedAgainst?: string | null; seconds?: number; noChanges?: boolean;
  layout?: { columns: number; currentColumns: number; lines: number; lineCodes: string[] };
  columns?: { added: { col: number; heading: string }[]; removed: { col: number; heading: string }[]; renamed: { col: number; from: string; to: string }[]; safe: boolean };
  formulas?: { changed: number; bySheet: { sheet: string; cells: number }[]; componentsColumns: { col: number; heading: string; cells: number }[]; unusedSheets?: string[] };
  values?: { changed: number; bySheet: { sheet: string; cells: number }[] };
  jobSheet?: { lines: number; checked: number; exact: number; notInDason: number; differences: { line: number; heading: string; excel: unknown; engine: unknown }[] };
  live?: { lines: number; calculated: number; failed: number; changedLines: number; changedCells: number; notOnReport: number; moreColumns: number;
    columns: { heading: string; lines: number; examples: { lineKey: string; before: unknown; after: unknown }[] }[] };
}
interface Update {
  id: number; ref: string; kind: 'upload' | 'rollback'; status: string; reportLabel: string; product: string; codes: string[];
  sourceFileName: string | null; orderNo: string | null; hasFile: boolean; rollbackOf: string | null;
  uploadedBy: string | null; uploadedAt: string | null; appliedBy: string | null; appliedAt: string | null;
  discardedBy: string | null; discardedAt: string | null; rolledBackBy: string | null; rolledBackAt: string | null; canRollback: boolean;
  noChanges?: boolean;   // same as the template in use: closed automatically
}
interface UpdateDetail extends Update { check: Check | null; progress: { stage: string; done: number; total: number } | null }

const when = (s: string | null) => s ? new Date(s).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const shown = (v: unknown) => v === null || v === undefined || v === '' ? 'blank' : String(v);
const errorText = (e: unknown) => (axios.isAxiosError(e) && e.response?.data?.error) || 'The server could not be reached. Check your connection and try again.';

const STATUS_STYLE: Record<string, string> = {
  Checking: 'bg-gray-100 text-gray-700', Checked: 'bg-blue-50 text-blue-700', Failed: 'bg-red-50 text-red-700',
  Applied: 'bg-green-50 text-green-700', Replaced: 'bg-gray-100 text-gray-600', Discarded: 'bg-gray-100 text-gray-600', 'Rolled back': 'bg-gray-100 text-gray-600',
};
const STAGES: Record<string, string> = {
  waiting: 'Waiting for the reports to finish calculating',
  reading: 'Reading the job sheet',
  jobsheet: "Checking the job sheet's own lines",
  live: 'Recalculating open jobs with the new template',
};

function StatusPill({ u }: { u: Pick<Update, 'status' | 'kind' | 'noChanges'> }) {
  if (u.noChanges) return <span className="inline-block rounded px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap bg-emerald-50 text-emerald-700">No changes</span>;
  const label = u.kind === 'rollback' && u.status === 'Applied' ? 'Rollback (in use)' : u.status === 'Applied' ? 'Applied (in use)' : u.status;
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap ${STATUS_STYLE[u.status] ?? 'bg-gray-100 text-gray-700'}`}>{label}</span>;
}

function CheckLine({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  const icon = ok ? (warn ? '!' : '✓') : '✕';
  const colour = ok ? (warn ? 'text-amber-600' : 'text-green-600') : 'text-red-600';
  return <div className="flex gap-2"><span className={`${colour} font-bold w-4 shrink-0`} aria-hidden="true">{icon}</span><div className="min-w-0">{children}</div></div>;
}

function CheckResults({ d }: { d: UpdateDetail }) {
  const c = d.check;
  if (d.status === 'Checking' || !c) {
    const p = d.progress;
    return (
      <div className="flex items-center gap-3 text-gray-700">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
        <span>{p ? STAGES[p.stage] ?? 'Checking' : 'Checking'}{p && p.total > 1 ? ` (${p.done} of ${p.total})` : ''}…</span>
      </div>
    );
  }
  const errors = c.problems.filter(p => p.severity === 'error'), warnings = c.problems.filter(p => p.severity === 'warning');
  return (
    <div className="grid gap-3 text-sm">
      {c.problems.length > 0 && (
        <div className="grid gap-1">
          {errors.map((p, i) => <div key={`e${i}`} className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">{p.text}</div>)}
          {warnings.map((p, i) => <div key={`w${i}`} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{p.text}</div>)}
        </div>
      )}
      {c.layout && (
        <CheckLine ok={!errors.some(e => /lines, not|no headings/.test(e.text))}>
          Product and layout: {c.layout.columns} Components columns (now {c.layout.currentColumns})
          {c.layout.lineCodes.length > 0 && <>, lines are {c.layout.lineCodes.join(', ')}</>}
          {c.orderNo && <>, order {c.orderNo}</>}
        </CheckLine>
      )}
      {c.formulas && (
        <CheckLine ok>
          Formulas used by the report: {c.formulas.changed === 0 ? 'no changes' : `${c.formulas.changed} ${c.formulas.changed === 1 ? 'change' : 'changes'}`}
          {c.formulas.componentsColumns.length > 0 && (
            <div className="text-gray-600">Components columns: {c.formulas.componentsColumns.map(x => `${x.heading} (${x.cells})`).join(', ')}</div>
          )}
          {c.formulas.bySheet.filter(s => s.sheet !== 'Components').length > 0 && (
            <div className="text-gray-600">Sheets feeding Components: {c.formulas.bySheet.filter(s => s.sheet !== 'Components').map(s => `${s.sheet} (${s.cells})`).join(', ')}</div>
          )}
          {(c.formulas.unusedSheets?.length ?? 0) > 0 && (
            <div className="text-gray-500">Also different, but not used by the report: {c.formulas.unusedSheets!.join(', ')}</div>
          )}
        </CheckLine>
      )}
      {c.values && (
        <CheckLine ok>
          Lookup lists and tables: {c.values.changed === 0 ? 'no changes' : `${c.values.changed} values changed`}
          {c.values.changed > 0 && <div className="text-gray-600">{c.values.bySheet.map(s => `${s.sheet} (${s.cells})`).join(', ')}</div>}
        </CheckLine>
      )}
      {c.columns && (
        <CheckLine ok={c.columns.safe} warn={c.columns.added.length + c.columns.renamed.length > 0}>
          Columns: {c.columns.added.length + c.columns.removed.length + c.columns.renamed.length === 0 ? 'no new, removed or renamed columns' : (
            <>
              {c.columns.added.length > 0 && <div>New: {c.columns.added.map(a => `${a.col} "${a.heading}"`).join(', ')}</div>}
              {c.columns.removed.length > 0 && <div>Removed: {c.columns.removed.map(a => `${a.col} "${a.heading}"`).join(', ')}</div>}
              {c.columns.renamed.length > 0 && <div>Renamed: {c.columns.renamed.map(a => `${a.col} "${a.from}" → "${a.to}"`).join(', ')}</div>}
            </>
          )}
        </CheckLine>
      )}
      {c.jobSheet && (
        <CheckLine ok={c.jobSheet.checked === 0 || c.jobSheet.exact === c.jobSheet.checked} warn={c.jobSheet.checked === 0}>
          Job sheet check: {c.jobSheet.checked === 0 ? 'no order lines to check' : `${c.jobSheet.exact} of ${c.jobSheet.checked} lines exact`}
          {c.jobSheet.differences.length > 0 && (
            <div className="mt-1 overflow-x-auto">
              <table className="text-xs">
                <thead><tr className="text-left text-gray-500"><th className="pr-3 font-medium">Line</th><th className="pr-3 font-medium">Column</th><th className="pr-3 font-medium">Job sheet</th><th className="font-medium">Calculated</th></tr></thead>
                <tbody>{c.jobSheet.differences.slice(0, 15).map((x, i) => (
                  <tr key={i}><td className="pr-3">{x.line}</td><td className="pr-3">{x.heading}</td><td className="pr-3">{shown(x.excel)}</td><td>{shown(x.engine)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CheckLine>
      )}
      {c.live && (
        <CheckLine ok={c.live.failed === 0}>
          Live report: {c.live.calculated} open lines, {c.live.changedCells === 0 ? 'nothing changes' : `${c.live.changedLines} lines and ${c.live.changedCells} cells change`}
          {c.live.failed > 0 && <>, {c.live.failed} lines could not be calculated</>}
          {c.live.columns.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-gray-600">
              {c.live.columns.map((x, i) => (
                <li key={i}>{x.heading}: {x.lines} {x.lines === 1 ? 'line' : 'lines'}, e.g. {x.examples[0].lineKey} {shown(x.examples[0].before)} → {shown(x.examples[0].after)}</li>
              ))}
              {c.live.moreColumns > 0 && <li>and {c.live.moreColumns} more columns</li>}
            </ul>
          )}
        </CheckLine>
      )}
      {c.seconds !== undefined && <div className="text-xs text-gray-500">Checked in {c.seconds}s against {c.checkedAgainst ?? 'the go-live template'}.</div>}
    </div>
  );
}

export function TemplateUpdates({ username }: { username: string | null }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [report, setReport] = useState('');
  const [product, setProduct] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [detail, setDetail] = useState<UpdateDetail | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWarnings, setConfirmWarnings] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState<number | null>(null);
  const [popup, setPopup] = useState<UpdateDetail | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [t, u] = await Promise.all([axios.get(`${apiUrl}/template-updates/targets`), axios.get(`${apiUrl}/template-updates`)]);
      setTargets(t.data.targets); setUpdates(u.data.updates);
    } catch (e) { setMessage({ kind: 'error', text: errorText(e) }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const reports = useMemo(() => [...new Set(targets.map(t => t.reportLabel))], [targets]);
  const productsForReport = targets.filter(t => t.reportLabel === report);
  const target = targets.find(t => t.product === product);

  const openDetail = useCallback(async (id: number) => {
    try { setDetail((await axios.get(`${apiUrl}/template-updates/${id}`)).data); setConfirmWarnings(false); }
    catch (e) { setMessage({ kind: 'error', text: errorText(e) }); }
  }, []);

  // follow a running check
  useEffect(() => {
    if (!detail || detail.status !== 'Checking') return;
    const t = setTimeout(async () => {
      try {
        const d: UpdateDetail = (await axios.get(`${apiUrl}/template-updates/${detail.id}`)).data;
        setDetail(d);
        if (d.status !== 'Checking') {
          if (d.check?.noChanges) setPopup(d);
          void load();
        }
      } catch (e) { setMessage({ kind: 'error', text: errorText(e) }); }
    }, 2000);
    return () => clearTimeout(t);
  }, [detail, openDetail, load]);

  const upload = async () => {
    setMessage(null);
    if (!username) return setMessage({ kind: 'error', text: 'Enter your name first, so the history shows who uploaded it.' });
    if (!target) return setMessage({ kind: 'error', text: 'Pick a report and product code.' });
    if (!file) return setMessage({ kind: 'error', text: 'Choose the job sheet file (.xlsm) to upload.' });
    setBusy(true);
    try {
      const r = await axios.post(`${apiUrl}/template-updates`, file, {
        params: { product: target.product, fileName: file.name, by: username },
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      setFile(null); if (fileInput.current) fileInput.current.value = '';
      await openDetail(r.data.id); await load();
    } catch (e) { setMessage({ kind: 'error', text: errorText(e) }); }
    finally { setBusy(false); }
  };

  const act = async (id: number, action: 'apply' | 'discard' | 'rollback', done: string) => {
    setMessage(null);
    if (!username) return setMessage({ kind: 'error', text: 'Enter your name first, so the history shows who made the change.' });
    setBusy(true);
    try {
      const r = await axios.post(`${apiUrl}/template-updates/${id}/${action}`, { by: username, confirmWarnings });
      setDetail(r.data); setConfirmRollback(null);
      setMessage({ kind: 'ok', text: done });
      await load();
    } catch (e) { setMessage({ kind: 'error', text: errorText(e) }); }
    finally { setBusy(false); }
  };

  const download = async (id: number) => {
    try {
      const r = await axios.get(`${apiUrl}/template-updates/${id}/file`, { responseType: 'blob' });
      const name = /filename="([^"]+)"/.exec(String(r.headers['content-disposition'] ?? ''))?.[1] ?? 'job-sheet.xlsm';
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) { setMessage({ kind: 'error', text: errorText(e) }); }
  };

  const hasWarnings = !!detail?.check?.problems.some(p => p.severity === 'warning');
  const card = 'bg-white rounded-lg shadow p-5 grid gap-4';
  const cell = 'px-3 py-0 border-b border-r border-gray-200 last:border-r-0 whitespace-nowrap align-middle';
  const small = 'inline-block px-2 py-0.5 rounded text-xs font-medium leading-4';

  return (
    <div className="w-full grid gap-4">
      

      {message && (
        <div className={`rounded border px-4 py-3 ${message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>{message.text}</div>
      )}

      {popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="tu-nochange-title" onClick={() => setPopup(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl grid gap-3" onClick={e => e.stopPropagation()}>
            <h3 id="tu-nochange-title" className="text-lg font-semibold text-gray-900">No changes needed</h3>
            <p className="text-sm text-gray-700">
              {popup.sourceFileName} is the same as the {popup.reportLabel} {popup.codes.join('/')} template in use
              {popup.check?.checkedAgainst ? ` (${popup.check.checkedAgainst})` : ' (go-live template)'}. The report stays as it is.
            </p>
            <p className="text-xs text-gray-500">It's recorded in the history as {popup.ref}, with status "No changes".</p>
            <div className="flex justify-end">
              <button autoFocus onClick={() => setPopup(null)} className="px-3 py-1 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700">OK</button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Upload */}
      <section className={card}>
        <h3 className="text-lg font-semibold text-gray-900">1. Upload a new job sheet</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm text-gray-600">Report
            <select id="tu-report" value={report} onChange={e => { setReport(e.target.value); setProduct(''); }} className="border border-gray-300 rounded px-3 py-2 text-gray-900">
              <option value="">Choose a report</option>
              {reports.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-gray-600">Product code
            <select id="tu-product" value={product} onChange={e => setProduct(e.target.value)} disabled={!report} className="border border-gray-300 rounded px-3 py-2 text-gray-900 disabled:bg-gray-50">
              <option value="">{report ? 'Choose a product code' : 'Choose a report first'}</option>
              {productsForReport.map(t => <option key={t.product} value={t.product}>{t.codes.join(' / ')}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-gray-600">Uploaded by
            <input id="tu-by" value={username ?? ''} readOnly placeholder="Enter your name first" className="border border-gray-300 rounded px-3 py-2 bg-gray-50 text-gray-900" />
          </label>
        </div>
        <label
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
          className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center text-gray-600 cursor-pointer hover:border-blue-400">
          <input id="tu-file" ref={fileInput} type="file" accept=".xlsm,.xlsx" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          {file ? <span className="text-gray-900">{file.name} <span className="text-gray-500">({Math.round(file.size / 1024)} KB)</span></span>
                : <span>Drop the BUZ job sheet here, or click to choose it (.xlsm, exported for a real order)</span>}
        </label>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-gray-500">
            {target ? <>Current template: {target.current.ref ? `${target.current.sourceFileName}${target.current.orderNo ? ` (${target.current.orderNo})` : ''}, from ${target.current.ref}` : 'go-live template'}</> : ' '}
          </span>
          <button onClick={upload} disabled={busy} className="px-3 py-1 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60">Check job sheet</button>
        </div>
      </section>

      {/* 2. Check results */}
      {detail && (
        <section className={card}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-lg font-semibold text-gray-900">
              2. {detail.kind === 'rollback' ? `${detail.ref}: rollback of ${detail.rollbackOf}` : `Check results: ${detail.ref}`}
            </h3>
            <StatusPill u={detail} />
          </div>
          <div className="text-sm text-gray-600">
            {detail.reportLabel} · {detail.codes.join(' / ')} · {detail.sourceFileName}{detail.orderNo ? ` (${detail.orderNo})` : ''}
            {detail.uploadedBy && <> · uploaded by {detail.uploadedBy}, {when(detail.uploadedAt)}</>}
            {detail.appliedBy && <> · applied by {detail.appliedBy}, {when(detail.appliedAt)}</>}
            {detail.rolledBackBy && <> · rolled back by {detail.rolledBackBy}, {when(detail.rolledBackAt)}</>}
            {detail.discardedBy && (detail.noChanges ? <> · closed automatically, {when(detail.discardedAt)}</> : <> · discarded by {detail.discardedBy}, {when(detail.discardedAt)}</>)}
          </div>
          {detail.noChanges && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
              <span className="font-semibold">No changes needed.</span> This job sheet is the same as the template in use, in everything the report uses. Nothing was changed.
            </div>
          )}
          {detail.kind === 'upload' && <CheckResults d={detail} />}
          {(detail.status === 'Checked' || detail.status === 'Failed') && (
            <div className="grid gap-3 border-t border-gray-100 pt-4">
              {detail.status === 'Checked' && hasWarnings && (
                <label className="flex items-center gap-2 text-sm text-amber-900">
                  <input id="tu-confirm" type="checkbox" checked={confirmWarnings} onChange={e => setConfirmWarnings(e.target.checked)} />
                  I've read the warnings above and want to apply this update
                </label>
              )}
              <div className="flex gap-2 justify-end flex-wrap">
                <button onClick={() => act(detail.id, 'discard', `${detail.ref} discarded. Nothing changed.`)} disabled={busy} className="px-3 py-1 text-sm rounded bg-gray-200 text-gray-800 font-medium hover:bg-gray-300 disabled:opacity-60">Discard</button>
                {detail.status === 'Checked' && (
                  <button onClick={() => act(detail.id, 'apply', `${detail.ref} applied. ${detail.reportLabel} ${detail.codes.join('/')} recalculates within a minute.`)}
                    disabled={busy || (hasWarnings && !confirmWarnings)}
                    className="px-3 py-1 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">Apply {detail.ref}</button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3. History */}
      <section className={card}>
        <h3 className="text-lg font-semibold text-gray-900">3. Update history</h3>
        {updates.length === 0 ? (
          <p className="text-sm text-gray-600">No updates yet. Every report uses its go-live template. Uploads show here as update-0001, update-0002, and so on.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-300">
            <table className="w-full text-sm min-w-[760px] border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-700">
                  {['Ref', 'Report', 'Change', 'Uploaded by', 'Applied by', 'Status', 'Actions'].map(h => (
                    <th key={h} className={`px-3 py-2.5 font-semibold border-b border-gray-300 border-r last:border-r-0 whitespace-nowrap ${h === 'Actions' ? 'text-center' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {updates.map((u, i) => {
                  const change = `${u.kind === 'rollback' ? `Rollback of ${u.rollbackOf}: back to ${u.sourceFileName}` : u.sourceFileName ?? ''}${u.orderNo ? ` (${u.orderNo})` : ''}`;
                  const applied = u.appliedBy ? `${u.appliedBy} · ${when(u.appliedAt)}` : '';
                  const rolledBack = u.rolledBackBy ? `Rolled back by ${u.rolledBackBy}, ${when(u.rolledBackAt)}` : '';
                  return (
                    // one line per update, 28px like the report's data rows
                    <tr key={u.id} className={`h-7 text-xs ${detail?.id === u.id ? 'bg-blue-50' : i % 2 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50/60`}>
                      <td className={`${cell} font-mono`}>
                        <button onClick={() => openDetail(u.id)} className="text-blue-700 font-medium hover:underline">{u.ref}</button>
                      </td>
                      <td className={cell}>{u.reportLabel} · {u.codes.join('/')}</td>
                      <td className={`${cell} truncate max-w-[28rem]`} title={change}>{change}</td>
                      <td className={cell}>{u.uploadedBy ? <>{u.uploadedBy} <span className="text-gray-500">· {when(u.uploadedAt)}</span></> : <span className="text-gray-400">—</span>}</td>
                      <td className={cell} title={rolledBack || undefined}>
                        {applied ? <>{u.appliedBy} <span className="text-gray-500">· {when(u.appliedAt)}</span></> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={cell} title={rolledBack || undefined}><StatusPill u={u} /></td>
                      <td className={cell}>
                        <div className="flex gap-1.5 justify-center items-center">
                          {u.hasFile && (
                            <button onClick={() => download(u.id)} className={`${small} bg-blue-600 text-white hover:bg-blue-700`}>Download</button>
                          )}
                          {u.canRollback && confirmRollback !== u.id && (
                            <button onClick={() => setConfirmRollback(u.id)} className={`${small} bg-amber-500 text-white hover:bg-amber-600`}>Roll back</button>
                          )}
                          {confirmRollback === u.id && (
                            <>
                              <span className="font-medium text-amber-800">Roll back {u.ref}?</span>
                              <button onClick={() => act(u.id, 'rollback', `${u.ref} rolled back. ${u.reportLabel} ${u.codes.join('/')} recalculates within a minute.`)} disabled={busy}
                                className={`${small} bg-red-600 text-white hover:bg-red-700 disabled:opacity-60`}>Confirm</button>
                              <button onClick={() => setConfirmRollback(null)} className={`${small} bg-gray-200 text-gray-800 hover:bg-gray-300`}>Cancel</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
