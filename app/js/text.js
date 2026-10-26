// Text helpers: normalisation, de-duplication keys, answer diffing.

const INVISIBLE = /[​-‍⁠﻿­]/g;

export function clean(value) {
  if (value == null) return '';
  return String(value)
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Key identifying an expression: case, punctuation and spacing are ignored.
export function keyOf(en) {
  return clean(en).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
}

export function hangulRatio(s) {
  const letters = s.match(/\p{L}/gu);
  if (!letters) return 0;
  const hangul = s.match(/[ㄱ-ㆎ가-힣]/g);
  return (hangul ? hangul.length : 0) / letters.length;
}

export function latinRatio(s) {
  const letters = s.match(/\p{L}/gu);
  if (!letters) return 0;
  const latin = s.match(/[A-Za-z]/g);
  return (latin ? latin.length : 0) / letters.length;
}

// Comparable word form: lowercase, punctuation stripped, apostrophes kept.
function norm(token) {
  return token.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

// Word-level comparison of the typed answer against the correct sentence (LCS).
// Returns { score: 0..1, parts: [{ text, ok }] }, one part per word of the correct sentence.
export function compareAnswer(typed, correct) {
  const original = clean(correct).split(' ').filter(Boolean);
  const a = clean(typed).split(' ').map(norm).filter(Boolean);
  const b = original.map(norm);
  if (!original.length) return { score: 0, parts: [] };
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hit = new Set();
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { hit.add(j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return {
    score: hit.size / Math.max(n, m),
    parts: original.map((text, idx) => ({ text, ok: hit.has(idx) })),
  };
}
