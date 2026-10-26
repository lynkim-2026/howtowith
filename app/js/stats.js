// Statistics derived from cards and the review log. Pure functions.
import { dayKey, isNew, isMastered, isDue, State, startOfDay } from './srs.js';

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

// Calendar heat map: `weeks` columns (Mon..Sun rows) ending with the current week.
// Returns [{ day, count, level 0..4, future }] in column-major order.
export function heatmap(reviews, weeks = 5, now = new Date()) {
  const counts = new Map();
  for (const r of reviews) counts.set(r.day, (counts.get(r.day) || 0) + 1);
  const today = startOfDay(now);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset - (weeks - 1) * 7);
  const max = Math.max(1, ...counts.values());
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dayKey(d);
    const count = counts.get(key) || 0;
    const level = count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
    cells.push({ day: key, date: d, count, level, future: d > today });
  }
  return cells;
}

// Remember-rate per day (rating Good/Easy among reviews of cards seen before); null when no such review.
export function accuracySeries(reviews, n = 14, now = new Date()) {
  const by = new Map();
  for (const r of reviews) {
    if (r.prevState === State.New) continue;
    const e = by.get(r.day) || { total: 0, good: 0 };
    e.total++;
    if (r.rating >= 3) e.good++;
    by.set(r.day, e);
  }
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const e = by.get(dayKey(d));
    out.push({ day: dayKey(d), date: d, rate: e ? e.good / e.total : null, total: e ? e.total : 0 });
  }
  return out;
}

// Cards coming due in each of the next `days` days (overdue cards count as today).
export function forecast(cards, days = 7, now = new Date()) {
  const today = startOfDay(now);
  const out = Array.from({ length: days }, (_, i) => ({ date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + i), count: 0 }));
  for (const c of cards) {
    if (isNew(c)) continue;
    const due = startOfDay(c.card.due);
    const idx = Math.max(0, Math.round((due - today) / 86400000));
    if (idx < days) out[idx].count++;
  }
  return out;
}

export function stages(cards) {
  const learning = cards.filter((c) => c.card.state === State.Learning || c.card.state === State.Relearning).length;
  const mastered = cards.filter(isMastered).length;
  const review = cards.filter((c) => c.card.state === State.Review).length - mastered;
  return { fresh: cards.filter(isNew).length, learning, review, mastered };
}
