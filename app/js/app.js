// Router and bootstrap.
import { S, load, syncPublished } from './state.js';
import { h, clear, icon, toast } from './ui.js';
import * as tts from './tts.js';
import { homeView, afterHome, studyView, afterStudy, listView, statsView, dataView } from './views.js';
import { sessionView } from './session.js';

const TABS = [
  ['home', '홈', 'home'], ['study', '학습', 'cards'], ['list', '목록', 'list'], ['stats', '통계', 'chart'], ['data', '관리', 'data'],
];

const appEl = document.getElementById('app');
const tabsEl = document.getElementById('tabs');

function route() {
  const [path, query] = location.hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  void query;
  const decode = (s) => { try { return decodeURIComponent(s); } catch { return ''; } };
  return { name: parts[0] || 'home', args: parts.slice(1).map(decode) };
}

function render() {
  tts.stop();
  const { name, args } = route();
  const immersive = name === 'session';
  appEl.classList.toggle('immersive', immersive);
  tabsEl.hidden = immersive;
  let view;
  let after;
  switch (name) {
    case 'study': view = studyView(); after = afterStudy; break;
    case 'list': view = listView(); break;
    case 'stats': view = statsView(); break;
    case 'data': view = dataView(); break;
    case 'session': view = sessionView(args[0], args[1]); break;
    default: view = homeView(); after = afterHome;
  }
  clear(appEl, view);
  after?.(view);
  window.scrollTo(0, 0);
  for (const a of tabsEl.querySelectorAll('a')) {
    if (a.dataset.tab === (immersive ? 'study' : name)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function buildTabs() {
  clear(tabsEl, TABS.map(([id, label, ic]) => h('a', { href: `#/${id}`, 'data-tab': id }, icon(ic), label)));
}

async function boot() {
  buildTabs();
  try {
    await load();
  } catch {
    clear(appEl, h('div', { class: 'empty' }, h('h2', null, '저장소를 열 수 없어요'),
      h('p', null, '시크릿 모드이거나 브라우저 저장이 막혀 있을 수 있어요.')));
    return;
  }
  await tts.loadIndex();
  try {
    const added = await syncPublished();
    if (added) toast(`PC에서 정리한 새 표현 ${added}개를 가져왔어요`);
  } catch { /* offline or not published yet */ }
  window.addEventListener('hashchange', render);
  render();
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvent = e; });
window.addEventListener('unhandledrejection', () => toast('문제가 생겼어요. 다시 시도해 주세요.'));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
