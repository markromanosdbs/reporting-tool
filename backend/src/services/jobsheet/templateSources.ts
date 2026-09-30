import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Where each job sheet template is read from. By default that's the go-live copy in backend/templates
 * (tracked in git). Once a template update is applied in the web app ("Upload job sheet templates"),
 * the uploaded job sheet takes over: it is kept in backend/template-updates (not in git, so a code
 * deploy never overwrites it) and in braxreportsDB (see templateUpdates.ts).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_DIR = path.resolve(here, '../../../templates');
export const UPDATES_DIR = path.resolve(here, '../../../template-updates');

interface Source { path: string; changedAt: number; ref: string | null }
const overrides = new Map<string, Source>();
const listeners: ((file: string) => void)[] = [];

/** File a template is read from right now. */
export function templateSourcePath(file: string): string {
  return overrides.get(file)?.path ?? path.join(TEMPLATE_DIR, file);
}

/**
 * When the template last changed (ms): the later of the file's own time and the moment an update or
 * rollback switched it. Lines calculated before this are recalculated - including after a rollback to
 * an older file.
 */
export function templateModifiedAt(file: string): number {
  const o = overrides.get(file);
  const mtime = fs.statSync(templateSourcePath(file)).mtimeMs;
  return o ? Math.max(mtime, o.changedAt) : mtime;
}

/** The update (e.g. 'update-0003') whose job sheet is in use, or null for the go-live template. */
export function templateSourceRef(file: string): string | null {
  return overrides.get(file)?.ref ?? null;
}

/** Point a template at another file (or back to the go-live one with sourcePath = null). */
export function setTemplateSource(file: string, sourcePath: string | null, changedAt: number, ref: string | null): void {
  const before = overrides.get(file);
  overrides.set(file, { path: sourcePath ?? path.join(TEMPLATE_DIR, file), changedAt, ref });
  if (!before || before.path !== overrides.get(file)!.path || before.changedAt !== changedAt) {
    for (const l of listeners) l(file);
  }
}

/** Called when a template's source changes (e.g. Door Screen drops its cached engine). */
export function onTemplateSourceChange(listener: (file: string) => void): void {
  listeners.push(listener);
}
