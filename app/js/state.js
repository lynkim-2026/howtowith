// In-memory mirror of the IndexedDB data plus the few mutations the UI needs.
import * as db from './db.js';
import { grade, newCardState, dayKey } from './srs.js';
import { DEFAULT_SETTINGS } from './backup.js';
import { clean, keyOf } from './text.js';

export const S = {
  cards: [],
  reviews: [],
  settings: { ...DEFAULT_SETTINGS },
  lastBackup: null,
  installEvent: null,
};

export async function load() {
  [S.cards, S.reviews, S.settings, S.lastBackup] = await Promise.all([
    db.getAllCards(), db.getAllReviews(), db.getSettings(), db.getMeta('lastBackup'),
  ]);
  applyTheme();
}

export function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

export async function updateSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  await db.saveSettings(S.settings);
  applyTheme();
}

// Distinct expressions introduced (first reviewed) today.
export function newToday(now = new Date()) {
  const k = dayKey(now);
  return new Set(S.reviews.filter((r) => r.day === k && r.prevState === 0).map((r) => r.key)).size;
}

export function reviewedToday(now = new Date()) {
  const k = dayKey(now);
  return S.reviews.filter((r) => r.day === k).length;
}

export async function rate(rec, rating, mode) {
  const now = new Date();
  const prevState = rec.card.state;
  const { card } = grade(rec.card, rating, now);
  const next = { ...rec, card, lastRating: rating, lastStudied: now.getTime() };
  const review = { key: rec.key, ts: now.getTime(), day: dayKey(now), rating, prevState, mode };
  await db.saveReview(next, review);
  const i = S.cards.findIndex((c) => c.key === rec.key);
  if (i >= 0) S.cards[i] = next;
  S.reviews.push(review);
  return next;
}

export async function addExpressions(rows) {
  let order = S.cards.reduce((m, c) => Math.max(m, c.order ?? 0), -1) + 1;
  const now = Date.now();
  const recs = rows.map((r) => ({
    key: r.key, ko: r.ko, en: r.en, category: r.category, order: order++, createdAt: now,
    lastRating: null, lastStudied: null, card: newCardState(new Date(now)),
  }));
  const added = await db.addCards(recs);
  S.cards = await db.getAllCards();
  return added;
}

// Add expressions published from the PC (data/expressions.json) that are not here yet.
// Expressions the user deleted in the app stay deleted.
export async function syncPublished() {
  let data;
  try {
    const res = await fetch('data/expressions.json', { cache: 'no-cache' });
    if (!res.ok) return 0;
    data = await res.json();
  } catch { return 0; }
  if (!data || !Array.isArray(data.items)) return 0;
  const have = new Set(S.cards.map((c) => c.key));
  const dismissed = new Set(await db.getMeta('dismissed', []));
  const rows = [];
  for (const it of data.items.slice(0, 50000)) {
    const key = keyOf(it && it.en);
    const ko = clean(it && it.ko);
    if (!key || !ko || have.has(key) || dismissed.has(key)) continue;
    have.add(key);
    rows.push({ key, ko, en: clean(it.en).slice(0, 1000), category: clean(it.category).slice(0, 60) || '기본' });
  }
  return rows.length ? addExpressions(rows) : 0;
}

export async function removeCard(key) {
  const dismissed = await db.getMeta('dismissed', []);
  await db.setMeta('dismissed', [...new Set([...dismissed, key])].slice(-5000));
  await db.deleteCards([key]);
  S.cards = S.cards.filter((c) => c.key !== key);
}

export async function markBackup() {
  S.lastBackup = Date.now();
  await db.setMeta('lastBackup', S.lastBackup);
}

export async function reload() {
  await load();
}
