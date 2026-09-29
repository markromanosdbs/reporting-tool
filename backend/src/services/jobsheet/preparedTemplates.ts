import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { JobSheetEngine, PreparedTemplate, TemplateOptions } from './JobSheetEngine.js';

/**
 * Job sheet templates, prepared ahead of time as plain JSON (templates/prepared/<file>.json).
 *
 * Opening an .xlsm with ExcelJS briefly takes up to ~450 MB, and Node keeps that memory for good -
 * too much for the VM (the backend may use 600 MB). So `npm run build` prepares every template, and
 * the server only ever builds engines from the JSON. If a template is replaced later (or a prepared
 * file is missing) it is prepared again in a short-lived child process, whose memory goes when it exits.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_DIR = path.resolve(here, '../../../templates');
const PREPARED_DIR = path.join(TEMPLATE_DIR, 'prepared');
// src/…/preparedTemplates.ts under tsx, dist/…/preparedTemplates.js when built
const PREPARE_SCRIPT = path.join(here, 'prepareTemplatesCli' + path.extname(fileURLToPath(import.meta.url)));

interface PreparedFile { source: string; sourceModifiedAt: number; options: string; template: PreparedTemplate }

const preparedPath = (file: string) => path.join(PREPARED_DIR, file + '.json');
const optionsKey = (options: TemplateOptions) => JSON.stringify({ cycleBreaks: options.cycleBreaks ?? [], arrayArithmetic: !!options.arrayArithmetic });

function readPrepared(file: string, options: TemplateOptions): PreparedTemplate | null {
  try {
    const p: PreparedFile = JSON.parse(fs.readFileSync(preparedPath(file), 'utf8'));
    const current = p.sourceModifiedAt === fs.statSync(path.join(TEMPLATE_DIR, file)).mtimeMs && p.options === optionsKey(options);
    return current ? p.template : null;
  } catch {
    return null;
  }
}

/** Prepare one template and save it (run by `npm run build`, or in a child process by the server). */
export async function prepareTemplateFile(file: string, options: TemplateOptions = {}): Promise<void> {
  const template = await JobSheetEngine.prepareTemplate(path.join(TEMPLATE_DIR, file), options);
  const out: PreparedFile = { source: file, sourceModifiedAt: fs.statSync(path.join(TEMPLATE_DIR, file)).mtimeMs, options: optionsKey(options), template };
  fs.mkdirSync(PREPARED_DIR, { recursive: true });
  fs.writeFileSync(preparedPath(file) + '.tmp', JSON.stringify(out));
  fs.renameSync(preparedPath(file) + '.tmp', preparedPath(file));
}

function prepareInChildProcess(file: string, options: TemplateOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, PREPARE_SCRIPT, file, optionsKey(options)], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`preparing ${file} failed (exit ${code})`)));
  });
}

/** Engine for a template file in backend/templates, built from its prepared JSON. */
export async function loadTemplateEngine(file: string, options: TemplateOptions = {}): Promise<JobSheetEngine> {
  let template = readPrepared(file, options);
  if (!template) {
    console.log(`Preparing job sheet template ${file} (new or changed)...`);
    await prepareInChildProcess(file, options);
    template = readPrepared(file, options);
    if (!template) throw new Error(`Prepared template for ${file} could not be read`);
  }
  return JobSheetEngine.fromPrepared(template);
}
