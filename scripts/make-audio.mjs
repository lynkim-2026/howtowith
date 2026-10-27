// Generate English audio on the PC with a locally running VoiceStudio and link it to the
// expressions in an Excel file, in several voices. Only missing (expression, voice) pairs are generated.
//
//   node scripts/make-audio.mjs Howtowith.xlsx            # generate what is missing
//   node scripts/make-audio.mjs Howtowith.xlsx --dry-run  # just list what is missing
//
// Options: --url http://127.0.0.1:3900   --format mp3
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readWorkbook, extractSheets } from '../app/js/importer.js';

// Voices offered in the app. `instruct` uses OmniVoice's voice-design tags (gender, age, pitch,
// accent); the fixed `seed` keeps each voice stable from one sentence to the next.
export const VOICES = [
  { id: 'f1', label: '여성', desc: '젊은 성인 · 미국 영어', instruct: 'female, young adult, moderate pitch, american accent', seed: 11 },
  { id: 'm1', label: '남성', desc: '젊은 성인 · 미국 영어', instruct: 'male, young adult, moderate pitch, american accent', seed: 22 },
  { id: 'm2', label: '저음 남성', desc: '중년 · 낮은 음 · 미국 영어', instruct: 'male, middle-aged, low pitch, american accent', seed: 33 },
];

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const file = args.find((a) => !a.startsWith('--') && /\.xlsx$/i.test(a));
if (!file) {
  console.error('usage: node scripts/make-audio.mjs <file.xlsx> [--dry-run] [--url URL] [--format mp3|wav]');
  process.exit(1);
}
const base = flag('url', 'http://127.0.0.1:3900').replace(/\/$/, '');
const format = flag('format', 'mp3');
const dry = args.includes('--dry-run');

const audioDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'audio');
const indexPath = path.join(audioDir, 'index.json');
fs.mkdirSync(audioDir, { recursive: true });

function loadIndex() {
  const empty = { version: 2, voices: VOICES.map(({ id, label, desc }) => ({ id, label, desc })), items: {} };
  if (!fs.existsSync(indexPath)) return { index: empty, migrated: false };
  const old = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (old.version !== 2) return { index: empty, migrated: Object.keys(old).length > 0 }; // legacy single-voice files are replaced
  old.voices = empty.voices;
  return { index: old, migrated: false };
}

async function main() {
  const { index, migrated } = loadIndex();
  const buf = fs.readFileSync(file);
  const { sheets } = extractSheets(await readWorkbook(new File([buf], path.basename(file))));
  const all = sheets.flatMap((s) => s.rows);
  const exists = (f) => f && fs.existsSync(path.join(audioDir, f));
  const todo = [];
  for (const voice of VOICES) {
    for (const row of all) if (!exists(index.items[row.key]?.[voice.id])) todo.push({ voice, row });
  }
  console.log(`${all.length} expressions x ${VOICES.length} voices: ${all.length * VOICES.length - todo.length} exist, ${todo.length} to generate.`);
  if (dry || !todo.length) return 0;

  try {
    await fetch(`${base}/v1/audio/voices`, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(`VoiceStudio is not reachable at ${base}. Start the app first (the app falls back to the phone's built-in voice).`);
    return 2;
  }

  let ok = 0, failed = 0;
  for (const [i, { voice, row }] of todo.entries()) {
    try {
      const res = await fetch(`${base}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', voice: 'alloy', input: row.en, instruct: voice.instruct, seed: voice.seed, response_format: format }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 1000) throw new Error('audio too short');
      const name = `${crypto.createHash('sha1').update(`${row.key}|${voice.id}`).digest('hex').slice(0, 16)}.${format}`;
      fs.writeFileSync(path.join(audioDir, name), bytes);
      (index.items[row.key] ??= {})[voice.id] = name;
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 1)); // saved per item: safe to interrupt
      ok++;
      console.log(`[${i + 1}/${todo.length}] ${voice.label}: ${row.en.slice(0, 50)}`);
    } catch (e) {
      failed++;
      console.error(`[${i + 1}/${todo.length}] FAILED (${voice.label}, ${e.message}): ${row.en.slice(0, 50)}`);
    }
  }

  if (migrated) { // remove files that belonged to the old single-voice index
    const used = new Set(Object.values(index.items).flatMap((e) => Object.values(e)));
    for (const f of fs.readdirSync(audioDir)) if (/\.(mp3|wav|ogg)$/i.test(f) && !used.has(f)) fs.unlinkSync(path.join(audioDir, f));
  }
  console.log(`done: ${ok} generated, ${failed} failed. Failed items use the phone's built-in voice.`);
  return failed ? 3 : 0;
}

process.exitCode = await main();
