// Tiny DOM helpers. All text goes through text nodes / setAttribute, never innerHTML,
// so imported sentences can never be interpreted as markup.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('aria-') && v != null) { el.setAttribute(k, String(v)); continue; }
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function clear(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

const PATHS = {
  home: 'M4 11.5 12 4l8 7.5M6 10v9h12v-9',
  cards: 'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 9h6M9 13h4',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  chart: 'M5 20V10M12 20V4M19 20v-7',
  data: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3ZM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  close: 'M6 6l12 12M18 6 6 18',
  speaker: 'M5 9.5v5h3.5L13 18V6L8.5 9.5H5ZM16.5 9a4 4 0 0 1 0 6M18.8 6.7a7.3 7.3 0 0 1 0 10.6',
  repeat: 'M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3',
  chevron: 'm9 6 6 6-6 6',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  check: 'm5 12.5 4.5 4.5L19 7.5',
};

export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', PATHS[name] || '');
  svg.append(p);
  return svg;
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// Modal choice. `choices`: [{ label, value, kind }] -> resolves the chosen value (null on dismiss).
export function ask(title, message, choices) {
  return new Promise((resolve) => {
    const dlg = h('dialog', null,
      h('h2', null, title),
      h('p', null, message),
      h('div', { class: 'actions' }, choices.map((c) =>
        h('button', { class: `btn ${c.kind || ''}`, type: 'button', onclick: () => { dlg.close(); resolve(c.value); } }, c.label))));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export const confirmAction = (title, message, okLabel = '확인', kind = 'primary') =>
  ask(title, message, [{ label: '취소', value: false, kind: 'quiet' }, { label: okLabel, value: true, kind }]).then(Boolean);

export function fmtInterval(days) {
  if (days < 1) return '오늘';
  if (days < 14) return `${days}일`;
  if (days < 60) return `${Math.round(days / 7)}주`;
  if (days < 365) return `${Math.round(days / 30)}개월`;
  return `${(days / 365).toFixed(1)}년`;
}

export function fmtDue(due, now = new Date()) {
  const a = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = Math.round((a - b) / 86400000);
  if (d <= 0) return d === 0 ? '오늘' : `${-d}일 밀림`;
  if (d === 1) return '내일';
  return `${d}일 후 (${a.getMonth() + 1}/${a.getDate()})`;
}

export function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
