// Convert the Excel file on this PC into app/data/expressions.json, which the app
// reads on start-up to add new expressions by itself.
//
//   node scripts/publish-data.mjs Howtowith.xlsx          # write the JSON
//   node scripts/publish-data.mjs Howtowith.xlsx --push   # ...and commit + push it (and app/audio)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readWorkbook, extractSheets } from '../app/js/importer.js';

const args = process.argv.slice(2);
const file = args.find((a) => /\.xlsx$/i.test(a));
if (!file) {
  console.error('usage: node scripts/publish-data.mjs <file.xlsx> [--push]');
  process.exit(1);
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'app', 'data', 'expressions.json');

async function main() {
  const buf = fs.readFileSync(file);
  const { sheets, totals } = extractSheets(await readWorkbook(new File([buf], path.basename(file))));
  const items = sheets.flatMap((s) => s.rows.map(({ key, ko, en, category }) => ({ key, ko, en, category })));
  if (!items.length) {
    console.error('No expressions found in the workbook; nothing written.');
    return 1;
  }
  for (const s of sheets) console.log(`${s.category}: ${s.rows.length} expressions${s.note ? ` (${s.note})` : ''}`);
  if (totals.duplicateInFile || totals.incomplete) {
    console.log(`skipped: ${totals.duplicateInFile} duplicates, ${totals.incomplete} incomplete rows`);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const next = JSON.stringify({ version: 1, items }, null, 1) + '\n';
  const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (prev === next) console.log('app/data/expressions.json is already up to date.');
  else { fs.writeFileSync(out, next); console.log(`wrote ${items.length} expressions to app/data/expressions.json`); }

  if (!args.includes('--push')) return 0;
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  git('add', 'app/data', 'app/audio');
  if (!git('status', '--porcelain', 'app/data', 'app/audio').trim()) { console.log('nothing to commit.'); return 0; }
  git('commit', '-m', `Update expressions (${items.length})`);
  console.log(git('push').trim() || 'pushed. The app updates in a few minutes after the Pages deploy finishes.');
  return 0;
}

process.exitCode = await main();
