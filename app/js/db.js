// IndexedDB storage: cards, review log, meta (settings, backup date).
import { DEFAULT_SETTINGS, cleanSettings, pickNewer } from './backup.js';

const NAME = 'howtowith';
const VERSION = 1;
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('cards', { keyPath: 'key' }).createIndex('category', 'category');
      db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true }).createIndex('day', 'day');
      db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

async function tx(stores, mode, fn) {
  const db = await open();
  const t = db.transaction(stores, mode);
  const out = fn(t);
  await done(t);
  return out;
}

export const getAllCards = async () => wrap((await open()).transaction('cards').objectStore('cards').getAll());
export const getAllReviews = async () => wrap((await open()).transaction('reviews').objectStore('reviews').getAll());

// Insert cards that do not exist yet; existing records (and their history) are never touched.
export async function addCards(rows) {
  const db = await open();
  const t = db.transaction('cards', 'readwrite');
  const store = t.objectStore('cards');
  let added = 0;
  for (const r of rows) {
    const req = store.add(r);
    req.onsuccess = () => { added++; };
    req.onerror = (e) => { e.preventDefault(); }; // already present
  }
  await done(t);
  return added;
}

// A review updates the card and appends to the log in one transaction.
export async function saveReview(cardRecord, review) {
  await tx(['cards', 'reviews'], 'readwrite', (t) => {
    t.objectStore('cards').put(cardRecord);
    t.objectStore('reviews').add(review);
  });
}

export async function deleteCards(keys) {
  await tx('cards', 'readwrite', (t) => { for (const k of keys) t.objectStore('cards').delete(k); });
}

export async function getMeta(k, fallback = null) {
  const row = await wrap((await open()).transaction('meta').objectStore('meta').get(k));
  return row ? row.v : fallback;
}
export const setMeta = (k, v) => tx('meta', 'readwrite', (t) => { t.objectStore('meta').put({ k, v }); });

export async function getSettings() {
  return cleanSettings({ ...DEFAULT_SETTINGS, ...(await getMeta('settings', {})) });
}
export const saveSettings = (s) => setMeta('settings', cleanSettings(s));

// mode 'merge' keeps what exists and adds/advances from the backup; 'replace' wipes first.
export async function restore({ cards, reviews, settings }, mode) {
  const db = await open();
  const existing = mode === 'replace' ? [] : await getAllCards();
  const byKey = new Map(existing.map((c) => [c.key, c]));
  const knownReviews = new Set();
  if (mode !== 'replace') for (const r of await getAllReviews()) knownReviews.add(`${r.key}|${r.ts}`);
  const t = db.transaction(['cards', 'reviews', 'meta'], 'readwrite');
  if (mode === 'replace') { t.objectStore('cards').clear(); t.objectStore('reviews').clear(); }
  for (const c of cards) t.objectStore('cards').put(pickNewer(byKey.get(c.key), c));
  for (const r of reviews) {
    if (!knownReviews.has(`${r.key}|${r.ts}`)) t.objectStore('reviews').add(r);
  }
  if (mode === 'replace') t.objectStore('meta').put({ k: 'settings', v: settings });
  await done(t);
}

export async function clearAll() {
  await tx(['cards', 'reviews', 'meta'], 'readwrite', (t) => {
    t.objectStore('cards').clear(); t.objectStore('reviews').clear(); t.objectStore('meta').clear();
  });
}
