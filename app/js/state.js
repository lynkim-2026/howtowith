// In-memory mirror of the IndexedDB data plus the few mutations the UI needs.
import * as db from './db.js';
import { grade, newCardState, dayKey } from './srs.js';
import { DEFAULT_SETTINGS } from './backup.js';

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

export async function removeCard(key) {
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
