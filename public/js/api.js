import { localStore } from './local-store.js';

// Two ways to run the library:
//  • "server": node server.js is running (your computer) and /api/... exists.
//  • "static": a plain website such as GitHub Pages. Book texts and lists are ready-made files under
//    books/, and books you add are kept in this browser (see local-store.js).
export let mode = null;
let modePromise;
export function detectMode() {
  if (!modePromise) {
    modePromise = fetch('api/catalog', { cache: 'no-store' })
      .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? 'server' : 'static'))
      .catch(() => 'static')
      .then((m) => (mode = m));
  }
  return modePromise;
}
export const isStatic = () => mode === 'static';

async function req(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

function staticError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---------------------------------------------------------------- static helpers

let staticCatalog;
let staticAudio;
const loadStaticCatalog = () => (staticCatalog ||= fetch('books/catalog.json').then((r) => {
  if (!r.ok) throw new Error('network');
  return r.json();
}));
const loadStaticAudio = () => (staticAudio ||= fetch('books/audio.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
const isUpload = (id) => id.startsWith('up-');

const staticApi = {
  async catalog() {
    staticCatalog = null; // pick up a newer site version
    const [base, ups] = await Promise.all([loadStaticCatalog(), localStore.list()]);
    const copies = {};
    for (const u of ups) if (u.linkedTo) (copies[u.linkedTo] ||= []).push(u.id);
    return { genres: base.genres, books: [...ups, ...base.books.map((b) => (copies[b.id] ? { ...b, copies: copies[b.id] } : b))] };
  },
  async content(id, from = 0) {
    let chapters;
    if (isUpload(id)) chapters = (await localStore.content(id)).chapters;
    else {
      let r;
      try {
        r = await fetch(`books/text/${encodeURIComponent(id)}.json`);
      } catch {
        throw new Error('network');
      }
      if (r.status === 404) throw staticError(409, 'This book is listed in the catalogue only.');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      chapters = (await r.json()).chapters;
    }
    return { status: 'ready', total: chapters.length, from, chapters: chapters.slice(from), progress: null, error: null };
  },
  async audiobook(id) {
    if (isUpload(id)) {
      const b = (await localStore.list()).find((x) => x.id === id);
      if (!b?.audio.length) return { found: false };
      return { found: true, source: 'upload', offline: 'ready', tracks: b.audio.map((a) => ({ title: a.name.replace(/\.[^.]+$/, ''), url: a.url, secs: 0, file: a.file })) };
    }
    const ab = (await loadStaticAudio())[id];
    return ab ? { found: true, source: 'librivox', ...ab } : { found: false };
  },
};

// ---------------------------------------------------------------- public API

export const api = {
  async catalog() {
    return (await detectMode()) === 'server' ? req('GET', '/api/catalog') : staticApi.catalog();
  },
  async content(id, from = 0, retry = false) {
    if ((await detectMode()) === 'static') return staticApi.content(id, from);
    return req('GET', `/api/books/${encodeURIComponent(id)}/content?from=${from}${retry ? '&retry=1' : ''}`);
  },
  async audiobook(id) {
    return (await detectMode()) === 'server' ? req('GET', `/api/books/${encodeURIComponent(id)}/audiobook`) : staticApi.audiobook(id);
  },
  async saveAudiobook(id) {
    if ((await detectMode()) === 'static') throw new Error('Not available on the website version.');
    return req('POST', `/api/books/${encodeURIComponent(id)}/audiobook/offline`);
  },
  async removeAudiobook(id) {
    if ((await detectMode()) === 'static') throw new Error('Not available on the website version.');
    return req('DELETE', `/api/books/${encodeURIComponent(id)}/audiobook/offline`);
  },
  async createUpload(payload) {
    return (await detectMode()) === 'server' ? req('POST', '/api/uploads', payload) : localStore.create(payload);
  },
  async updateUpload(id, payload) {
    return (await detectMode()) === 'server' ? req('PUT', `/api/uploads/${encodeURIComponent(id)}`, payload) : localStore.update(id, payload);
  },
  async deleteUpload(id) {
    return (await detectMode()) === 'server' ? req('DELETE', `/api/uploads/${encodeURIComponent(id)}`) : localStore.remove(id);
  },
  async deleteFile(id, file) {
    if ((await detectMode()) === 'static') return localStore.removeFile(id, file);
    return req('DELETE', `/api/uploads/${encodeURIComponent(id)}/files/${encodeURIComponent(file)}`);
  },

  /** Uploads a raw file (cover | original | audio) with progress (0..1). */
  async putFile(id, kind, file, name, onProgress) {
    if ((await detectMode()) === 'static') return localStore.putFile(id, kind, file, name, onProgress);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/uploads/${encodeURIComponent(id)}/${kind}?name=${encodeURIComponent(name || file.name || kind)}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send(file);
    });
  },
};

// ---------------------------------------------------------------- books saved on this device
// (website version only; the service worker serves them from this cache when offline)

const BOOK_CACHE = 'books-v1';
const textUrl = (id) => new URL(`books/text/${encodeURIComponent(id)}.json`, location.href).href;

export const device = {
  supported: () => typeof caches !== 'undefined' && 'serviceWorker' in navigator,
  async savedIds() {
    if (!this.supported()) return new Set();
    const c = await caches.open(BOOK_CACHE);
    const keys = await c.keys();
    return new Set(keys.map((k) => decodeURIComponent(k.url.split('/books/text/')[1] || '').replace(/\.json$/, '')).filter(Boolean));
  },
  async isSaved(id) {
    if (!this.supported()) return false;
    return Boolean(await (await caches.open(BOOK_CACHE)).match(textUrl(id)));
  },
  /** Saves every book's text in this browser. onProgress(done, total). */
  async saveAll(ids, onProgress, shouldStop = () => false) {
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* optional */
    }
    const c = await caches.open(BOOK_CACHE);
    const have = await this.savedIds();
    const todo = ids.filter((id) => !have.has(id));
    let done = ids.length - todo.length;
    onProgress(done, ids.length);
    let i = 0;
    const failed = [];
    const worker = async () => {
      while (i < todo.length && !shouldStop()) {
        const id = todo[i++];
        try {
          await c.add(textUrl(id));
        } catch {
          failed.push(id);
        }
        onProgress(++done, ids.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return failed;
  },
  removeAll: () => caches.delete(BOOK_CACHE),
};
