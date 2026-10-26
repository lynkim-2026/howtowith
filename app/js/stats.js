// Statistics derived from cards and the review log. Pure functions.
import { dayKey, isNew, isMastered, isDue, State } from './srs.js';

export function reviewDays(reviews) {
  return new Set(reviews.map((r) => r.day));
}

// Consecutive days with at least one review. Today may still be empty.
export function streak(days, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function bestStreak(days) {
  const sorted = [...days].sort();
  let best = 0, run = 0, prev = null;
  for (const k of sorted) {
    const [y, m, d] = k.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d);
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

// Last `n` days (oldest first): [{ day, count, correct }]
export function dailyCounts(reviews, n = 14, now = new Date()) {
  const map = new Map();
  for (const r of reviews) {
    const e = map.get(r.day) || { count: 0, correct: 0 };
    e.count++;
    if (r.rating >= 3) e.correct++;
    map.set(r.day, e);
  }
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(d);
    out.push({ day: k, date: d, ...(map.get(k) || { count: 0, correct: 0 }) });
  }
  return out;
}

export function retention(reviews) {
  const rel = reviews.filter((r) => r.prevState !== State.New);
  if (!rel.length) return null;
  return rel.filter((r) => r.rating >= 3).length / rel.length;
}

export function overview(cards, now = new Date()) {
  const total = cards.length;
  const fresh = cards.filter(isNew).length;
  const learned = total - fresh;
  return {
    total,
    fresh,
    learned,
    mastered: cards.filter(isMastered).length,
    due: cards.filter((c) => isDue(c, now)).length,
    completion: total ? learned / total : 0,
  };
}

export function categoryProgress(cards) {
  const map = new Map();
  for (const c of cards) {
    const e = map.get(c.category) || { category: c.category, total: 0, learned: 0, due: 0 };
    e.total++;
    if (!isNew(c)) e.learned++;
    if (isDue(c)) e.due++;
    map.set(c.category, e);
  }
  return [...map.values()];
}
