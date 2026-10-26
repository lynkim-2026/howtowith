// Generate English audio on the PC with a locally running VoiceStudio and link it to the
// expressions in an Excel file. Only expressions without audio yet are generated.
//
//   node scripts/make-audio.mjs Howtowith.xlsx            # generate missing audio
//   node scripts/make-audio.mjs Howtowith.xlsx --dry-run  # just list what is missing
//
// Options: --url http://127.0.0.1:3900   --voice alloy   --format mp3
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readWorkbook, extractSheets } from '../app/js/importer.js';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const file = args.find((a) => !a.startsWith('--') && /\.xlsx$/i.test(a));
if (!file) {
  console.error('usage: node scripts/make-audio.mjs <file.xlsx> [--dry-run] [--url URL] [--voice NAME] [--format mp3|wav]');
  process.exit(1);
}
const base = flag('url', 'http://127.0.0.1:3900').replace(/\/$/, '');
const voice = flag('voice', 'alloy');
const format = flag('format', 'mp3');
const dry = args.includes('--dry-run');

const audioDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'audio');
const indexPath = path.join(audioDir, 'index.json');
fs.mkdirSync(audioDir, { recursive: true });
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {};

async function main() {
  const buf = fs.readFileSync(file);
  const { sheets } = extractSheets(await readWorkbook(new File([buf], path.basename(file))));
  const all = sheets.flatMap((s) => s.rows);
  // Drop index entries whose file vanished so they get regenerated.
  for (const [k, f] of Object.entries(index)) if (!fs.existsSync(path.join(audioDir, f))) delete index[k];
  const todo = all.filter((r) => !index[r.key]);
  console.log(`${all.length} expressions, ${all.length - todo.length} already have audio, ${todo.length} to generate.`);
  if (dry || !todo.length) return 0;

  try {
    await fetch(`${base}/v1/audio/voices`, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(`VoiceStudio is not reachable at ${base}. Start the app first (the app falls back to the phone's built-in voice).`);
    return 2;
  }

  let ok = 0, failed = 0;
  for (const [i, row] of todo.entries()) {
    try {
      const res = await fetch(`${base}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', voice, input: row.en, response_format: format }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 1000) throw new Error('audio too short');
      const name = `${crypto.createHash('sha1').update(row.key).digest('hex').slice(0, 16)}.${format}`;
      fs.writeFileSync(path.join(audioDir, name), bytes);
      index[row.key] = name;
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 1)); // saved per item: safe to interrupt
      ok++;
      console.log(`[${i + 1}/${todo.length}] ${row.en.slice(0, 60)}`);
    } catch (e) {
      failed++;
      console.error(`[${i + 1}/${todo.length}] FAILED (${e.message}): ${row.en.slice(0, 60)}`);
    }
  }
  console.log(`done: ${ok} generated, ${failed} failed. Failed items use the phone's built-in voice.`);
  return failed ? 3 : 0;
}

process.exitCode = await main();
