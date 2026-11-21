import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const UA = 'Granthalaya/1.0 (personal multilingual reading app; Node.js)';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.weba': 'audio/webm',
  '.webm': 'audio/webm',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': MIME['.json'],
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function sendError(res, status, message, extra = {}) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  sendJSON(res, status, { error: message, ...extra });
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, 'Request is too large'));
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    req.on('error', (e) => {
      if (!done) reject(e);
    });
  });
}

export async function readJSON(req, limit = 80 * 1024 * 1024) {
  const buf = await readBody(req, limit);
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

/** Streams a request body to `dest` (via a temp file), enforcing a size limit. Resolves to bytes written. */
export function streamToFile(req, dest, limit) {
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.${process.pid}.part`;
    const out = fs.createWriteStream(tmp);
    let size = 0;
    let failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      req.unpipe(out);
      req.resume();
      out.destroy();
      fsp.rm(tmp, { force: true }).finally(() => reject(err));
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) fail(new HttpError(413, 'File is too large'));
    });
    req.on('error', fail);
    req.on('aborted', () => fail(new HttpError(400, 'Upload was cancelled')));
    out.on('error', fail);
    out.on('finish', async () => {
      if (failed) return;
      try {
        await fsp.rename(tmp, dest);
        resolve(size);
      } catch (e) {
        reject(e);
      }
    });
    req.pipe(out);
  });
}

/** Serves a file with HTTP Range support (needed for seeking in audio). */
export async function serveFile(req, res, filePath, { cache = 'no-cache', downloadName } = {}) {
  let st;
  try {
    st = await fsp.stat(filePath);
    if (!st.isFile()) throw new Error('not a file');
  } catch {
    sendError(res, 404, 'Not found');
    return;
  }
  const headers = {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
    'Last-Modified': st.mtime.toUTCString(),
  };
  if (downloadName) {
    headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  }
  const range = req.headers.range;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && (m[1] !== '' || m[2] !== '')) {
    let start;
    let end;
    if (m[1] === '') {
      start = Math.max(0, st.size - Number(m[2]));
      end = st.size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === '' ? st.size - 1 : Math.min(Number(m[2]), st.size - 1);
    }
    if (start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

export async function readJSONFile(file, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJSONAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data));
  await fsp.rename(tmp, file);
}
