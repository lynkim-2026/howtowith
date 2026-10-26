// English audio. Pre-generated files (made on the PC with VoiceStudio) play first;
// when a file is missing or fails, the device's built-in Web Speech voice is used.

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voices = [];
let index = {}; // expression key -> file name under audio/
let runId = 0;
let player = null;

export const supported = () => !!synth || Object.keys(index).length > 0;
export const hasAudio = (key) => Object.hasOwn(index, key);
export const audioCount = () => Object.keys(index).length;
export const audioFiles = () => Object.values(index).map((f) => `audio/${f}`);

export async function loadIndex() {
  try {
    const res = await fetch('audio/index.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json();
    index = {};
    for (const [k, f] of Object.entries(data)) {
      if (typeof f === 'string' && /^[a-z0-9_-]+\.(mp3|wav|ogg)$/i.test(f)) index[k] = f;
    }
  } catch { /* offline without a cached index, or no audio generated yet */ }
}

function loadVoices() {
  voices = synth ? synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang)) : [];
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export function englishVoices() {
  // US voices first, then the rest alphabetically.
  return voices.slice().sort((a, b) => {
    const au = /en[-_]US/i.test(a.lang) ? 0 : 1;
    const bu = /en[-_]US/i.test(b.lang) ? 0 : 1;
    return au - bu || a.name.localeCompare(b.name);
  });
}

const pickVoice = (uri) => voices.find((v) => v.voiceURI === uri) || englishVoices()[0] || null;

export function stop() {
  runId++;
  synth?.cancel();
  if (player) { player.pause(); player.removeAttribute('src'); player.load(); player = null; }
}

// Plays `repeat` times; resolves the callback once finished or stopped.
function speakSynth(text, { rate, repeat, voiceURI, onEnd }, id) {
  if (!synth) { onEnd?.(); return; }
  let n = 0;
  const next = () => {
    if (id !== runId) return;
    if (n >= repeat) { onEnd?.(); return; }
    n++;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(voiceURI);
    u.lang = v ? v.lang : 'en-US';
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => setTimeout(next, 350);
    u.onerror = () => { if (id === runId) onEnd?.(); };
    synth.speak(u);
  };
  next();
}

function speakFile(item, opts, id) {
  const audio = new Audio(`audio/${index[item.key]}`);
  audio.preservesPitch = true;
  audio.playbackRate = opts.rate;
  player = audio;
  let n = 0;
  const play = () => {
    if (id !== runId) return;
    n++;
    audio.currentTime = 0;
    audio.play().catch(fail);
  };
  const fail = () => {
    if (id !== runId) return;
    // File missing or undecodable: fall back to the device voice for the whole request.
    stop();
    speakSynth(item.text, opts, ++runId);
  };
  audio.onended = () => {
    if (id !== runId) return;
    if (n >= opts.repeat) { opts.onEnd?.(); return; }
    setTimeout(play, 350);
  };
  audio.onerror = fail;
  play();
}

// speak({ key, text }, { rate, repeat, voiceURI, onEnd })
export function speak(item, { rate = 1, repeat = 1, voiceURI = '', onEnd } = {}) {
  if (!item || !item.text) return;
  stop();
  const id = runId;
  const opts = { rate, repeat, voiceURI, onEnd };
  if (hasAudio(item.key)) speakFile(item, opts, id);
  else speakSynth(item.text, opts, id);
}
