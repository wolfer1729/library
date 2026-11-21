import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { UA, sleep, writeJSONAtomic, readJSONFile } from './util.js';

// Saves LibriVox audiobooks to disk (data/cache/audio/<book id>/) so they play without internet.

export const audioDir = (cacheDir, id) => path.join(cacheDir, 'audio', id);

export function readManifest(cacheDir, id) {
  return readJSONFile(path.join(audioDir(cacheDir, id), 'index.json'), null);
}

async function fetchToFile(url, dest) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const tmp = `${dest}.part`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20 * 60 * 1000) });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
      const { size } = await fsp.stat(tmp);
      if (size < 1024) throw new Error('empty file');
      await fsp.rename(tmp, dest);
      return size;
    } catch (e) {
      lastErr = e;
      await fsp.rm(tmp, { force: true });
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error(`Could not download audio (${lastErr?.message || 'unknown error'})`);
}

/** Downloads every track of a LibriVox recording. Already-downloaded tracks are kept (resumable). */
export async function downloadAudiobook(cacheDir, id, ab, onProgress = () => {}) {
  const dir = audioDir(cacheDir, id);
  await fsp.mkdir(dir, { recursive: true });
  const tracks = [];
  for (let i = 0; i < ab.tracks.length; i++) {
    const tr = ab.tracks[i];
    const file = `${String(i + 1).padStart(3, '0')}.mp3`;
    const dest = path.join(dir, file);
    let size;
    try {
      size = (await fsp.stat(dest)).size;
    } catch {
      size = await fetchToFile(tr.url, dest);
    }
    tracks.push({ title: tr.title, file, secs: tr.secs, size });
    onProgress(i + 1, ab.tracks.length);
  }
  const manifest = {
    id,
    title: ab.title,
    url: ab.url,
    readers: ab.readers,
    totaltime: ab.totaltime,
    tracks,
    bytes: tracks.reduce((n, t) => n + t.size, 0),
    complete: true,
    savedAt: Date.now(),
  };
  await writeJSONAtomic(path.join(dir, 'index.json'), manifest);
  return manifest;
}

export async function removeAudiobook(cacheDir, id) {
  await fsp.rm(audioDir(cacheDir, id), { recursive: true, force: true });
}
