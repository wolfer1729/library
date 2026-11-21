import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendJSON, sendError, serveFile, readJSON, HttpError } from './server/util.js';
import * as catalog from './server/catalog.js';
import * as uploads from './server/uploads.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
// Optional password for other devices (phones etc.). The computer running the server never needs it.
const PASSWORD = process.env.LIBRARY_PASSWORD || '';

function isLocal(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function authorized(req) {
  if (!PASSWORD || isLocal(req)) return true;
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
  const want = Buffer.from(PASSWORD);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

const count = await catalog.init(ROOT);

const routes = [
  ['GET', /^\/api\/catalog$/, async (req, res) => sendJSON(res, 200, await catalog.publicCatalog())],

  // Book text. Downloads from Gutenberg/Wikisource happen in the background; the client polls
  // with ?from=<chapters it already has> and can start reading before the whole book arrives.
  ['GET', /^\/api\/books\/([\w-]+)\/content$/, async (req, res, [id], url) => {
    const from = Math.max(0, parseInt(url.searchParams.get('from') || '0', 10) || 0);
    const r = await catalog.getContent(id, { retry: url.searchParams.has('retry') });
    sendJSON(res, 200, {
      status: r.status,
      total: r.chapters.length,
      from,
      chapters: r.chapters.slice(from),
      progress: r.progress || null,
      error: r.error || null,
    });
  }],

  ['GET', /^\/api\/books\/([\w-]+)\/audiobook$/, async (req, res, [id]) => sendJSON(res, 200, await catalog.getAudiobook(id))],

  // Save a LibriVox audiobook on this computer for offline listening (or remove it again).
  ['POST', /^\/api\/books\/([\w-]+)\/audiobook\/offline$/, async (req, res, [id]) => {
    const { job } = await catalog.saveAudiobook(id);
    sendJSON(res, 202, job);
  }],
  ['DELETE', /^\/api\/books\/([\w-]+)\/audiobook\/offline$/, async (req, res, [id]) => {
    await catalog.deleteSavedAudiobook(id);
    sendJSON(res, 200, { ok: true });
  }],
  ['GET', /^\/files\/audio\/([\w-]+)\/([\w.-]+)$/, async (req, res, [id, file]) => {
    const p = catalog.audioFilePath(id, file);
    if (!p) return sendError(res, 404, 'Not found');
    await serveFile(req, res, p, { cache: 'private, max-age=86400' });
  }],

  ['POST', /^\/api\/uploads$/, async (req, res) => {
    const meta = await uploads.create(await readJSON(req));
    sendJSON(res, 201, uploads.toPublic(meta));
  }],
  ['PUT', /^\/api\/uploads\/([\w-]+)$/, async (req, res, [id]) => {
    const meta = await uploads.update(id, await readJSON(req));
    sendJSON(res, 200, uploads.toPublic(meta));
  }],
  ['DELETE', /^\/api\/uploads\/([\w-]+)$/, async (req, res, [id]) => {
    await uploads.remove(id);
    sendJSON(res, 200, { ok: true });
  }],
  // Raw file upload: PUT /api/uploads/<id>/<cover|original|audio>?name=<original file name>
  ['PUT', /^\/api\/uploads\/([\w-]+)\/(cover|original|audio)$/, async (req, res, [id, kind], url) => {
    const meta = await uploads.putFile(id, kind, url.searchParams.get('name') || '', req);
    sendJSON(res, 200, uploads.toPublic(meta));
  }],
  ['DELETE', /^\/api\/uploads\/([\w-]+)\/files\/([\w.-]+)$/, async (req, res, [id, file]) => {
    const meta = await uploads.removeFile(id, file);
    sendJSON(res, 200, uploads.toPublic(meta));
  }],
  ['GET', /^\/files\/uploads\/([\w-]+)\/([\w.-]+)$/, async (req, res, [id, file], url) => {
    const f = uploads.isUploadId(id) ? await uploads.storedFile(id, file) : null;
    if (!f) return sendError(res, 404, 'Not found');
    await serveFile(req, res, f.path, { cache: 'private, max-age=3600', downloadName: url.searchParams.has('download') ? f.name : undefined });
  }],
];

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return sendError(res, 400, 'Bad path');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return sendError(res, 403, 'Forbidden');
  await serveFile(req, res, file, { cache: 'no-cache' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Granthalaya library", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('This library is password-protected. Any user name works; enter the library password.');
    return;
  }
  try {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    for (const [m, re, handler] of routes) {
      const match = re.exec(url.pathname);
      if (match && m === method) {
        await handler(req, res, match.slice(1), url);
        return;
      }
    }
    if (url.pathname.startsWith('/api/')) return sendError(res, 404, 'Unknown API route');
    if (method !== 'GET') return sendError(res, 405, 'Method not allowed');
    await serveStatic(req, res, url.pathname);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    sendError(res, status, status === 500 ? 'Something went wrong on the server' : e.message);
  }
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Granthalaya is running with ${count} catalogue books → http://${shown}:${PORT}`);
  if (HOST === '0.0.0.0') {
    const addrs = Object.entries(os.networkInterfaces())
      .flatMap(([name, list]) => (list || []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, ip: a.address })))
      .filter((a) => !a.ip.startsWith('169.254.'));
    console.log('\nOpen one of these on your phone (it must be on the same Wi-Fi, or on Tailscale for 100.x addresses):');
    for (const a of addrs) console.log(`   http://${a.ip}:${PORT}    (${a.name})`);
    console.log(PASSWORD ? '\nPassword protection is ON: any user name, then the library password.' : '\nNo password is set: anyone on this network can open the library.');
  }
});
