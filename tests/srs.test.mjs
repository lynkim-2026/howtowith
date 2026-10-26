import assert from 'node:assert/strict';
import { newCardState, grade, preview, Rating, State, todayQueue, weakQueue, categoryQueue, isDue, dayKey } from '../app/js/srs.js';
import { streak, bestStreak, dailyCounts, retention, overview, heatmap, accuracySeries, forecast, stages } from '../app/js/stats.js';
import { serialize, parseBackup, pickNewer } from '../app/js/backup.js';

const t0 = new Date(2026, 0, 10, 9, 0, 0);
const mk = (key, category = 'A', order = 0) => ({
  key, ko: '가', en: key, category, order, createdAt: 1, lastRating: null, lastStudied: null, card: newCardState(t0),
});

// FSRS: grades order the next interval; Again on a review card is a lapse
let c = newCardState(t0);
const p = preview(c, t0);
assert.ok(p[Rating.Again].days <= p[Rating.Hard].days);
assert.ok(p[Rating.Hard].days <= p[Rating.Good].days);
assert.ok(p[Rating.Good].days < p[Rating.Easy].days);
let r = grade(c, Rating.Good, t0).card;
assert.equal(r.reps, 1);
assert.ok(r.due > t0);
const later = new Date(r.due.getTime());
const lapsed = grade(r, Rating.Again, later).card;
assert.equal(lapsed.lapses, 1);

// Queues
const cards = [mk('a'), mk('b', 'B', 1), mk('c', 'A', 2), mk('d', 'A', 3)];
cards[0].card = grade(cards[0].card, Rating.Good, new Date(2026, 0, 1)).card; // due long ago
cards[1].card = grade(cards[1].card, Rating.Again, new Date(2026, 0, 1)).card;
cards[1].lastRating = Rating.Again; cards[1].card.lapses = 1;
const q = todayQueue(cards, { newLimit: 1, newToday: 0 }, t0);
assert.equal(q.due.length, 2);
assert.equal(q.fresh.length, 1);
assert.equal(todayQueue(cards, { newLimit: 1, newToday: 1 }, t0).fresh.length, 0);
assert.deepEqual(weakQueue(cards).map((x) => x.key), ['b']);
assert.equal(categoryQueue(cards, 'A', t0)[0].key, 'a');
assert.ok(isDue(cards[0], t0));

// Stats
const day = (n) => dayKey(new Date(2026, 0, n));
const days = new Set([day(8), day(9), day(10)]);
assert.equal(streak(days, t0), 3);
assert.equal(streak(new Set([day(8), day(9)]), t0), 2); // today not yet studied
assert.equal(streak(new Set([day(5)]), t0), 0);
assert.equal(bestStreak(new Set([day(1), day(2), day(5), day(6), day(7)])), 3);
const reviews = [{ day: day(10), rating: 3, prevState: 0 }, { day: day(10), rating: 1, prevState: 2 }, { day: day(9), rating: 4, prevState: 2 }];
assert.equal(dailyCounts(reviews, 3, t0).map((d) => d.count).join(), '0,1,2');
assert.equal(retention(reviews), 0.5);
assert.equal(overview(cards, t0).total, 4);

// Dashboards
const hm = heatmap(reviews, 5, t0);
assert.equal(hm.length, 35);
assert.equal(hm.filter((c) => c.future).length, 1); // t0 is a Saturday: only that Sunday is still ahead
assert.equal(hm.find((c) => c.day === day(10)).count, 2);
assert.equal(hm.find((c) => c.day === day(10)).level, 4);
const acc = accuracySeries([{ day: day(10), rating: 3, prevState: 2 }, { day: day(10), rating: 1, prevState: 2 }, { day: day(10), rating: 4, prevState: 0 }], 3, t0);
assert.equal(acc[2].rate, 0.5);
assert.equal(acc[2].total, 2); // first-time reviews are excluded
assert.equal(acc[0].rate, null);
const fc = forecast(cards, 7, t0);
assert.equal(fc.length, 7);
assert.equal(fc[0].count, 2); // both reviewed cards are overdue -> today
assert.equal(fc.reduce((a, d) => a + d.count, 0), 2);
const sg = stages(cards);
assert.equal(sg.fresh, 2);
assert.equal(sg.fresh + sg.learning + sg.review + sg.mastered, 4);

// Flame level grows with the streak
import { flameLevel } from '../app/js/flame.js';
assert.deepEqual([0, 1, 2, 3, 6, 7, 13, 14, 29, 30, 100].map(flameLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);

// Backup round-trip and hostile input
const text = serialize({ cards, reviews: reviews.map((x, i) => ({ ...x, key: 'a', ts: i, mode: 'today' })), settings: { rate: 9, theme: 'x' } });
const back = parseBackup(text);
assert.equal(back.cards.length, 4);
assert.equal(back.cards[0].card.due instanceof Date, true);
assert.equal(back.settings.rate, 1.5); // clamped
assert.equal(back.settings.theme, 'auto');
assert.equal(back.reviews.length, 3);
assert.throws(() => parseBackup('{"app":"other"}'));
assert.throws(() => parseBackup('nope'));
const evil = JSON.stringify({ app: 'howtowith', version: 1, cards: [{ __proto__: { x: 1 }, ko: '<img src=x onerror=alert(1)>', en: 'ok', card: { due: 'bad' } }, { ko: '가', en: 'Fine', card: { due: '2026-01-01T00:00:00Z', state: 99, stability: 'x' } }], reviews: [{ key: 'k', day: 'nope', ts: 1 }] });
const ev = parseBackup(evil);
assert.equal(ev.cards.length, 1);
assert.equal(ev.cards[0].card.state, 3);
assert.equal(ev.cards[0].card.stability, 0);
assert.equal(ev.reviews.length, 0);
assert.equal(pickNewer(back.cards[0], { ...back.cards[0], card: { ...back.cards[0].card, reps: 99 } }).card.reps, 99);
console.log('srs/stats/backup tests passed');
