import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { JobSheetEngine, PreparedTemplate, TemplateOptions } from './JobSheetEngine.js';
import { TEMPLATE_DIR, templateSourcePath } from './templateSources.js';

/**
 * Job sheet templates, prepared ahead of time as plain JSON (templates/prepared/<file>.json).
 *
 * Opening an .xlsm with ExcelJS briefly takes up to ~450 MB, and Node keeps that memory for good -
 * too much for the VM (the backend may use 600 MB). So `npm run build` prepares every template, and
 * the server only ever builds engines from the JSON. If a template is replaced later (or a prepared
 * file is missing) it is prepared again in a short-lived child process, whose memory goes when it exits.
 */

export { TEMPLATE_DIR };
const PREPARED_DIR = path.join(TEMPLATE_DIR, 'prepared');
// src/…/preparedTemplates.ts under tsx, dist/…/preparedTemplates.js when built
const PREPARE_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'prepareTemplatesCli' + path.extname(fileURLToPath(import.meta.url)));

interface PreparedFile { source: string; sourceModifiedAt: number; options: string; template: PreparedTemplate }

// keyed by the source file's name: go-live templates and uploaded updates (update-0003__…xlsm) never collide
const preparedPath = (sourcePath: string) => path.join(PREPARED_DIR, path.basename(sourcePath) + '.json');
export const optionsKey = (options: TemplateOptions) => JSON.stringify({ cycleBreaks: options.cycleBreaks ?? [], arrayArithmetic: !!options.arrayArithmetic });

function readPrepared(sourcePath: string, options: TemplateOptions): PreparedTemplate | null {
  try {
    const p: PreparedFile = JSON.parse(fs.readFileSync(preparedPath(sourcePath), 'utf8'));
    const current = p.sourceModifiedAt === fs.statSync(sourcePath).mtimeMs && p.options === optionsKey(options);
    return current ? p.template : null;
  } catch {
    return null;
  }
}

/** Save a prepared template next to the others (for the job sheet at sourcePath). */
export function savePrepared(sourcePath: string, options: TemplateOptions, template: PreparedTemplate): void {
  const out: PreparedFile = { source: path.basename(sourcePath), sourceModifiedAt: fs.statSync(sourcePath).mtimeMs, options: optionsKey(options), template };
  fs.mkdirSync(PREPARED_DIR, { recursive: true });
  fs.writeFileSync(preparedPath(sourcePath) + '.tmp', JSON.stringify(out));
  fs.renameSync(preparedPath(sourcePath) + '.tmp', preparedPath(sourcePath));
}

/** Prepare one job sheet and save it (run by `npm run build`, or in a child process by the server). */
export async function prepareTemplateFile(sourcePath: string, options: TemplateOptions = {}): Promise<void> {
  savePrepared(sourcePath, options, await JobSheetEngine.prepareTemplate(sourcePath, options));
}

function prepareInChildProcess(sourcePath: string, options: TemplateOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, PREPARE_SCRIPT, sourcePath, optionsKey(options)], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`preparing ${path.basename(sourcePath)} failed (exit ${code})`)));
  });
}

/** The prepared form of a job sheet file, preparing it (in a child process) when needed. */
export async function loadPrepared(sourcePath: string, options: TemplateOptions = {}): Promise<PreparedTemplate> {
  let template = readPrepared(sourcePath, options);
  if (!template) {
    console.log(`Preparing job sheet template ${path.basename(sourcePath)} (new or changed)...`);
    await prepareInChildProcess(sourcePath, options);
    template = readPrepared(sourcePath, options);
    if (!template) throw new Error(`Prepared template for ${path.basename(sourcePath)} could not be read`);
  }
  return template;
}

/** Engine for a template (e.g. 'RollerBlinds_Template.xlsm'), from whichever job sheet it currently uses. */
export async function loadTemplateEngine(file: string, options: TemplateOptions = {}): Promise<JobSheetEngine> {
  return JobSheetEngine.fromPrepared(await loadPrepared(templateSourcePath(file), options));
}
