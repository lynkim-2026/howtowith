// The five tab screens: home, study hub, list, stats, data.
import { S, reload, updateSettings, addExpressions, removeCard, markBackup, newToday, reviewedToday } from './state.js';
import * as db from './db.js';
import { h, clear, icon, toast, ask, confirmAction, fmtDue, fmtDate } from './ui.js';
import * as tts from './tts.js';
import { todayQueue, weakQueue, isNew, isDue, isMastered, State, dayKey } from './srs.js';
import { overview, streak, bestStreak, reviewDays, dailyCounts, retention, categoryProgress } from './stats.js';
import { readWorkbook, extractSheets } from './importer.js';
import { serialize, parseBackup } from './backup.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const speakCard = (c) => tts.speak({ key: c.key, text: c.en }, { rate: S.settings.rate, repeat: 1, voiceURI: S.settings.voiceURI });

function directionSeg(onChange) {
  const opts = [['ko-en', '한 → 영'], ['en-ko', '영 → 한'], ['mixed', '섞어서']];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '출제 방향' });
  const paint = () => clear(seg, opts.map(([v, label]) =>
    h('button', { type: 'button', 'aria-pressed': S.settings.direction === v, onclick: async () => { await updateSettings({ direction: v }); paint(); onChange?.(); } }, label)));
  paint();
  return seg;
}

/* ---------------- home ---------------- */
export function homeView() {
  const o = overview(S.cards);
  if (!o.total) {
    return h('div', { class: 'view' },
      h('h1', { class: 'page-title' }, 'Howtowith'),
      h('div', { class: 'empty' },
        h('h2', null, '아직 표현이 없어요'),
        h('p', null, 'PC에서 엑셀을 정리해 반영하면 앱을 열 때 자동으로 들어와요. 지금 바로 쓰려면 엑셀을 직접 올려도 돼요.'),
        h('a', { class: 'btn primary', href: '#/data' }, icon('upload'), '엑셀 올리기')));
  }
  const q = todayQueue(S.cards, { newLimit: S.settings.newPerDay, newToday: newToday() });
  const left = q.queue.length;
  const done = reviewedToday();
  const days = reviewDays(S.reviews);
  const stale = !S.lastBackup || Date.now() - S.lastBackup > 7 * 86400000;
  return h('div', { class: 'view' },
    h('h1', { class: 'page-title' }, 'Howtowith'),
    h('p', { class: 'page-sub' }, new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })),
    h('div', { class: 'today' },
      left
        ? h('p', { class: 'big num' }, `${left}개`, h('small', null, `복습 ${q.due.length} · 새 표현 ${q.fresh.length}`))
        : h('p', { class: 'big' }, '오늘 복습 끝', h('small', null, done ? `${done}번 복습했어요` : '쉬어가는 날이에요')),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round((done / Math.max(1, done + left)) * 100), 'aria-label': '오늘 진행률' },
        h('i', { id: 'todaybar' })),
      left
        ? h('a', { class: 'btn primary block', href: '#/session/today' }, '오늘의 복습 시작')
        : h('a', { class: 'btn block', href: '#/session/random' }, '랜덤 복습으로 더 하기')),
    h('div', { class: 'section' }, h('h2', null, '출제 방향'), directionSeg()),
    h('dl', { class: 'facts section' },
      h('div', null, h('dt', null, '연속 학습'), h('dd', { class: 'num' }, `${streak(days)}일`)),
      h('div', null, h('dt', null, '학습 완료율'), h('dd', { class: 'num' }, pct(o.completion))),
      h('div', null, h('dt', null, '익숙한 표현'), h('dd', { class: 'num' }, `${o.mastered}개`))),
    stale ? h('p', { class: 'notice' }, '학습 기록을 백업해 두세요. 브라우저 데이터를 지우면 기록이 사라져요. ', h('a', { href: '#/data' }, '백업하기')) : null);
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
  const mode = (href, title, desc, badge) => h('li', null,
    h('a', { class: 'row', href }, h('div', { class: 'grow' }, h('div', { class: 't' }, title), h('div', { class: 'd' }, desc)),
      badge ? h('span', { class: 'badge due' }, badge) : null, h('span', { class: 'chev' }, icon('chevron'))));
  const cats = categoryProgress(cards);
  return h('div', { class: 'view' },
    h('h1', { class: 'page-title' }, '복습'),
    h('p', { class: 'page-sub' }, '방식을 골라 시작하세요.'),
    h('ul', { class: 'rows' },
      mode('#/session/today', '오늘의 복습', '복습할 표현과 새 표현을 자동으로 골라요', q.queue.length ? `${q.queue.length}개` : null),
      mode('#/session/ko-en', '한글 → 영어', '한국어를 보고 영어를 떠올려요 (직접 입력 가능)'),
      mode('#/session/en-ko', '영어 → 한국어', '영어를 보고 뜻을 떠올려요'),
      mode('#/session/random', '랜덤 복습', '저장된 표현에서 무작위로 20개'),
      mode('#/session/weak', '틀린 표현 집중', '어려워했던 표현을 먼저', weak ? `${weak}개` : null)),
    h('div', { class: 'section' },
      h('h2', null, '카테고리별 학습'),
      cats.length
        ? h('ul', { class: 'rows' }, cats.map((c) => h('li', null,
          h('a', { class: 'row', href: `#/session/cat/${encodeURIComponent(c.category)}` },
            h('div', { class: 'grow' }, h('div', { class: 't' }, c.category),
              h('div', { class: 'd num' }, `${c.learned}/${c.total} 학습`),
              h('div', { class: 'bar' }, h('i', { class: 'fill', 'data-p': Math.round((c.learned / c.total) * 100) }))),
            c.due ? h('span', { class: 'badge due' }, `${c.due}개 복습`) : null, h('span', { class: 'chev' }, icon('chevron'))))))
        : h('p', { class: 'hint' }, '엑셀을 올리면 시트 이름이 카테고리가 돼요.')));
}

export function afterStudy(root) {
  for (const el of root.querySelectorAll('.fill')) el.style.width = `${el.dataset.p}%`;
}

/* ---------------- list ---------------- */
const listState = { q: '', cat: '', limit: 100 };

function statusBadge(c) {
  if (isNew(c)) return h('span', { class: 'badge' }, '새 표현');
  if (isDue(c)) return h('span', { class: 'badge due' }, '복습');
  if (isMastered(c)) return h('span', { class: 'badge mastered' }, '익숙');
  return h('span', { class: 'badge' }, fmtDue(c.card.due));
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
        h('div', { class: 'grow' }, h('p', { class: 'en', lang: 'en' }, c.en), h('p', { class: 'ko', lang: 'ko' }, c.ko)),
        statusBadge(c)),
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
export function statsView() {
  const o = overview(S.cards);
  const days = reviewDays(S.reviews);
  const daily = dailyCounts(S.reviews, 14);
  const max = Math.max(1, ...daily.map((d) => d.count));
  const ret = retention(S.reviews);
  const learning = S.cards.filter((c) => c.card.state === State.Learning || c.card.state === State.Relearning).length;
  const review = S.cards.filter((c) => c.card.state === State.Review && !isMastered(c)).length;
  const parts = [
    ['새 표현', o.fresh, 'var(--line)'], ['학습 중', learning, 'var(--hard)'],
    ['복습 단계', review, 'var(--easy)'], ['익숙함', o.mastered, 'var(--good)'],
  ];
  const cats = categoryProgress(S.cards);
  const total7 = daily.slice(-7).reduce((a, d) => a + d.count, 0);
  return h('div', { class: 'view' },
    h('h1', { class: 'page-title' }, '학습 통계'),
    h('dl', { class: 'facts section' },
      h('div', null, h('dt', null, '연속 학습'), h('dd', { class: 'num' }, `${streak(days)}일`)),
      h('div', null, h('dt', null, '최장 기록'), h('dd', { class: 'num' }, `${bestStreak(days)}일`)),
      h('div', null, h('dt', null, '기억 성공률'), h('dd', { class: 'num' }, ret == null ? '-' : pct(ret)))),
    h('div', { class: 'section' },
      h('h2', null, '최근 14일 복습'),
      h('div', { class: 'chart', role: 'img', 'aria-label': `최근 7일 ${total7}번 복습` },
        daily.map((d) => {
          const col = h('div', { class: `col${d.count ? '' : ' zero'}`, title: `${d.day} · ${d.count}번` }, h('i'));
          col.firstChild.style.setProperty('--h', `${Math.round((d.count / max) * 100)}%`);
          return col;
        })),
      h('div', { class: 'axis' }, daily.map((d) => h('span', null, d.date.getDate() === 1 || d === daily[0] ? `${d.date.getMonth() + 1}/${d.date.getDate()}` : String(d.date.getDate()))))),
    h('div', { class: 'section' },
      h('h2', null, `학습 완료율 ${pct(o.completion)}`),
      h('p', { class: 'hint' }, `전체 ${o.total}개 중 ${o.learned}개를 한 번 이상 학습했어요.`),
      (() => {
        const stack = h('div', { class: 'stack mt', role: 'img', 'aria-label': parts.map(([l, n]) => `${l} ${n}개`).join(', ') },
          parts.map(([, n, c]) => { const i = h('i'); i.style.setProperty('--f', String(n)); i.style.setProperty('background', c); return i; }));
        return stack;
      })(),
      h('ul', { class: 'legend' }, parts.map(([l, n, c]) => { const li = h('li', null, `${l} ${n}`); li.style.setProperty('--c', c); return li; }))),
    h('div', { class: 'section' },
      h('h2', null, '카테고리별'),
      cats.length ? h('dl', { class: 'kv' }, cats.flatMap((c) => [h('dt', null, c.category), h('dd', { class: 'num' }, `${c.learned}/${c.total}`)])) : h('p', { class: 'hint' }, '아직 데이터가 없어요.')));
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
      storageStatus.textContent = ok ? '브라우저가 이 앱의 데이터를 보존하도록 허용했어요.' : '브라우저가 저장 공간 정리 시 데이터를 지울 수 있어요. 주기적으로 백업하세요.';
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
      h('button', { class: 'btn primary block', type: 'button', onclick: backup }, icon('download'), '백업 파일 저장'),
      h('label', { class: 'btn block', for: 'restore' }, '백업 파일에서 복원'), restoreIn, backupInfo, storageStatus),
    h('section', { class: 'group' },
      h('h2', null, '영어 음성'),
      audioStatus,
      tts.audioCount() ? h('button', { class: 'btn block', type: 'button', onclick: (e) => cacheAudio(e.currentTarget) }, '음성 오프라인 저장') : null,
      tts.audioCount() ? h('p', { class: 'hint' }, '음성: VoiceStudio(AGPL-3.0) · OmniVoice 모델(CC-BY-NC, 비상업 개인 학습용)') : null,
      setting('기본 재생 속도', segOf('rate', [[0.8, '0.8×'], [1, '1×']])),
      setting('반복 횟수', segOf('repeat', [[1, '1번'], [2, '2번'], [3, '3번']])),
      h('div', { class: 'switch' }, h('label', { for: 'auto' }, '자동 재생'),
        h('input', { id: 'auto', type: 'checkbox', checked: S.settings.autoSpeak, onchange: (e) => updateSettings({ autoSpeak: e.target.checked }) })),
      voices.length ? setting('휴대폰 기본 음성 (파일이 없을 때)', h('select', { onchange: (e) => updateSettings({ voiceURI: e.target.value }) },
        voices.map((v) => h('option', { value: v.voiceURI, selected: v.voiceURI === S.settings.voiceURI }, `${v.name} (${v.lang})`)))) : null),
    h('section', { class: 'group' },
      h('h2', null, '학습 설정'),
      setting('하루 새 표현 수', h('select', { onchange: (e) => updateSettings({ newPerDay: Number(e.target.value) }) },
        [0, 5, 10, 15, 20, 30, 50].map((n) => h('option', { value: n, selected: n === S.settings.newPerDay }, `${n}개`)))),
      setting('화면 테마', segOf('theme', [['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']])),
      installBtn),
    h('section', { class: 'group' },
      h('h2', null, '모든 데이터 삭제'),
      h('p', null, '표현, 학습 기록, 설정을 이 기기에서 모두 지워요. 먼저 백업하세요.'),
      h('button', { class: 'btn danger block', type: 'button', onclick: async () => {
        if (await confirmAction('모든 데이터 삭제', '되돌릴 수 없어요. 정말 삭제할까요?', '삭제', 'danger')) {
          await db.clearAll(); await reload(); toast('삭제했어요'); location.hash = '#/home';
        }
      } }, icon('trash'), '전체 삭제')));
}
