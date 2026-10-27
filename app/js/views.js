// The five tab screens: home, study hub, list, stats, data.
import { S, reload, updateSettings, addExpressions, removeCard, markBackup, newToday, reviewedToday } from './state.js';
import * as db from './db.js';
import { h, clear, icon, toast, ask, sheet, confirmAction, fmtDue, fmtDate } from './ui.js';
import * as tts from './tts.js';
import { todayQueue, weakQueue, isNew, isDue, isMastered, State, dayKey } from './srs.js';
import { overview, streak, bestStreak, reviewDays, retention, categoryProgress, heatmap, accuracySeries, forecast, stages } from './stats.js';
import { readWorkbook, extractSheets } from './importer.js';
import { serialize, parseBackup } from './backup.js';
import { flame } from './flame.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const speakCard = (c) => tts.speak({ key: c.key, text: c.en }, { rate: S.settings.rate, repeat: 1, voiceURI: S.settings.voiceURI, audioVoice: S.settings.audioVoice });

const DIRECTIONS = [
  { value: 'ko-en', label: '한글 → 영어', desc: '한국어를 보고 영어를 떠올려요' },
  { value: 'en-ko', label: '영어 → 한국어', desc: '영어를 보고 뜻을 떠올려요' },
  { value: 'mixed', label: '섞어서', desc: '문장마다 방향이 달라져요' },
];

// Ask how to study, remember the answer, then start the session.
async function chooseAndStart(mode) {
  const dir = await sheet('어떻게 학습할까요?', DIRECTIONS, S.settings.direction);
  if (!dir) return;
  await updateSettings({ direction: dir });
  location.hash = `#/session/${mode}`;
}

/* ---------------- home ---------------- */
export function homeView() {
  const o = overview(S.cards);
  if (!o.total) {
    return h('div', { class: 'view' },
      h('div', { class: 'empty' },
        h('h2', null, '아직 표현이 없어요'),
        h('p', null, 'PC에서 엑셀을 정리해 반영하면 앱을 열 때 자동으로 들어와요. 지금 바로 쓰려면 엑셀을 직접 올려도 돼요.'),
        h('a', { class: 'btn primary', href: '#/data' }, icon('upload'), '엑셀 올리기')));
  }
  const q = todayQueue(S.cards, { newLimit: S.settings.newPerDay, newToday: newToday() });
  const left = q.queue.length;
  const done = reviewedToday();
  const streakDays = streak(reviewDays(S.reviews));
  const stale = S.reviews.length > 0 && (!S.lastBackup || Date.now() - S.lastBackup > 7 * 86400000);
  const title = done ? (left ? `오늘 ${done}개 학습` : '오늘 학습 끝') : '오늘 학습 전';
  const sub = left ? `남은 표현 ${left}개` : (done ? '내일 또 만나요' : '쉬어가는 날이에요');
  const streakLabel = streakDays ? `${streakDays}일 연속` : '오늘 불을 붙여 보세요';
  return h('div', { class: 'view home' },
    h('p', { class: 'date' }, new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })),
    h('div', { class: 'flame-stage' }, flame(streakDays), h('p', { class: 'streak num' }, streakLabel)),
    h('h1', { class: 'hero' }, title),
    h('p', { class: 'hero-sub' }, sub),
    done && left
      ? h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round((done / (done + left)) * 100), 'aria-label': '오늘 진행률' }, h('i', { id: 'todaybar' }))
      : null,
    h('button', { class: `btn block cta${left ? ' primary' : ''}`, type: 'button', onclick: () => chooseAndStart(left ? 'today' : 'random') }, left ? '학습하기' : '더 학습하기'),
    stale ? h('p', { class: 'meta' }, '아직 백업하지 않았어요 · ', h('a', { href: '#/data' }, '백업하기')) : null);
}

export function afterHome(root) {
  const bar = root.querySelector('#todaybar');
  if (!bar) return;
  const left = todayQueue(S.cards, { newLimit: S.settings.newPerDay, newToday: newToday() }).queue.length;
  const done = reviewedToday();
  requestAnimationFrame(() => { bar.style.width = `${Math.round((done / Math.max(1, done + left)) * 100)}%`; });
}

/* ---------------- study hub ---------------- */
export function studyView() {
  const cards = S.cards;
  const q = todayQueue(cards, { newLimit: S.settings.newPerDay, newToday: newToday() });
  const weak = weakQueue(cards).length;
  const left = q.queue.length;
  const tile = (href, glyph, label, count) => h('a', { class: 'tile', href, 'aria-label': label },
    count ? h('span', { class: 'count num' }, String(count)) : null,
    h('span', { class: 'glyph', 'aria-hidden': 'true' }, glyph),
    h('span', { class: 'label' }, label));
  const cats = categoryProgress(cards);
  return h('div', { class: 'view' },
    h('h1', { class: 'page-title' }, '학습'),
    h('button', { class: 'btn primary block cta-lg', type: 'button', onclick: () => chooseAndStart(left ? 'today' : 'random') },
      h('span', null, '오늘의 학습'), left ? h('span', { class: 'num' }, `${left}개`) : icon('chevron')),
    h('div', { class: 'tiles' },
      tile('#/session/ko-en', '가→A', '한글 → 영어'),
      tile('#/session/en-ko', 'A→가', '영어 → 한국어'),
      tile('#/session/random', icon('shuffle'), '랜덤'),
      tile('#/session/weak', icon('flag'), '틀린 표현', weak)),
    cats.length ? h('div', { class: 'section' },
      h('h2', null, '카테고리'),
      h('div', { class: 'pills' }, cats.map((c) =>
        h('a', { class: `pill${c.due ? ' hot' : ''}`, href: `#/session/cat/${encodeURIComponent(c.category)}` },
          h('span', { class: 'name' }, c.category), h('span', { class: 'num' }, c.due ? `${c.due}` : `${c.learned}/${c.total}`))))) : null);
}

export function afterStudy() {}

/* ---------------- list ---------------- */
const listState = { q: '', cat: '', limit: 100 };

function statusBadge(c) {
  if (isNew(c)) return h('p', { class: 'stat' }, '새 표현');
  if (isDue(c)) return h('p', { class: 'stat due' }, '복습할 차례');
  if (isMastered(c)) return h('p', { class: 'stat mastered' }, '익숙해요');
  return h('p', { class: 'stat' }, `다음 복습 ${fmtDue(c.card.due).replace(/ \(.*\)$/, '')}`);
}

export function listView() {
  const cats = [...new Set(S.cards.map((c) => c.category))];
  const rows = h('ul', { class: 'rows' });
  const more = h('div', { class: 'mt' });
  const info = h('p', { class: 'hint' });

  const search = h('input', {
    type: 'search', placeholder: '영어 또는 한국어 검색', value: listState.q, 'aria-label': '표현 검색',
    autocomplete: 'off', oninput: (e) => { listState.q = e.target.value; listState.limit = 100; paint(); },
  });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': '카테고리' });
  const paintChips = () => clear(chips, ['', ...cats].map((c) =>
    h('button', { class: 'chip', type: 'button', 'aria-pressed': listState.cat === c, onclick: () => { listState.cat = c; listState.limit = 100; paintChips(); paint(); } }, c || '전체')));

  function paint() {
    const q = listState.q.trim().toLowerCase();
    const found = S.cards.filter((c) => (!listState.cat || c.category === listState.cat)
      && (!q || c.en.toLowerCase().includes(q) || c.ko.includes(q))).sort((a, b) => a.order - b.order);
    info.textContent = `${found.length}개 표현`;
    clear(rows, found.slice(0, listState.limit).map(rowFor));
    clear(more, found.length > listState.limit
      ? h('button', { class: 'btn block', type: 'button', onclick: () => { listState.limit += 100; paint(); } }, '더 보기') : null);
  }

  function rowFor(c) {
    let detail = null;
    const li = h('li', null);
    const head = h('div', { class: 'row item' },
      h('button', { class: 'row grow', type: 'button', 'aria-expanded': 'false', onclick: toggle },
        h('div', { class: 'grow' }, h('p', { class: 'en', lang: 'en' }, c.en), h('p', { class: 'ko', lang: 'ko' }, c.ko), statusBadge(c))),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '영어 듣기', onclick: () => speakCard(c) }, icon('speaker')));
    li.append(head);
    function toggle(e) {
      const btn = e.currentTarget;
      if (detail) { detail.remove(); detail = null; btn.setAttribute('aria-expanded', 'false'); return; }
      btn.setAttribute('aria-expanded', 'true');
      const cur = S.cards.find((x) => x.key === c.key) || c;
      detail = h('div', { class: 'detail' },
        h('dl', null,
          h('dt', null, '카테고리'), h('dd', null, cur.category),
          h('dt', null, '학습 횟수'), h('dd', { class: 'num' }, `${cur.card.reps}회 (틀림 ${cur.card.lapses}회)`),
          h('dt', null, '마지막 학습'), h('dd', null, fmtDate(cur.lastStudied)),
          h('dt', null, '다음 복습'), h('dd', null, isNew(cur) ? '아직 시작 전' : fmtDue(cur.card.due))),
        h('div', null, h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirmAction('표현 삭제', '이 표현과 학습 기록이 삭제돼요. 엑셀을 다시 올리면 새 표현으로 추가됩니다.', '삭제', 'danger')) {
            await removeCard(c.key); paint(); toast('삭제했어요');
          }
        } }, icon('trash'), '삭제')));
      li.append(detail);
    }
    return li;
  }

  paintChips();
  paint();
  if (!S.cards.length) {
    return h('div', { class: 'view' }, h('h1', { class: 'page-title' }, '표현 목록'),
      h('div', { class: 'empty' }, h('h2', null, '표현이 없어요'), h('a', { class: 'btn primary', href: '#/data' }, '엑셀 올리기')));
  }
  return h('div', { class: 'view' },
    h('h1', { class: 'page-title' }, '표현 목록'),
    h('div', { class: 'toolbar' }, search, cats.length > 1 ? chips : null),
    info, rows, more);
}

/* ---------------- stats ---------------- */
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [k, x] of Object.entries(attrs || {})) e.setAttribute(k, String(x)); return e; };
const DAY = ['일', '월', '화', '수', '목', '금', '토'];

// Line chart of the daily remember-rate. Days without reviews are skipped, not drawn as 0%.
function accuracyChart(series) {
  const W = 320, H = 120, pad = 6;
  const x = (i) => pad + (i * (W - pad * 2)) / (series.length - 1);
  const y = (r) => H - pad - r * (H - pad * 2);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'line', role: 'img', 'aria-label': '일별 기억 성공률' });
  for (const g of [0, 0.5, 1]) root.append(svg('line', { x1: 0, x2: W, y1: y(g), y2: y(g), class: 'grid' }));
  const pts = series.map((s, i) => (s.rate == null ? null : [x(i), y(s.rate)])).filter(Boolean);
  if (pts.length > 1) root.append(svg('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: 'trace' }));
  for (const p of pts) root.append(svg('circle', { cx: p[0], cy: p[1], r: 3.5, class: 'dot' }));
  return root;
}

export function statsView() {
  const o = overview(S.cards);
  const days = reviewDays(S.reviews);
  const cells = heatmap(S.reviews, 5);
  const weekTotal = cells.slice(-7).reduce((a, c) => a + c.count, 0);
  const activeDays = cells.filter((c) => c.count).length;
  const series = accuracySeries(S.reviews, 14);
  const ret = retention(S.reviews);
  const plan = forecast(S.cards, 7);
  const maxPlan = Math.max(1, ...plan.map((d) => d.count));
  const stage = stages(S.cards);
  const parts = [['새', stage.fresh, 'var(--line)'], ['학습 중', stage.learning, 'var(--hard)'], ['복습', stage.review, 'var(--easy)'], ['익숙', stage.mastered, 'var(--good)']];
  const cats = categoryProgress(S.cards);
  const dayLabel = (d, i) => (i === 0 ? '오늘' : DAY[d.date.getDay()]);

  const heat = h('div', { class: 'heat', role: 'img', 'aria-label': `최근 5주 중 ${activeDays}일 학습` },
    cells.map((c) => h('i', { class: `l${c.future ? 'x' : c.level}`, title: `${c.day} · ${c.count}번` })));
  const dow = h('div', { class: 'dow', 'aria-hidden': 'true' }, ['월', '화', '수', '목', '금', '토', '일'].map((d) => h('span', null, d)));
  const stack = h('div', { class: 'stack', role: 'img', 'aria-label': parts.map(([l, n]) => `${l} ${n}개`).join(', ') },
    parts.map(([, n, c]) => { const i = h('i'); i.style.setProperty('--f', String(n)); i.style.setProperty('background', c); return i; }));

  return h('div', { class: 'view' },
    h('h1', { class: 'page-title' }, '통계'),

    h('section', { class: 'dash' },
      h('div', { class: 'dash-head' }, h('h2', null, '꾸준함'), h('p', { class: 'big num' }, `연속 ${streak(days)}일`)),
      h('div', { class: 'cal' }, dow, heat),
      h('p', { class: 'meta' }, `이번 주 ${weekTotal}번 · 최장 ${bestStreak(days)}일`)),

    h('section', { class: 'dash' },
      h('div', { class: 'dash-head' }, h('h2', null, '기억력'), h('p', { class: 'big num' }, ret == null ? '-' : pct(ret))),
      ret == null ? h('p', { class: 'meta' }, '두 번째 학습부터 그래프가 나타나요.') : accuracyChart(series),
      ret == null ? null : h('p', { class: 'meta' }, '최근 14일 · 기억한 비율 (좋음+쉬움)')),

    h('section', { class: 'dash' },
      h('div', { class: 'dash-head' }, h('h2', null, '앞으로 7일'), h('p', { class: 'big num' }, `${plan.reduce((a, d) => a + d.count, 0)}개`)),
      h('div', { class: 'chart', role: 'img', 'aria-label': '앞으로 7일 학습 예정 개수' },
        plan.map((d) => {
          const col = h('div', { class: `col${d.count ? '' : ' zero'}`, title: `${d.count}개` }, h('i'));
          col.firstChild.style.setProperty('--h', `${Math.round((d.count / maxPlan) * 100)}%`);
          return col;
        })),
      h('div', { class: 'axis' }, plan.map((d, i) => h('span', null, dayLabel(d, i)))),
      stack,
      h('ul', { class: 'legend' }, parts.map(([l, n, c]) => { const li = h('li', null, `${l} ${n}`); li.style.setProperty('--c', c); return li; }))),

    cats.length > 1 ? h('section', { class: 'dash' },
      h('div', { class: 'dash-head' }, h('h2', null, '카테고리')),
      h('dl', { class: 'kv' }, cats.flatMap((c) => [h('dt', null, c.category), h('dd', { class: 'num' }, `${c.learned}/${c.total}`)]))) : null);
}

/* ---------------- data ---------------- */
export function dataView() {
  const previewSlot = h('div');
  const fileIn = h('input', { class: 'file', type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', id: 'xlsx' });
  const restoreIn = h('input', { class: 'file', type: 'file', accept: '.json,application/json', id: 'restore' });
  const audioStatus = h('p', null);
  const storageStatus = h('p', { class: 'hint' });

  fileIn.addEventListener('change', async () => {
    const file = fileIn.files[0];
    fileIn.value = '';
    if (!file) return;
    clear(previewSlot, h('p', { class: 'hint' }, '읽는 중…'));
    try {
      const sheets = await readWorkbook(file);
      const result = extractSheets(sheets, new Set(S.cards.map((c) => c.key)));
      showPreview(result);
    } catch (e) {
      clear(previewSlot, h('p', { class: 'notice' }, e.message));
    }
  });

  function showPreview({ sheets, totals }) {
    const fresh = sheets.flatMap((s) => s.rows);
    clear(previewSlot, h('div', { class: 'preview' },
      h('h3', null, '업로드 미리보기'),
      h('ul', null,
        h('li', null, `새로 추가: ${totals.fresh}개`),
        h('li', null, `이미 있어서 건너뜀: ${totals.existing}개 (학습 기록 유지)`),
        totals.duplicateInFile ? h('li', null, `파일 안 중복: ${totals.duplicateInFile}개`) : null,
        totals.incomplete ? h('li', null, `한글/영어 중 한쪽이 비어 제외: ${totals.incomplete}개`) : null,
        totals.skippedSheets ? h('li', null, `인식 못한 시트: ${totals.skippedSheets}개`) : null),
      h('ul', null, sheets.map((s) => h('li', null, `${s.category} — ${s.note || `새 표현 ${s.rows.length}개`}`))),
      fresh.slice(0, 3).map((r) => h('p', { class: 'sample' }, `${r.ko} / ${r.en}`)),
      h('div', { class: 'grid-gap' },
        h('button', { class: 'btn primary block', type: 'button', disabled: !totals.fresh, onclick: async () => {
          const n = await addExpressions(fresh);
          clear(previewSlot);
          toast(`${n}개 표현을 추가했어요`);
          persist();
          refreshAudio();
        } }, totals.fresh ? `${totals.fresh}개 추가` : '추가할 새 표현이 없어요'),
        h('button', { class: 'btn quiet block', type: 'button', onclick: () => clear(previewSlot) }, '취소'))));
  }

  async function persist() {
    try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* optional */ }
    try {
      const ok = await navigator.storage?.persisted?.();
      storageStatus.textContent = ok ? '' : '브라우저가 저장 공간을 정리할 때 데이터가 지워질 수 있어요.';
    } catch { /* ignore */ }
  }

  async function backup() {
    const text = serialize({ cards: S.cards, reviews: S.reviews, settings: S.settings });
    const blob = new Blob([text], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `howtowith-backup-${dayKey(new Date())}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    await markBackup();
    toast('백업 파일을 저장했어요');
    refreshBackup();
  }

  restoreIn.addEventListener('change', async () => {
    const file = restoreIn.files[0];
    restoreIn.value = '';
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('백업 파일이 너무 큽니다.');
      const data = parseBackup(await file.text());
      const choice = await ask('백업 복원', `표현 ${data.cards.length}개, 학습 기록 ${data.reviews.length}건을 찾았어요.`, [
        { label: '취소', value: null, kind: 'quiet' },
        { label: '합치기', value: 'merge', kind: 'primary' },
        { label: '덮어쓰기', value: 'replace', kind: 'danger' },
      ]);
      if (!choice) return;
      await db.restore(data, choice);
      await reload();
      toast('복원했어요');
      location.hash = '#/home';
    } catch (e) {
      toast(e.message);
    }
  });

  const backupInfo = h('p', { class: 'hint' });
  const refreshBackup = () => { backupInfo.textContent = S.lastBackup ? `마지막 백업: ${fmtDate(S.lastBackup)}` : '아직 백업한 적이 없어요.'; };
  refreshBackup();

  function refreshAudio() {
    const have = S.cards.filter((c) => tts.hasAudio(c.key)).length;
    const total = S.cards.length;
    const missing = total - have;
    clear(audioStatus, tts.audioCount()
      ? `음성 파일 ${have}/${total}개 연결됨${missing ? ` · ${missing}개는 휴대폰 기본 음성으로 읽어요.` : '.'}`
      : 'PC에서 만든 음성 파일이 아직 없어요. 지금은 휴대폰 기본 음성으로 읽어요.');
  }
  refreshAudio();

  async function cacheAudio(btn) {
    if (!('caches' in window)) return toast('이 브라우저는 오프라인 저장을 지원하지 않아요');
    const files = tts.audioFiles();
    btn.disabled = true;
    let n = 0;
    try {
      const cache = await caches.open('howtowith-audio-v1');
      for (const f of files) {
        if (!(await cache.match(f))) await cache.add(f);
        btn.textContent = `저장 중… ${++n}/${files.length}`;
      }
      toast('음성을 오프라인용으로 저장했어요');
    } catch {
      toast('일부 음성을 저장하지 못했어요. 연결을 확인하고 다시 시도하세요.');
    }
    btn.disabled = false;
    btn.textContent = '음성 오프라인 저장';
  }

  const voices = tts.englishVoices();
  const setting = (label, control, note) => h('div', { class: 'setting' }, h('label', null, label), control, note ? h('p', { class: 'hint' }, note) : null);
  const segOf = (key, options) => {
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': key });
    const paint = () => clear(seg, options.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': S.settings[key] === v, onclick: async () => { await updateSettings({ [key]: v }); paint(); } }, label)));
    paint();
    return seg;
  };

  function voiceSeg() {
    const list = tts.audioVoices();
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '목소리' });
    const active = () => (list.find((x) => x.id === S.settings.audioVoice) || list[0]).id;
    const paint = () => clear(seg, list.map((x) => h('button', { type: 'button', 'aria-pressed': active() === x.id, onclick: async () => {
      await updateSettings({ audioVoice: x.id });
      paint();
      const sample = S.cards.find((c) => tts.hasAudio(c.key));
      if (sample) speakCard(sample);
    } }, x.label)));
    paint();
    return seg;
  }

  persist();
  const installBtn = S.installEvent
    ? h('button', { class: 'btn block', type: 'button', onclick: async () => { S.installEvent.prompt(); await S.installEvent.userChoice; S.installEvent = null; installBtn.remove(); } }, '홈 화면에 설치')
    : null;

  return h('div', { class: 'view' },
    h('h1', { class: 'page-title' }, '데이터 관리'),
    h('p', { class: 'page-sub' }, `표현 ${S.cards.length}개 · 카테고리 ${new Set(S.cards.map((c) => c.category)).size}개`),
    h('section', { class: 'group' },
      h('h2', null, '엑셀 업로드'),
      h('p', null, '모든 시트를 읽고, 시트 이름을 카테고리로 써요. 이미 있는 표현은 학습 기록을 그대로 두고 새 표현만 추가해요.'),
      h('label', { class: 'btn primary block', for: 'xlsx' }, icon('upload'), '.xlsx 파일 선택'), fileIn, previewSlot),
    h('section', { class: 'group' },
      h('h2', null, '백업과 복원'),
      h('p', null, '학습 기록은 이 기기의 브라우저에만 저장돼요. 파일로 백업해 두면 기기를 바꾸거나 데이터가 지워져도 되살릴 수 있어요.'),
      h('button', { class: 'btn block', type: 'button', onclick: backup }, icon('download'), '백업 파일 저장'),
      h('label', { class: 'btn block', for: 'restore' }, '백업 파일에서 복원'), restoreIn, backupInfo, storageStatus),
    h('details', { class: 'fold' },
      h('summary', null, '영어 음성'),
      h('div', { class: 'body' },
      audioStatus,
      tts.audioCount() ? h('button', { class: 'btn block', type: 'button', onclick: (e) => cacheAudio(e.currentTarget) }, '음성 오프라인 저장') : null,
      tts.audioCount() ? h('p', { class: 'hint' }, '음성: VoiceStudio(AGPL-3.0) · OmniVoice 모델(CC-BY-NC, 비상업 개인 학습용)') : null,
      tts.audioVoices().length > 1 ? setting('목소리', voiceSeg(), '누르면 바로 들어볼 수 있어요.') : null,
      setting('기본 재생 속도', segOf('rate', [[0.8, '0.8×'], [1, '1×']])),
      setting('반복 횟수', segOf('repeat', [[1, '1번'], [2, '2번'], [3, '3번']])),
      h('div', { class: 'switch' }, h('label', { for: 'auto' }, '자동 재생'),
        h('input', { id: 'auto', type: 'checkbox', checked: S.settings.autoSpeak, onchange: (e) => updateSettings({ autoSpeak: e.target.checked }) })),
      voices.length ? setting('휴대폰 기본 음성 (파일이 없을 때)', h('select', { onchange: (e) => updateSettings({ voiceURI: e.target.value }) },
        voices.map((v) => h('option', { value: v.voiceURI, selected: v.voiceURI === S.settings.voiceURI }, `${v.name} (${v.lang})`)))) : null)),
    h('details', { class: 'fold' },
      h('summary', null, '학습 설정'),
      h('div', { class: 'body' },
      setting('하루 새 표현 수', h('select', { onchange: (e) => updateSettings({ newPerDay: Number(e.target.value) }) },
        [0, 5, 10, 15, 20, 30, 50].map((n) => h('option', { value: n, selected: n === S.settings.newPerDay }, `${n}개`)))),
      setting('화면 테마', segOf('theme', [['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']])),
      installBtn)),
    h('section', { class: 'group' },
      h('h2', null, '모든 데이터 삭제'),
      h('p', null, '표현, 학습 기록, 설정을 이 기기에서 모두 지워요. 먼저 백업하세요.'),
      h('button', { class: 'btn danger block', type: 'button', onclick: async () => {
        if (await confirmAction('모든 데이터 삭제', '되돌릴 수 없어요. 정말 삭제할까요?', '삭제', 'danger')) {
          await db.clearAll(); await reload(); toast('삭제했어요'); location.hash = '#/home';
        }
      } }, icon('trash'), '전체 삭제')));
}
