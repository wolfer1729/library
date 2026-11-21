import fsp from 'node:fs/promises';
import path from 'node:path';
import * as uploads from './uploads.js';
import { HttpError, readJSONFile, writeJSONAtomic } from './util.js';
import { splitPlainText } from '../public/js/textproc.js';
import { fetchGutenberg, stripGutenberg, gutenbergUrl } from './gutenberg.js';
import { crawlWikisource, wikisourceUrl } from './wikisource.js';
import { findAudiobook } from './librivox.js';
import { downloadAudiobook, readManifest, removeAudiobook } from './audio.js';

let CACHE = '';
let genres = [];
const books = [];
const byId = new Map();
const jobs = new Map(); // id -> text download job
const lvJobs = new Map(); // id -> pending LibriVox lookup
const audioJobs = new Map(); // id -> audiobook download job
let audioQueue = Promise.resolve(); // audiobooks download one at a time
const builtinMemo = new Map();

const contentFile = (id) => path.join(CACHE, 'content', `${id}.json`);

export async function init(root) {
  CACHE = path.join(root, 'data', 'cache');
  await fsp.mkdir(path.join(CACHE, 'content'), { recursive: true });
  const dir = path.join(root, 'data', 'catalog');
  genres = JSON.parse(await fsp.readFile(path.join(dir, 'genres.json'), 'utf8'));
  const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'genres.json').sort();
  for (const f of files) {
    const data = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8'));
    for (const b of data.books) {
      const book = { lang: data.lang, ...b };
      if (Array.isArray(book.text)) book.text = book.text.join('\n\n');
      if (byId.has(book.id)) {
        console.warn(`[catalog] duplicate id "${book.id}" in ${f} — skipped`);
        continue;
      }
      books.push(book);
      byId.set(book.id, book);
    }
  }
  await uploads.init(root, genres.map((g) => g.id));
  return books.length;
}

/** Ids of books whose text is saved on disk, and of audiobooks saved on disk. */
async function savedSets() {
  const text = new Set();
  const audio = new Set();
  try {
    for (const f of await fsp.readdir(path.join(CACHE, 'content'))) if (f.endsWith('.json')) text.add(f.slice(0, -5));
  } catch {
    /* none yet */
  }
  try {
    for (const d of await fsp.readdir(path.join(CACHE, 'audio'))) {
      if (await readManifest(CACHE, d).then((m) => m?.complete)) audio.add(d);
    }
  } catch {
    /* none yet */
  }
  return { text, audio };
}

function sourceUrl(b) {
  if (b.source?.type === 'gutenberg') return gutenbergUrl(b.source.id);
  if (b.source?.type === 'wikisource') return wikisourceUrl(b.source.lang || b.lang, b.source.page);
  return null;
}

function narratedLookup(b) {
  if (b.lv === false) return null;
  if (b.lv) return b.lv;
  return b.source?.type === 'gutenberg' ? {} : null;
}

function publicBook(b, copies, saved) {
  const { text, source, lv, ...rest } = b;
  return {
    ...rest,
    hasText: Boolean(source || text),
    sourceType: source?.type || (text ? 'builtin' : null),
    sourceUrl: sourceUrl(b),
    narrated: Boolean(narratedLookup(b)),
    offline: Boolean(text) || saved.text.has(b.id),
    audioOffline: saved.audio.has(b.id) || undefined,
    copies: copies || undefined,
  };
}

export async function publicCatalog() {
  const [ups, saved] = await Promise.all([uploads.list(), savedSets()]);
  const copies = {};
  for (const u of ups) if (u.linkedTo) (copies[u.linkedTo] ||= []).push(u.id);
  return {
    genres,
    books: [...ups.map((u) => ({ ...uploads.toPublic(u), offline: true })), ...books.map((b) => publicBook(b, copies[b.id], saved))],
  };
}

/** Catalogue books that have a downloadable text. */
export function textSources() {
  return books.filter((b) => b.source).map((b) => ({ id: b.id, title: b.title, lang: b.lang, type: b.source.type }));
}

export function isTextSaved(id) {
  return fsp.access(contentFile(id)).then(
    () => true,
    () => false,
  );
}

// ---------------------------------------------------------------- book text

export async function getContent(id, { retry = false } = {}) {
  if (uploads.isUploadId(id)) {
    const c = await uploads.content(id);
    if (!c) throw new HttpError(404, 'Unknown book');
    return { status: 'ready', chapters: c.chapters };
  }
  const b = byId.get(id);
  if (!b) throw new HttpError(404, 'Unknown book');
  if (b.text) {
    if (!builtinMemo.has(id)) builtinMemo.set(id, splitPlainText(b.text));
    return { status: 'ready', chapters: builtinMemo.get(id) };
  }
  if (!b.source) throw new HttpError(409, 'This book is listed in the catalogue only; its text is not freely available.');
  const cached = await readJSONFile(contentFile(id), null);
  if (cached?.chapters?.length) return { status: 'ready', chapters: cached.chapters };

  let job = jobs.get(id);
  if (job && job.status === 'error' && (retry || Date.now() - job.endedAt > 30000)) {
    jobs.delete(id);
    job = null;
  }
  if (!job) job = startJob(b);
  return { status: job.status, chapters: job.chapters, progress: job.progress, error: job.error };
}

function startJob(b) {
  const job = { status: 'loading', chapters: [], progress: { pages: 0 }, error: null, endedAt: 0, truncated: false };
  jobs.set(b.id, job);
  job.promise = (async () => {
    if (b.source.type === 'gutenberg') {
      job.progress = { step: 'download' };
      const raw = await fetchGutenberg(b.source.id);
      job.chapters = splitPlainText(stripGutenberg(raw));
    } else if (b.source.type === 'wikisource') {
      const r = await crawlWikisource(
        { lang: b.source.lang || b.lang, page: b.source.page },
        {
          cacheDir: path.join(CACHE, 'wikisource'),
          onChapter: (ch) => job.chapters.push(ch),
          onProgress: (p) => {
            job.progress = p;
          },
        },
      );
      job.truncated = Boolean(r?.truncated);
    } else {
      throw new Error(`Unknown source type "${b.source.type}"`);
    }
    if (!job.chapters.length) throw new Error('No readable text was found.');
    await writeJSONAtomic(contentFile(b.id), { id: b.id, fetchedAt: Date.now(), truncated: job.truncated || undefined, chapters: job.chapters });
    job.status = 'ready';
    job.endedAt = Date.now();
    setTimeout(() => {
      if (jobs.get(b.id) === job) jobs.delete(b.id);
    }, 60000);
  })().catch((e) => {
    job.status = 'error';
    job.error = e.message;
    job.endedAt = Date.now();
    console.warn(`[content] ${b.id}: ${e.message}`);
  });
  return job;
}

/** Downloads a book's text to disk and waits until it is saved. */
export async function downloadText(id) {
  const b = byId.get(id);
  if (!b?.source) return { skipped: true };
  if (await isTextSaved(id)) return { cached: true };
  let job = jobs.get(id);
  if (!job || job.status === 'error') job = startJob(b);
  await job.promise;
  if (job.status !== 'ready') throw new Error(job.error || 'Download failed');
  return { chapters: job.chapters.length, truncated: job.truncated };
}

// ---------------------------------------------------------------- audiobooks

async function lookupAudiobook(b) {
  const lv = narratedLookup(b);
  if (!lv) return { found: false, reason: 'not-applicable' };
  const file = path.join(CACHE, 'librivox', `${b.id}.json`);
  const cached = await readJSONFile(file, null);
  if (cached && (cached.found || Date.now() - cached.checkedAt < 3 * 86400e3)) return cached;
  if (lvJobs.has(b.id)) return lvJobs.get(b.id);
  const p = findAudiobook({ title: lv.title || b.title, author: lv.author ?? b.author, lang: b.lang })
    .then(async (r) => {
      const rec = { ...r, checkedAt: Date.now() };
      await writeJSONAtomic(file, rec);
      return rec;
    })
    .catch((e) => ({ found: false, error: `LibriVox is not reachable right now (${e.message})` }))
    .finally(() => lvJobs.delete(b.id));
  lvJobs.set(b.id, p);
  return p;
}

function jobView(job) {
  return job ? { status: job.status, done: job.done, total: job.total, error: job.error } : null;
}

export async function getAudiobook(id) {
  if (uploads.isUploadId(id)) {
    const m = await uploads.get(id);
    if (!m) throw new HttpError(404, 'Unknown book');
    const pub = uploads.toPublic(m);
    if (!pub.audio.length) return { found: false };
    return {
      found: true,
      source: 'upload',
      offline: 'ready',
      tracks: pub.audio.map((a) => ({ title: a.name.replace(/\.[^.]+$/, ''), url: a.url, secs: 0, file: a.file })),
    };
  }
  const b = byId.get(id);
  if (!b) throw new HttpError(404, 'Unknown book');
  const saved = await readManifest(CACHE, id);
  if (saved?.complete) {
    return {
      found: true,
      source: 'librivox',
      title: saved.title,
      url: saved.url,
      readers: saved.readers,
      totaltime: saved.totaltime,
      offline: 'ready',
      bytes: saved.bytes,
      tracks: saved.tracks.map((t) => ({ title: t.title, url: `/files/audio/${id}/${t.file}`, secs: t.secs })),
    };
  }
  const rec = await lookupAudiobook(b);
  return { ...rec, offline: jobView(audioJobs.get(id)) };
}

/** Starts saving a LibriVox audiobook to disk (queued; one download at a time). */
export async function saveAudiobook(id) {
  const b = byId.get(id);
  if (!b) throw new HttpError(404, 'Unknown book');
  const running = audioJobs.get(id);
  if (running && (running.status === 'queued' || running.status === 'downloading')) return { job: jobView(running), promise: running.promise };
  const saved = await readManifest(CACHE, id);
  if (saved?.complete) return { job: { status: 'ready' }, promise: Promise.resolve() };
  const ab = await lookupAudiobook(b);
  if (!ab.found || !ab.tracks?.length) throw new HttpError(404, 'No audiobook was found for this book.');
  const job = { status: 'queued', done: 0, total: ab.tracks.length, error: null };
  audioJobs.set(id, job);
  job.promise = audioQueue = audioQueue
    .catch(() => {})
    .then(async () => {
      job.status = 'downloading';
      await downloadAudiobook(CACHE, id, ab, (done) => {
        job.done = done;
      });
      job.status = 'ready';
    })
    .catch((e) => {
      job.status = 'error';
      job.error = e.message;
      console.warn(`[audio] ${id}: ${e.message}`);
    });
  return { job: jobView(job), promise: job.promise };
}

export async function deleteSavedAudiobook(id) {
  if (!byId.has(id)) throw new HttpError(404, 'Unknown book');
  const running = audioJobs.get(id);
  if (running && (running.status === 'queued' || running.status === 'downloading')) throw new HttpError(409, 'This audiobook is still downloading.');
  audioJobs.delete(id);
  await removeAudiobook(CACHE, id);
}

export function audioFilePath(id, file) {
  if (!/^[a-z0-9-]+$/.test(id) || !/^\d{3}\.mp3$/.test(file)) return null;
  return path.join(CACHE, 'audio', id, file);
}
