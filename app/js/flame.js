// Streak flame: grows stronger as the streak gets longer. Pure SVG + CSS animation.

const NS = 'http://www.w3.org/2000/svg';

// 0 = embers (no streak), 1..5 = increasingly strong flame
export function flameLevel(days) {
  if (days <= 0) return 0;
  if (days < 3) return 1;
  if (days < 7) return 2;
  if (days < 14) return 3;
  if (days < 30) return 4;
  return 5;
}

const OUTER = 'M50 6C54 30 84 46 84 82C84 108 68 124 50 124C32 124 16 108 16 82C16 60 30 52 34 34C42 42 44 28 50 6Z';
const MID = 'M50 36C53 54 72 64 72 88C72 106 62 116 50 116C38 116 28 106 28 88C28 74 38 68 42 56C46 62 48 50 50 36Z';
const CORE = 'M50 70C52 82 62 88 62 100C62 110 56 114 50 114C44 114 38 110 38 100C38 92 46 88 50 70Z';
const TONGUE_L = 'M18 70C20 82 6 90 8 104C9 114 18 120 26 118C20 112 24 100 28 92C26 84 22 78 18 70Z';
const TONGUE_R = 'M82 62C80 76 94 86 92 102C91 112 82 120 74 118C80 112 76 100 72 92C74 82 78 72 82 62Z';
const SPARK_X = [34, 66, 50, 24, 76, 44];

function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  return e;
}

export function flame(days) {
  const level = flameLevel(days);
  const svg = el('svg', { viewBox: '0 0 100 130', class: `flame lv${level}`, role: 'img', 'aria-label': days > 0 ? `연속 ${days}일 불꽃` : '꺼진 불씨' });
  svg.append(el('circle', { cx: 50, cy: 92, r: 62, class: 'glow' }));
  const body = el('g', { class: 'body' });
  if (level >= 2) body.append(el('path', { d: TONGUE_L, class: 'tongue t1' }));
  if (level >= 4) body.append(el('path', { d: TONGUE_R, class: 'tongue t2' }));
  body.append(el('path', { d: OUTER, class: 'layer outer' }), el('path', { d: MID, class: 'layer mid' }), el('path', { d: CORE, class: 'layer core' }));
  svg.append(body);
  const sparks = [0, 0, 0, 2, 4, 6][level];
  for (let i = 0; i < sparks; i++) svg.append(el('circle', { cx: SPARK_X[i], cy: 70, r: i % 2 ? 1.8 : 2.4, class: `spark sp${i + 1}` }));
  return svg;
}
