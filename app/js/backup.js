// JSON backup format: serialise, and strictly validate on restore.
// Restored data is untrusted, so every field is rebuilt from a whitelist.
import { clean, keyOf } from './text.js';

export const BACKUP_APP = 'howtowith';
export const BACKUP_VERSION = 1;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_CARDS = 50000;
const MAX_REVIEWS = 500000;

const iso = (d) => (d instanceof Date ? d.toISOString() : null);

export function serialize({ cards, reviews, settings }) {
  return JSON.stringify({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings || {},
    cards: cards.map((c) => ({
      key: c.key, ko: c.ko, en: c.en, category: c.category, order: c.order,
      createdAt: c.createdAt, lastRating: c.lastRating ?? null, lastStudied: c.lastStudied ?? null,
      card: { ...c.card, due: iso(c.card.due), last_review: iso(c.card.last_review) },
    })),
    reviews: reviews.map(({ key, ts, day, rating, prevState, mode }) => ({ key, ts, day, rating, prevState, mode })),
  });
}

const str = (v, max) => (typeof v === 'string' ? clean(v).slice(0, max) : '');
const num = (v, lo, hi, dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const int = (v, lo, hi, dflt) => Math.round(num(v, lo, hi, dflt));
const date = (v) => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

function cleanCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ko = str(raw.ko, 1000);
  const en = str(raw.en, 1000);
  const key = keyOf(en);
  const c = raw.card;
  if (!ko || !key || !c || typeof c !== 'object') return null;
  const due = date(c.due);
  if (!due) return null;
  return {
    key, ko, en,
    category: str(raw.category, 60) || '기본',
    order: int(raw.order, 0, 1e9, 0),
    createdAt: num(raw.createdAt, 0, 8.64e15, Date.now()),
    lastRating: raw.lastRating == null ? null : int(raw.lastRating, 1, 4, 3),
    lastStudied: raw.lastStudied == null ? null : num(raw.lastStudied, 0, 8.64e15, null),
    card: {
      due,
      stability: num(c.stability, 0, 1e5, 0),
      difficulty: num(c.difficulty, 0, 10, 0),
      elapsed_days: int(c.elapsed_days, 0, 1e5, 0),
      scheduled_days: int(c.scheduled_days, 0, 1e5, 0),
      learning_steps: int(c.learning_steps, 0, 100, 0),
      reps: int(c.reps, 0, 1e6, 0),
      lapses: int(c.lapses, 0, 1e6, 0),
      state: int(c.state, 0, 3, 0),
      last_review: date(c.last_review) || undefined,
    },
  };
}

function cleanReview(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = keyOf(str(raw.key, 1000));
  const day = typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : null;
  if (!key || !day || typeof raw.ts !== 'number' || !Number.isFinite(raw.ts)) return null;
  return {
    key, day, ts: raw.ts,
    rating: int(raw.rating, 1, 4, 3),
    prevState: int(raw.prevState, 0, 3, 0),
    mode: str(raw.mode, 20),
  };
}

export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES) throw new Error('백업 파일이 너무 큽니다.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('백업 파일(JSON)을 읽을 수 없습니다.'); }
  if (!data || data.app !== BACKUP_APP) throw new Error('Howtowith 백업 파일이 아닙니다.');
  if (data.version !== BACKUP_VERSION) throw new Error('지원하지 않는 백업 버전입니다.');
  if (!Array.isArray(data.cards) || !Array.isArray(data.reviews)) throw new Error('백업 파일 형식이 올바르지 않습니다.');
  if (data.cards.length > MAX_CARDS || data.reviews.length > MAX_REVIEWS) throw new Error('백업 데이터가 너무 많습니다.');
  const cards = [];
  const seen = new Set();
  for (const raw of data.cards) {
    const c = cleanCard(raw);
    if (c && !seen.has(c.key)) { seen.add(c.key); cards.push(c); }
  }
  const reviews = data.reviews.map(cleanReview).filter(Boolean);
  const s = data.settings && typeof data.settings === 'object' ? data.settings : {};
  return { cards, reviews, settings: cleanSettings(s) };
}

export const DEFAULT_SETTINGS = {
  theme: 'auto', newPerDay: 10, direction: 'ko-en', rate: 1, repeat: 1, voiceURI: '', autoSpeak: false, audioVoice: '',
};

export function cleanSettings(s = {}) {
  const d = DEFAULT_SETTINGS;
  return {
    theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : d.theme,
    newPerDay: int(s.newPerDay, 0, 100, d.newPerDay),
    direction: ['ko-en', 'en-ko', 'mixed'].includes(s.direction) ? s.direction : d.direction,
    rate: num(s.rate, 0.5, 1.5, d.rate),
    repeat: int(s.repeat, 1, 10, d.repeat),
    voiceURI: str(s.voiceURI, 200),
    autoSpeak: s.autoSpeak === true,
    audioVoice: typeof s.audioVoice === 'string' && /^[a-z0-9]{0,12}$/.test(s.audioVoice) ? s.audioVoice : d.audioVoice,
  };
}

// Keep the more advanced record when the same expression exists on both sides.
export function pickNewer(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = a.card.last_review ? a.card.last_review.getTime() : 0;
  const tb = b.card.last_review ? b.card.last_review.getTime() : 0;
  if (ta !== tb) return ta > tb ? a : b;
  return a.card.reps >= b.card.reps ? a : b;
}
