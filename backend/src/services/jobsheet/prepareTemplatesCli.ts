/**
 * Prepare the job sheet templates for the server (see services/jobsheet/preparedTemplates.ts).
 *
 *   node dist/services/jobsheet/prepareTemplatesCli.js                 every template (part of npm run build)
 *   node dist/services/jobsheet/prepareTemplatesCli.js <path> <opts>   one job sheet file (used by the server)
 */
import path from 'path';
import { prepareTemplateFile, TEMPLATE_DIR } from './preparedTemplates.js';
import { PRODUCTS } from './products.js';
import { DOOR_SCREEN_TEMPLATES } from './DoorScreenJobSheet.js';

async function main() {
  const [file, options] = process.argv.slice(2);
  if (file) {
    await prepareTemplateFile(path.resolve(file), options ? JSON.parse(options) : {});
    return;
  }
  const all = new Map<string, { cycleBreaks?: any; arrayArithmetic?: boolean }>();
  for (const f of Object.values(DOOR_SCREEN_TEMPLATES)) all.set(f, {});
  for (const p of PRODUCTS) all.set(p.template, { cycleBreaks: p.cycleBreaks ?? [], arrayArithmetic: p.arrayArithmetic });
  for (const [f, o] of all) {
    const t = Date.now();
    await prepareTemplateFile(path.join(TEMPLATE_DIR, f), o);
    console.log(`prepared ${f} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
