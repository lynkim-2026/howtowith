import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clean, keyOf, compareAnswer } from '../app/js/text.js';
import { extractSheets, readWorkbook } from '../app/js/importer.js';

assert.equal(clean('  a​  b\n c '), 'a b c');
assert.equal(keyOf('Here in New York.'), keyOf('here   in new york'));
assert.equal(keyOf('Don’t stop!'), keyOf("don't stop"));

const c = compareAnswer('I like apples', 'I really like apples.');
assert.ok(c.score > 0.7 && c.score < 1);
assert.deepEqual(c.parts.map((p) => p.ok), [true, false, true, true]);
assert.equal(compareAnswer('x', '').score, 0);
assert.equal(compareAnswer("it's fine", "It's fine.").score, 1);

// header-based detection, swapped columns, blank/incomplete/duplicate rows
const sheets = [
  { sheet: 'A', data: [['영어', '한글'], ['Hello there.', '안녕'], [null, null], ['Only english', ''], ['hello there', '중복'], ['Bye', '잘가']] },
  { sheet: 'B', data: [['안녕하세요 반갑습니다', 'Nice to meet you'], ['감사합니다', 'Thank you']] },
  { sheet: 'C', data: [[1, 2], [3, 4]] },
];
const r = extractSheets(sheets, new Set([keyOf('Thank you')]));
assert.equal(r.totals.fresh, 3);
assert.equal(r.totals.duplicateInFile, 1);
assert.equal(r.totals.incomplete, 1);
assert.equal(r.totals.existing, 1);
assert.equal(r.totals.skippedSheets, 1);
assert.equal(r.sheets[0].rows[0].ko, '안녕');
assert.equal(r.sheets[1].rows[0].en, 'Nice to meet you'); // headerless: first row is data

// real file
const buf = fs.readFileSync(new URL('../Howtowith.xlsx', import.meta.url));
const wb = await readWorkbook(new File([buf], 'Howtowith.xlsx'));
const real = extractSheets(wb);
assert.equal(real.sheets.length, 1);
assert.equal(real.sheets[0].category, '시즌1_3화_기억력향상');
assert.equal(real.totals.fresh, 11);

// rejects
await assert.rejects(() => readWorkbook(new File(['x'], 'a.txt')));
await assert.rejects(() => readWorkbook(new File(['not a zip'], 'a.xlsx')));
console.log('logic tests passed');

// zip-bomb guard: a crafted central directory claiming a huge uncompressed size is rejected
import { checkZipSize } from '../app/js/importer.js';
checkZipSize(new Uint8Array(buf)); // real file passes
const bomb = new Uint8Array(buf);
const dv = new DataView(bomb.buffer);
let e = bomb.length - 22; while (dv.getUint32(e, true) !== 0x06054b50) e--;
dv.setUint32(dv.getUint32(e + 16, true) + 24, 0x7fffffff, true);
assert.throws(() => checkZipSize(bomb), /너무 큰/);
console.log('zip guard ok');

// audio index: v2 validation, legacy v1, hostile input
import { parseAudioIndex } from '../app/js/audio-index.js';
const good = parseAudioIndex({ version: 2, voices: [{ id: 'f1', label: '여성', desc: 'x' }, { id: 'BAD ID', label: 'no' }], items: { 'hello': { f1: 'abc123.mp3', zz: 'abc.mp3' }, 'a': { f1: '../evil.mp3' } } });
assert.equal(good.voices.length, 1);
assert.deepEqual(Object.keys(good.items), ['hello']);
assert.deepEqual(Object.keys(good.items.hello), ['f1']);
const legacy = parseAudioIndex({ 'hello': 'abc.mp3', 'x': 'http://evil/x.mp3' });
assert.equal(legacy.voices[0].id, 'default');
assert.deepEqual(Object.keys(legacy.items), ['hello']);
const proto = parseAudioIndex(JSON.parse('{"version":2,"voices":[{"id":"f1","label":"a"}],"items":{"__proto__":{"f1":"x.mp3"},"ok":{"f1":"y.mp3"}}}'));
assert.equal(({}).f1, undefined);
assert.equal(Object.getPrototypeOf(proto.items), null);
assert.deepEqual(parseAudioIndex(null).voices, []);
console.log('audio index ok');
