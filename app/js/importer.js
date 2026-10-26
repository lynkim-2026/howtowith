// Excel -> expression rows. Pure functions; file reading lives in `readWorkbook`.
import { clean, keyOf, hangulRatio, latinRatio } from './text.js';

export const LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxRowsPerSheet: 20000,
  maxCellChars: 1000,
  maxCategoryChars: 60,
};

const KO_HEADERS = ['한글', '한국어', '국문', '해석', '뜻', 'korean', 'ko', 'kr'];
const EN_HEADERS = ['영어', '영문', '원문', 'english', 'en'];

// xlsx is a zip: refuse archives that would expand far beyond a normal workbook (zip bombs).
export function checkZipSize(bytes, maxTotal = 100 * 1024 * 1024, maxEntries = 2000) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('올바른 xlsx 파일이 아닙니다.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  if (count > maxEntries) throw new Error('파일 구조가 비정상적입니다.');
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('올바른 xlsx 파일이 아닙니다.');
    total += v.getUint32(p + 24, true);
    if (total > maxTotal) throw new Error('압축을 풀면 너무 큰 파일이라 열 수 없어요.');
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
}

export async function readWorkbook(file) {
  if (!file) throw new Error('파일이 선택되지 않았습니다.');
  if (!/\.xlsx$/i.test(file.name || '')) throw new Error('.xlsx 파일만 올릴 수 있습니다. (.xls는 xlsx로 저장해 주세요)');
  if (file.size > LIMITS.maxBytes) throw new Error('파일이 너무 큽니다. (최대 5MB)');
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head[0] !== 0x50 || head[1] !== 0x4b) throw new Error('올바른 xlsx 파일이 아닙니다.');
  checkZipSize(new Uint8Array(await file.arrayBuffer()));
  const { default: readXlsxFile } = await import('../vendor/read-excel-file.js');
  try {
    return await readXlsxFile(file);
  } catch {
    throw new Error('Excel 파일을 읽을 수 없습니다. 손상되었거나 암호가 걸린 파일일 수 있어요.');
  }
}

function cell(v) {
  if (v == null || v instanceof Date) return '';
  return clean(String(v)).slice(0, LIMITS.maxCellChars);
}

// Decide which columns hold Korean / English: header names first, then content.
export function detectColumns(rows) {
  const sample = rows.slice(0, 200);
  const width = Math.min(Math.max(0, ...sample.map((r) => (r ? r.length : 0))), 30);
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const labels = (rows[r] || []).map((c) => cell(c).toLowerCase());
    const ko = labels.findIndex((l) => KO_HEADERS.includes(l));
    const en = labels.findIndex((l) => EN_HEADERS.includes(l));
    if (ko >= 0 && en >= 0 && ko !== en) return { ko, en, headerRow: r };
  }
  let bestKo = -1, bestEn = -1, koScore = 0.3, enScore = 0.3;
  for (let c = 0; c < width; c++) {
    let hs = 0, ls = 0, n = 0;
    for (const row of sample) {
      const t = cell(row && row[c]);
      if (!t) continue;
      hs += hangulRatio(t); ls += latinRatio(t); n++;
    }
    if (!n) continue;
    if (hs / n > koScore) { koScore = hs / n; bestKo = c; }
    if (ls / n > enScore) { enScore = ls / n; bestEn = c; }
  }
  if (bestKo < 0 || bestEn < 0 || bestKo === bestEn) return null;
  return { ko: bestKo, en: bestEn, headerRow: -1 };
}

// sheets: [{ sheet, data }] -> { sheets: [{ category, rows, ... }], totals }
export function extractSheets(sheets, existingKeys = new Set()) {
  const seen = new Set();
  const out = [];
  const totals = { fresh: 0, existing: 0, duplicateInFile: 0, incomplete: 0, skippedSheets: 0 };
  for (const { sheet, data } of sheets) {
    const category = clean(sheet).slice(0, LIMITS.maxCategoryChars) || '기본';
    const rows = Array.isArray(data) ? data.slice(0, LIMITS.maxRowsPerSheet) : [];
    const cols = detectColumns(rows);
    const result = { category, rows: [], existing: 0, duplicateInFile: 0, incomplete: 0, note: '' };
    out.push(result);
    if (!cols) {
      result.note = '한글/영어 열을 찾지 못해 건너뜀';
      totals.skippedSheets++;
      continue;
    }
    for (let r = cols.headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const ko = cell(row[cols.ko]);
      const en = cell(row[cols.en]);
      if (!ko && !en) continue; // blank row
      const key = keyOf(en);
      if (!ko || !key) { result.incomplete++; totals.incomplete++; continue; }
      if (seen.has(key)) { result.duplicateInFile++; totals.duplicateInFile++; continue; }
      seen.add(key);
      if (existingKeys.has(key)) { result.existing++; totals.existing++; continue; }
      result.rows.push({ key, ko, en, category });
      totals.fresh++;
    }
  }
  return { sheets: out, totals };
}
