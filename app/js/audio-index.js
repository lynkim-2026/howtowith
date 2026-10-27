// audio/index.json: which pre-generated audio file exists for which expression and voice.
//   v2: { version: 2, voices: [{ id, label, desc }], items: { <key>: { <voiceId>: <file> } } }
//   v1 (legacy): { <key>: <file> }
// The file is data fetched at runtime, so every field is validated and maps are prototype-free.

const FILE = /^[a-z0-9_-]+\.(mp3|wav|ogg)$/i;
const ID = /^[a-z0-9]{1,12}$/;

export function parseAudioIndex(data) {
  const out = { voices: [], items: Object.create(null) };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;

  if (data.version === 2 && Array.isArray(data.voices) && data.items && typeof data.items === 'object') {
    for (const v of data.voices.slice(0, 8)) {
      if (v && typeof v.id === 'string' && ID.test(v.id) && typeof v.label === 'string' && v.label) {
        out.voices.push({ id: v.id, label: v.label.slice(0, 20), desc: typeof v.desc === 'string' ? v.desc.slice(0, 60) : '' });
      }
    }
    const ids = new Set(out.voices.map((v) => v.id));
    for (const [key, entry] of Object.entries(data.items)) {
      if (!entry || typeof entry !== 'object') continue;
      const files = Object.create(null);
      for (const [id, file] of Object.entries(entry)) {
        if (ids.has(id) && typeof file === 'string' && FILE.test(file)) files[id] = file;
      }
      if (Object.keys(files).length) out.items[key] = files;
    }
    return out;
  }

  out.voices.push({ id: 'default', label: '기본', desc: '' });
  for (const [key, file] of Object.entries(data)) {
    if (typeof file === 'string' && FILE.test(file)) out.items[key] = Object.assign(Object.create(null), { default: file });
  }
  return out;
}
