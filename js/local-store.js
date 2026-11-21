// Storage for books added on a server-less (static) deployment such as GitHub Pages.
// Everything lives in this browser's IndexedDB: nothing is uploaded anywhere.
import { splitPlainText, sanitizeChapters } from './textproc.js';

const DB_NAME = 'granthalaya';
let dbPromise;

function openDb() {
  if (!dbPromise) {
    const opening = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('content')) d.createObjectStore('content');
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('Browser storage is busy in another tab'));
    });
    // Some browsers (private modes, locked-down profiles) never answer: don't hang the library.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Browser storage is not available')), 5000));
    dbPromise = Promise.race([opening, timeout]).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage is full or unavailable'));
  });
}
const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
const put = (store, value, key) => run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
const del = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

class HttpLikeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Object URLs for stored files (covers, audio, originals), created lazily and reused.
const urls = new Map();
async function fileUrl(id, file) {
  const key = `${id}/${file}`;
  if (urls.has(key)) return urls.get(key);
  const rec = await get('files', key);
  if (!rec) return null;
  const u = URL.createObjectURL(rec.blob);
  urls.set(key, u);
  return u;
}
function forgetUrl(id, file) {
  const key = `${id}/${file}`;
  if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
  urls.delete(key);
}

const LANGS = new Set(['en', 'hi', 'te', 'other']);
const clean = (v, n) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, n);

function cleanMeta(input, prev = {}) {
  const title = clean(input.title, 300).replace(/\s+/g, ' ');
  if (!title) throw new HttpLikeError(400, 'A title is required');
  const year = parseInt(input.year, 10);
  return {
    ...prev,
    title,
    author: clean(input.author, 200).replace(/\s+/g, ' '),
    lang: LANGS.has(input.lang) ? input.lang : 'other',
    genres: Array.isArray(input.genres) ? [...new Set(input.genres.map(String))].slice(0, 6) : [],
    year: Number.isFinite(year) && year > -3000 && year < 3000 ? year : null,
    desc: clean(input.desc, 5000),
    linkedTo: typeof input.linkedTo === 'string' && input.linkedTo ? input.linkedTo : prev.linkedTo ?? null,
  };
}

function buildChapters({ text, chapters }) {
  if (Array.isArray(chapters) && chapters.length) return sanitizeChapters(chapters);
  if (typeof text === 'string' && text.trim()) return splitPlainText(text);
  return [];
}

function stats(chapters) {
  let chars = 0;
  for (const c of chapters) for (const p of c.paras) chars += typeof p === 'string' ? p.length : p.h.length;
  return { chapters: chapters.length, chars };
}

async function toPublic(m) {
  return {
    id: m.id,
    title: m.title,
    author: m.author,
    lang: m.lang,
    genres: m.genres || [],
    year: m.year,
    desc: m.desc,
    upload: true,
    hasText: true,
    offline: true,
    sourceType: 'upload',
    linkedTo: m.linkedTo || null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    stats: m.stats,
    cover: m.cover ? await fileUrl(m.id, m.cover.file) : null,
    original: m.original ? { name: m.original.name, url: await fileUrl(m.id, m.original.file) } : null,
    audio: await Promise.all((m.audio || []).map(async (a) => ({ name: a.name, file: a.file, size: a.size, url: await fileUrl(m.id, a.file) }))),
  };
}

async function getMeta(id) {
  const m = await get('books', id);
  if (!m) throw new HttpLikeError(404, 'Unknown book');
  return m;
}

export const localStore = {
  available: () => typeof indexedDB !== 'undefined',

  async list() {
    if (!this.available()) return [];
    try {
      const all = await run('books', 'readonly', (s) => s.getAll());
      all.sort((a, b) => b.createdAt - a.createdAt);
      return Promise.all(all.map(toPublic));
    } catch {
      return [];
    }
  },

  async content(id) {
    await getMeta(id);
    return (await get('content', id)) || { chapters: [] };
  },

  async create(body) {
    const meta = cleanMeta(body.meta || {});
    const chapters = buildChapters(body);
    if (!chapters.length) throw new HttpLikeError(400, 'No readable text was found in this book');
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('');
    const now = Date.now();
    const full = { id: `up-${now.toString(36)}-${rnd}`, ...meta, createdAt: now, updatedAt: now, cover: null, original: null, audio: [], stats: stats(chapters) };
    await put('content', { chapters }, full.id);
    await put('books', full);
    return toPublic(full);
  },

  async update(id, body) {
    const prev = await getMeta(id);
    const meta = cleanMeta(body.meta || prev, prev);
    if (body.text || body.chapters) {
      const chapters = buildChapters(body);
      if (!chapters.length) throw new HttpLikeError(400, 'No readable text was found in this book');
      await put('content', { chapters }, id);
      meta.stats = stats(chapters);
    }
    meta.updatedAt = Date.now();
    await put('books', meta);
    return toPublic(meta);
  },

  async remove(id) {
    const m = await getMeta(id);
    for (const f of [m.cover, m.original, ...(m.audio || [])].filter(Boolean)) {
      forgetUrl(id, f.file);
      await del('files', `${id}/${f.file}`);
    }
    await del('content', id);
    await del('books', id);
  },

  async putFile(id, kind, file, name, onProgress) {
    const meta = await getMeta(id);
    const ext = (String(name || file.name || '').match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
    const stored = kind === 'audio' ? `audio-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${ext}` : `${kind}-${Date.now().toString(36)}${ext}`;
    await put('files', { blob: file, name: name || file.name }, `${id}/${stored}`);
    onProgress?.(1);
    const entry = { file: stored, name: clean(name || file.name, 200) || stored, size: file.size };
    if (kind === 'audio') meta.audio = [...(meta.audio || []), entry];
    else {
      const old = meta[kind];
      if (old?.file) {
        forgetUrl(id, old.file);
        await del('files', `${id}/${old.file}`);
      }
      meta[kind] = entry;
    }
    meta.updatedAt = Date.now();
    await put('books', meta);
    return toPublic(meta);
  },

  async removeFile(id, file) {
    const meta = await getMeta(id);
    if ((meta.audio || []).some((a) => a.file === file)) meta.audio = meta.audio.filter((a) => a.file !== file);
    else if (meta.cover?.file === file) meta.cover = null;
    else if (meta.original?.file === file) meta.original = null;
    else throw new HttpLikeError(404, 'File not found');
    forgetUrl(id, file);
    await del('files', `${id}/${file}`);
    meta.updatedAt = Date.now();
    await put('books', meta);
    return toPublic(meta);
  },
};
