// Downloads everything the library needs to work without internet:
//   • the text of every catalogue book (Project Gutenberg + Wikisource) → data/cache/content/
//   • web fonts and the PDF/EPUB reader libraries → public/fonts, public/vendor
//   • optionally, LibriVox audiobooks → data/cache/audio/   (large! about 30 MB per hour of audio)
//
// Usage:
//   npm run download                         all book texts (+ fonts/libraries)
//   npm run download -- --lang=hi            only Hindi books (en | hi | te)
//   npm run download -- --audio=en-kim,en-dracula   also save these audiobooks
//   npm run download -- --audio              also save ALL English audiobooks (tens of GB)
//
// Safe to stop (Ctrl+C) and run again: finished books and fetched chapters are kept.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as catalog from '../server/catalog.js';
import { fetchAssets } from './fetch-assets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const val = (name) => {
  const f = flag(name);
  return f && f.includes('=') ? f.slice(f.indexOf('=') + 1) : null;
};
const opts = {
  lang: val('lang'),
  only: val('only'),
  text: !flag('no-text'),
  assets: !flag('no-assets'),
  audio: flag('audio') ? val('audio') || 'all' : null,
  concurrency: Math.max(1, Math.min(4, Number(val('concurrency')) || 3)),
};

const t0 = Date.now();
const clock = () => {
  const s = Math.round((Date.now() - t0) / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const log = (msg) => console.log(`[${clock()}] ${msg}`);

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

async function dirSize(dir) {
  let total = 0;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await dirSize(p) : (await fs.stat(p)).size;
  }
  return total;
}
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function downloadTexts() {
  let list = catalog.textSources();
  if (opts.lang) list = list.filter((b) => b.lang === opts.lang);
  if (opts.only) {
    const ids = new Set(opts.only.split(','));
    list = list.filter((b) => ids.has(b.id));
  }
  const todo = [];
  for (const b of list) if (!(await catalog.isTextSaved(b.id))) todo.push(b);
  log(`Book texts: ${list.length} books, ${list.length - todo.length} already saved, ${todo.length} to download.`);
  if (todo.some((b) => b.type === 'wikisource')) log('Wikisource books arrive chapter by chapter, so Hindi and Telugu books take a while.');

  const failed = [];
  let done = 0;
  const run = async (b) => {
    const start = Date.now();
    try {
      const r = await catalog.downloadText(b.id);
      done++;
      const note = r.truncated ? ' (very long: saved the first 600 pages)' : '';
      log(`✓ ${done}/${todo.length}  ${b.id}  ${r.chapters ?? ''} chapters, ${Math.round((Date.now() - start) / 1000)}s${note}`);
    } catch (e) {
      failed.push(b);
      log(`✗ ${b.id}: ${e.message}`);
    }
  };
  // Gutenberg mirrors and Wikisource are different servers, so both run side by side.
  await Promise.all([
    pool(todo.filter((b) => b.type === 'gutenberg'), 2, run),
    pool(todo.filter((b) => b.type === 'wikisource'), opts.concurrency, run),
  ]);
  if (failed.length) {
    log(`Retrying ${failed.length} book(s) that failed…`);
    const again = failed.splice(0);
    await pool(again, 1, run);
  }
  return failed;
}

async function downloadAudio() {
  let ids;
  if (opts.audio === 'all') {
    ids = catalog
      .textSources()
      .filter((b) => b.type === 'gutenberg' && (!opts.lang || b.lang === opts.lang))
      .map((b) => b.id);
    log(`Audiobooks: checking ${ids.length} English books on LibriVox. This can need tens of gigabytes.`);
  } else {
    ids = opts.audio.split(',').filter(Boolean);
  }
  for (const id of ids) {
    try {
      const st = await fs.statfs(ROOT).catch(() => null);
      if (st && st.bavail * st.bsize < 2 * 1024 ** 3) {
        log('Stopping audiobook downloads: less than 2 GB of free disk space is left.');
        break;
      }
      const ab = await catalog.getAudiobook(id);
      if (ab.offline === 'ready') {
        log(`✓ ${id}: audiobook already saved`);
        continue;
      }
      if (!ab.found) {
        log(`– ${id}: no LibriVox recording found`);
        continue;
      }
      const secs = ab.tracks.reduce((n, tr) => n + (tr.secs || 0), 0);
      log(`↓ ${id}: ${ab.tracks.length} parts, about ${Math.round((secs * 8000) / 1e6)} MB…`);
      const { promise } = await catalog.saveAudiobook(id);
      await promise;
      const after = await catalog.getAudiobook(id);
      log(after.offline === 'ready' ? `✓ ${id}: audiobook saved (${mb(after.bytes || 0)})` : `✗ ${id}: ${after.offline?.error || 'failed'}`);
    } catch (e) {
      log(`✗ ${id}: ${e.message}`);
    }
  }
}

await catalog.init(ROOT);
if (opts.assets) {
  log('Fonts and PDF/EPUB libraries…');
  try {
    await fetchAssets(ROOT, (m) => log(m.trim()));
  } catch (e) {
    log(`! could not save fonts/libraries: ${e.message}`);
  }
}
let failed = [];
if (opts.text) failed = await downloadTexts();
if (opts.audio) await downloadAudio();

const cache = path.join(ROOT, 'data', 'cache');
log(`Done. Saved on disk: texts ${mb(await dirSize(path.join(cache, 'content')))}, audiobooks ${mb(await dirSize(path.join(cache, 'audio')))}.`);
if (failed.length) {
  log(`${failed.length} book(s) could not be downloaded: ${failed.map((b) => b.id).join(', ')}. Run the command again to retry them.`);
  process.exitCode = 1;
}
