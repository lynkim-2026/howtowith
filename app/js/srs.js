// Spaced repetition on top of ts-fsrs, plus review-queue selection.
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from '../vendor/ts-fsrs.mjs';

export { Rating, State };
export const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
export const GRADE_LABEL = { [Rating.Again]: '다시', [Rating.Hard]: '어려움', [Rating.Good]: '좋음', [Rating.Easy]: '쉬움' };

// Days-based scheduling: this is a once-a-day review app, so no minute-level learning steps.
const scheduler = fsrs(generatorParameters({ enable_short_term: false, enable_fuzz: true, request_retention: 0.9, maximum_interval: 365 }));

export const SESSION_SIZE = 20;
export const MASTERED_DAYS = 21;

export function newCardState(now = new Date()) {
  return createEmptyCard(now);
}

// Preview of the four outcomes: { [rating]: { due, days } }
export function preview(card, now = new Date()) {
  const rec = scheduler.repeat(card, now);
  const out = {};
  for (const g of GRADES) {
    const due = rec[g].card.due;
    out[g] = { due, days: Math.max(1, Math.round((due - now) / 86400000)) };
  }
  return out;
}

export function grade(card, rating, now = new Date()) {
  const { card: next, log } = scheduler.next(card, now, rating);
  return { card: next, log };
}

export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function endOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
export function dayKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const isNew = (c) => c.card.state === State.New;
export const isDue = (c, now = new Date()) => !isNew(c) && c.card.due < endOfDay(now);
export const isMastered = (c) => !isNew(c) && c.card.state === State.Review && c.card.scheduled_days >= MASTERED_DAYS;

export function shuffle(list, rnd = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// How "hard" an expression has been for the learner; 0 means no trouble recorded.
export function weakness(c) {
  if (isNew(c)) return 0;
  let s = c.card.lapses * 2;
  if (c.lastRating && c.lastRating <= Rating.Hard) s += c.lastRating === Rating.Again ? 2 : 1;
  if (c.card.difficulty >= 7) s += 1;
  return s;
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

// Cards to study today: everything due, plus new cards up to the daily allowance.
export function todayQueue(cards, { newLimit = 10, newToday = 0 } = {}, now = new Date()) {
  const due = cards.filter((c) => isDue(c, now)).sort((a, b) => a.card.due - b.card.due);
  const fresh = cards.filter(isNew).sort(byOrder).slice(0, Math.max(0, newLimit - newToday));
  return { due, fresh, queue: [...due, ...fresh] };
}

// Direction-only modes: due and new cards first, topped up with random others so a session is never empty.
export function fillQueue(cards, opts, now = new Date()) {
  const { queue } = todayQueue(cards, opts, now);
  const picked = queue.slice(0, SESSION_SIZE);
  if (picked.length >= SESSION_SIZE) return picked;
  const have = new Set(picked.map((c) => c.key));
  return [...picked, ...shuffle(cards.filter((c) => !have.has(c.key))).slice(0, SESSION_SIZE - picked.length)];
}

export function weakQueue(cards) {
  return cards.filter((c) => weakness(c) > 0).sort((a, b) => weakness(b) - weakness(a)).slice(0, SESSION_SIZE);
}

export function randomQueue(cards) {
  return shuffle(cards).slice(0, SESSION_SIZE);
}

// Category study: due first, then new, then the rest in sheet order.
export function categoryQueue(cards, category, now = new Date()) {
  const inCat = cards.filter((c) => c.category === category);
  const due = inCat.filter((c) => isDue(c, now)).sort((a, b) => a.card.due - b.card.due);
  const fresh = inCat.filter(isNew).sort(byOrder);
  const rest = inCat.filter((c) => !isNew(c) && !isDue(c, now)).sort(byOrder);
  return [...due, ...fresh, ...rest].slice(0, SESSION_SIZE);
}
