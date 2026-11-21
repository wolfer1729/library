import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError, readJSONFile, writeJSONAtomic, streamToFile } from './util.js';
import { splitPlainText, sanitizeChapters } from '../public/js/textproc.js';

// Each uploaded book lives in data/uploads/<id>/ with meta.json, content.json and its files.

let DIR = '';
let GENRES = new Set();
const LANGS = new Set(['en', 'hi', 'te', 'other']);
const ID_RE = /^up-[a-z0-9]{6,20}-[a-f0-9]{4,8}$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/i;
const MB = 1024 * 1024;

const KINDS = {
  cover: { exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif'], limit: 15 * MB },
  original: { exts: ['.txt', '.text', '.md', '.markdown', '.pdf', '.epub', '.html', '.htm', '.xhtml'], limit: 300 * MB },
  audio: { exts: ['.mp3', '.m4a', '.m4b', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac', '.webm', '.weba'], limit: 2048 * MB },
};

// Serialises metadata writes per book so parallel requests cannot clobber each other.
const locks = new Map();
function withLock(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(id, tail);
  tail.then(() => {
    if (locks.get(id) === tail) locks.delete(id);
  });
  return run;
}

export async function init(root, genreIds) {
  DIR = path.join(root, 'data', 'uploads');
  GENRES = new Set(genreIds);
  await fsp.mkdir(DIR, { recursive: true });
}

export const isUploadId = (id) => ID_RE.test(id);

function dirOf(id) {
  if (!ID_RE.test(id)) throw new HttpError(404, 'Unknown book');
  return path.join(DIR, id);
}

const clean = (v, n) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, n);

function cleanMeta(input, prev = {}) {
  const title = clean(input.title, 300).replace(/\s+/g, ' ');
  if (!title) throw new HttpError(400, 'A title is required');
  const year = parseInt(input.year, 10);
  const genres = Array.isArray(input.genres) ? [...new Set(input.genres.filter((g) => GENRES.has(g)))].slice(0, 6) : [];
  const linked = typeof input.linkedTo === 'string' && /^[a-z0-9-]{1,80}$/.test(input.linkedTo) ? input.linkedTo : null;
  return {
    ...prev,
    title,
    author: clean(input.author, 200).replace(/\s+/g, ' '),
    lang: LANGS.has(input.lang) ? input.lang : 'other',
    genres,
    year: Number.isFinite(year) && year > -3000 && year < 3000 ? year : null,
    desc: clean(input.desc, 5000),
    linkedTo: linked ?? prev.linkedTo ?? null,
  };
}

function buildChapters({ text, chapters }) {
  if (Array.isArray(chapters) && chapters.length) return sanitizeChapters(chapters);
  if (typeof text === 'string' && text.trim()) return splitPlainText(text.slice(0, 60_000_000));
  return [];
}

function stats(chapters) {
  let chars = 0;
  for (const c of chapters) for (const p of c.paras) chars += typeof p === 'string' ? p.length : p.h.length;
  return { chapters: chapters.length, chars };
}

export async function list() {
  let names = [];
  try {
    names = await fsp.readdir(DIR);
  } catch {
    return [];
  }
  const metas = await Promise.all(names.filter((n) => ID_RE.test(n)).map((n) => readJSONFile(path.join(DIR, n, 'meta.json'), null)));
  return metas.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

export function get(id) {
  return readJSONFile(path.join(dirOf(id), 'meta.json'), null);
}

export function content(id) {
  return readJSONFile(path.join(dirOf(id), 'content.json'), null);
}

export async function create(body) {
  const meta = cleanMeta(body.meta || {});
  const chapters = buildChapters(body);
  if (!chapters.length) throw new HttpError(400, 'No readable text was found in this book');
  const id = `up-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const dir = dirOf(id);
  await fsp.mkdir(dir, { recursive: true });
  const now = Date.now();
  const full = { id, ...meta, createdAt: now, updatedAt: now, cover: null, original: null, audio: [], stats: stats(chapters) };
  await writeJSONAtomic(path.join(dir, 'content.json'), { chapters });
  await writeJSONAtomic(path.join(dir, 'meta.json'), full);
  return full;
}

export function update(id, body) {
  return withLock(id, async () => {
    const prev = await get(id);
    if (!prev) throw new HttpError(404, 'Unknown book');
    const meta = cleanMeta(body.meta || prev, prev);
    if (body.text || body.chapters) {
      const chapters = buildChapters(body);
      if (!chapters.length) throw new HttpError(400, 'No readable text was found in this book');
      await writeJSONAtomic(path.join(dirOf(id), 'content.json'), { chapters });
      meta.stats = stats(chapters);
    }
    meta.updatedAt = Date.now();
    await writeJSONAtomic(path.join(dirOf(id), 'meta.json'), meta);
    return meta;
  });
}

export async function remove(id) {
  const dir = dirOf(id);
  if (!(await get(id))) throw new HttpError(404, 'Unknown book');
  await fsp.rm(dir, { recursive: true, force: true });
}

export async function putFile(id, kind, name, req) {
  const spec = KINDS[kind];
  if (!spec) throw new HttpError(400, 'Unknown file kind');
  if (!(await get(id))) throw new HttpError(404, 'Unknown book');
  const ext = path.extname(String(name || '')).toLowerCase();
  if (!spec.exts.includes(ext)) throw new HttpError(415, `Unsupported ${kind} file type (${ext || 'no extension'})`);
  const file = kind === 'audio' ? `audio-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}${ext}` : `${kind}-${Date.now().toString(36)}${ext}`;
  const size = await streamToFile(req, path.join(dirOf(id), file), spec.limit);
  const display = clean(name, 200) || file;
  return withLock(id, async () => {
    const meta = await get(id);
    if (!meta) {
      await fsp.rm(path.join(dirOf(id), file), { force: true });
      throw new HttpError(404, 'Unknown book');
    }
    if (kind === 'audio') {
      meta.audio = [...(meta.audio || []), { file, name: display, size }];
    } else {
      const old = meta[kind];
      if (old?.file && old.file !== file) await fsp.rm(path.join(dirOf(id), old.file), { force: true });
      meta[kind] = { file, name: display, size };
    }
    meta.updatedAt = Date.now();
    await writeJSONAtomic(path.join(dirOf(id), 'meta.json'), meta);
    return meta;
  });
}

export function removeFile(id, file) {
  if (!FILE_RE.test(file)) throw new HttpError(400, 'Bad file name');
  return withLock(id, async () => {
    const meta = await get(id);
    if (!meta) throw new HttpError(404, 'Unknown book');
    if ((meta.audio || []).some((a) => a.file === file)) meta.audio = meta.audio.filter((a) => a.file !== file);
    else if (meta.cover?.file === file) meta.cover = null;
    else if (meta.original?.file === file) meta.original = null;
    else throw new HttpError(404, 'File not found');
    await fsp.rm(path.join(dirOf(id), file), { force: true });
    meta.updatedAt = Date.now();
    await writeJSONAtomic(path.join(dirOf(id), 'meta.json'), meta);
    return meta;
  });
}

/** Absolute path of a stored file, or null if the name is not a stored file of this book. */
export async function storedFile(id, file) {
  if (!FILE_RE.test(file) || file === 'meta.json' || file === 'content.json') return null;
  const meta = await get(id);
  if (!meta) return null;
  const known = [meta.cover, meta.original, ...(meta.audio || [])].filter(Boolean).find((f) => f.file === file);
  return known ? { path: path.join(dirOf(id), file), name: known.name } : null;
}

export function toPublic(m) {
  const base = `/files/uploads/${m.id}/`;
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
    sourceType: 'upload',
    linkedTo: m.linkedTo || null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    stats: m.stats,
    cover: m.cover ? `${base}${m.cover.file}` : null,
    original: m.original ? { name: m.original.name, url: `${base}${m.original.file}` } : null,
    audio: (m.audio || []).map((a) => ({ name: a.name, file: a.file, url: `${base}${a.file}`, size: a.size })),
  };
}
