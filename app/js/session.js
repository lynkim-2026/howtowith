// Review session: question -> reveal -> rate (Again / Hard / Good / Easy).
import { S, rate, newToday, updateSettings } from './state.js';
import { h, clear, icon, sheet, fmtInterval } from './ui.js';
import * as tts from './tts.js';
import { Rating, GRADES, GRADE_LABEL, preview, todayQueue, fillQueue, weakQueue, randomQueue, categoryQueue } from './srs.js';
import { compareAnswer } from './text.js';
import { streak, reviewDays } from './stats.js';

export const MODES = {
  today: { title: '오늘의 학습' },
  'ko-en': { title: '한글 → 영어', dir: 'ko-en' },
  'en-ko': { title: '영어 → 한국어', dir: 'en-ko' },
  random: { title: '랜덤 학습' },
  weak: { title: '틀린 표현 집중' },
  cat: { title: '카테고리 학습' },
};

function buildQueue(mode, cat) {
  const opts = { newLimit: S.settings.newPerDay, newToday: newToday() };
  switch (mode) {
    case 'today': return todayQueue(S.cards, opts).queue;
    case 'ko-en':
    case 'en-ko': return fillQueue(S.cards, opts);
    case 'random': return randomQueue(S.cards);
    case 'weak': return weakQueue(S.cards);
    case 'cat': return categoryQueue(S.cards, cat);
    default: return [];
  }
}

export function sessionView(mode, cat) {
  const def = MODES[mode] || MODES.today;
  const setting = def.dir || S.settings.direction;
  const queue = buildQueue(mode, cat).map((rec) => ({
    rec, retry: false, dir: setting === 'mixed' ? (Math.random() < 0.5 ? 'ko-en' : 'en-ko') : setting,
  }));
  const total = queue.length;
  const tally = { [Rating.Again]: 0, [Rating.Hard]: 0, [Rating.Good]: 0, [Rating.Easy]: 0 };
  let idx = 0;
  let done = 0;

  const bar = h('i');
  const count = h('span', { class: 'count num' });
  const stage = h('div');
  const root = h('div', { class: 'view' },
    h('div', { class: 's-top' },
      h('a', { class: 'icon-btn', href: '#/home', 'aria-label': '학습 종료' }, icon('close')),
      h('div', { class: 'bar' }, bar), count),
    stage);

  function toggleLoop(e) {
    const on = S.settings.repeat > 1;
    S.settings = { ...S.settings, repeat: on ? 1 : 3 };
    e.currentTarget.setAttribute('aria-pressed', String(!on));
  }

  const say = (rec, rateOverride) => tts.speak({ key: rec.key, text: rec.en }, {
    rate: rateOverride ?? S.settings.rate, repeat: S.settings.repeat, voiceURI: S.settings.voiceURI, audioVoice: S.settings.audioVoice,
  });

  const currentVoice = () => {
    const list = tts.audioVoices();
    return list.find((v) => v.id === S.settings.audioVoice) || list[0];
  };
  async function pickVoice(rec, btn) {
    const list = tts.audioVoices();
    const id = await sheet('목소리 선택', list.map((v) => ({ value: v.id, label: v.label, desc: v.desc })), currentVoice().id);
    if (!id) return;
    await updateSettings({ audioVoice: id });
    btn.textContent = currentVoice().label;
    say(rec, 1);
  }

  function listenRow(rec) {
    return h('div', { class: 'listen' },
      h('button', { class: 'btn', type: 'button', onclick: () => say(rec, 1) }, icon('speaker'), '듣기'),
      h('button', { class: 'btn', type: 'button', onclick: () => say(rec, 0.8) }, '0.8×'),
      h('button', { class: 'btn', type: 'button', 'aria-pressed': S.settings.repeat > 1, onclick: toggleLoop }, icon('repeat'), '반복'),
      tts.hasAudio(rec.key) && tts.audioVoices().length > 1
        ? h('button', { class: 'btn', type: 'button', 'aria-label': '목소리 바꾸기', onclick: (e) => pickVoice(rec, e.currentTarget) }, currentVoice().label)
        : null);
  }

  function progress() {
    bar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
    count.textContent = `${Math.min(done + 1, total)} / ${total}`;
  }

  function show() {
    tts.stop();
    progress();
    if (idx >= queue.length) return finish();
    const item = queue[idx];
    const { rec, dir } = item;
    const koToEn = dir === 'ko-en';
    const answerSlot = h('div');
    const rateSlot = h('div');
    const input = koToEn ? h('textarea', {
      placeholder: '영어로 써보세요 (건너뛰어도 돼요)', lang: 'en', autocapitalize: 'sentences',
      autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': '영어 답안',
      onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); reveal(); } },
    }) : null;
    const revealBtn = h('button', { class: 'btn primary block', type: 'button', onclick: reveal }, koToEn ? '정답 확인' : '뜻 확인');

    function reveal() {
      revealBtn.remove();
      let en;
      if (koToEn) {
        const typed = input.value.trim();
        const cmp = typed ? compareAnswer(typed, rec.en) : null;
        en = h('p', { class: 'a-en', lang: 'en' }, cmp
          ? cmp.parts.flatMap((p, i) => [i ? ' ' : '', h('span', { class: p.ok ? 'ok' : 'miss' }, p.text)])
          : rec.en);
        clear(answerSlot, h('div', { class: 'answer' },
          en,
          cmp && cmp.score < 1 ? h('p', { class: 'typed' }, `내 답: ${typed} (일치 ${Math.round(cmp.score * 100)}%)`) : null,
          listenRow(rec)));
        input.readOnly = true;
        input.blur();
        if (S.settings.autoSpeak) say(rec);
      } else {
        clear(answerSlot, h('div', { class: 'answer' }, h('p', { class: 'a-ko' }, rec.ko)));
      }
      showRating();
    }

    function showRating() {
      if (item.retry) {
        clear(rateSlot,
          h('button', { class: 'btn primary block mt', type: 'button', onclick: () => next() }, '다시 확인했어요'),
          h('p', { class: 'again-note' }, '재확인은 복습 일정에 반영되지 않아요.'));
        return;
      }
      const pv = preview(rec.card);
      clear(rateSlot, h('div', { class: 'rate' }, GRADES.map((g) =>
        h('button', { class: `r${g}`, type: 'button', onclick: () => choose(g) },
          GRADE_LABEL[g], h('small', null, fmtInterval(pv[g].days))))));
    }

    let busy = false;
    async function choose(g) {
      if (busy) return;
      busy = true;
      const updated = await rate(rec, g, mode);
      tally[g]++;
      if (g === Rating.Again) queue.push({ rec: updated, dir, retry: true });
      next();
    }
    function next() { idx++; if (!item.retry) done++; show(); }

    const prompt = koToEn
      ? h('p', { class: 'q-ko', lang: 'ko' }, rec.ko)
      : h('div', { class: 'grid-gap' }, h('p', { class: 'q-en', lang: 'en' }, rec.en), listenRow(rec));

    clear(stage, h('div', { class: 'flash' },
      h('div', { class: 'cat' }, item.retry ? `${rec.category} · 다시 보기` : rec.category),
      prompt, input, answerSlot, revealBtn), rateSlot);
    if (!koToEn && S.settings.autoSpeak) say(rec);
    if (input && matchMedia('(pointer: fine)').matches) input.focus();
  }

  function finish() {
    const n = Object.values(tally).reduce((a, b) => a + b, 0);
    const good = tally[Rating.Good] + tally[Rating.Easy];
    const days = reviewDays(S.reviews);
    bar.style.width = '100%';
    count.textContent = '완료';
    clear(stage, n === 0 && total === 0
      ? h('div', { class: 'empty' }, h('h2', null, '학습할 표현이 없어요'),
        h('p', null, mode === 'weak' ? '어려워한 표현이 아직 없어요. 잘하고 있어요!' : '엑셀을 올리면 표현이 여기 나타나요.'),
        h('a', { class: 'btn primary', href: mode === 'weak' ? '#/study' : '#/data' }, mode === 'weak' ? '학습 메뉴로' : '엑셀 올리기'))
      : h('div', { class: 'summary' },
        h('h1', null, `${n}개 표현을 학습했어요`),
        h('p', { class: 'page-sub' }, `기억한 비율 ${n ? Math.round((good / n) * 100) : 0}% · 연속 ${streak(days)}일째`),
        h('dl', { class: 'kv' }, GRADES.flatMap((g) => [h('dt', null, GRADE_LABEL[g]), h('dd', { class: 'num' }, `${tally[g]}개`)])),
        h('div', { class: 'col-actions' },
          h('a', { class: 'btn primary block', href: '#/home' }, '홈으로'),
          mode !== 'today' ? h('a', { class: 'btn block', href: `#/session/${mode}${cat ? '/' + encodeURIComponent(cat) : ''}?r=${Date.now()}` }, '한 번 더') : null)));
  }

  show();
  return root;
}
