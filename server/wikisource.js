import crypto from 'node:crypto';
import path from 'node:path';
import { UA, readJSONFile, writeJSONAtomic, sleep } from './util.js';
import { htmlToBlocks, extractNext } from '../public/js/textproc.js';

// Wikimedia rate-limits aggressive clients, so all Wikisource requests share one slow, serial queue.
const GAP_MS = 1100;
let lastCall = 0;
let queue = Promise.resolve();

function throttle() {
  const turn = queue.then(async () => {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
  });
  queue = turn.catch(() => {});
  return turn;
}

export function wikisourceUrl(lang, page) {
  return `https://${lang}.wikisource.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`;
}

async function apiParse(lang, title) {
  const url =
    `https://${lang}.wikisource.org/w/api.php?action=parse&format=json&formatversion=2&prop=text&redirects=1` +
    `&disableeditsection=1&disablelimitreport=1&page=${encodeURIComponent(title)}`;
  let delay = 5000;
  for (let attempt = 0; attempt < 6; attempt++) {
    await throttle();
    let res;
    let body;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      body = await res.text();
    } catch (e) {
      if (attempt === 5) throw new Error(`Could not reach Wikisource (${e.message})`);
      await sleep(delay);
      delay = Math.min(delay * 2, 60000);
      continue;
    }
    if (res.status === 429 || res.status >= 500 || /^You are making too many requests/i.test(body)) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(ra > 0 ? Math.min(ra * 1000, 120000) : delay);
      delay = Math.min(delay * 2, 60000);
      continue;
    }
    let j;
    try {
      j = JSON.parse(body);
    } catch {
      await sleep(delay);
      delay = Math.min(delay * 2, 60000);
      continue;
    }
    if (j.error) {
      if (j.error.code === 'missingtitle') {
        const e = new Error(`Page not found on Wikisource: ${title}`);
        e.code = 'missing';
        throw e;
      }
      if (j.error.code === 'ratelimited' || j.error.code === 'maxlag') {
        await sleep(delay);
        delay = Math.min(delay * 2, 60000);
        continue;
      }
      throw new Error(`Wikisource error: ${j.error.info}`);
    }
    return { title: j.parse.title, html: j.parse.text };
  }
  throw new Error('Wikisource is limiting requests right now. Please try again in a few minutes.');
}

/** Resolves redirects/normalisation of a page title (a fast metadata query). */
async function resolveTitle(lang, title) {
  const url = `https://${lang}.wikisource.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&titles=${encodeURIComponent(title)}`;
  let delay = 5000;
  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      const j = await r.json();
      const page = j.query?.pages?.[0];
      if (page?.missing) {
        const e = new Error(`Page not found on Wikisource: ${title}`);
        e.code = 'missing';
        throw e;
      }
      if (page?.title) return page.title;
    } catch (e) {
      if (e.code === 'missing') throw e;
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 60000);
  }
  return title;
}

/**
 * Fetches a page's rendered HTML via index.php?action=render. This is served from Wikimedia's
 * parser cache and is several times faster than action=parse, which re-renders every page.
 */
async function fetchRendered(lang, title) {
  const url = `https://${lang}.wikisource.org/w/index.php?title=${encodeURIComponent(title)}&action=render`;
  let delay = 5000;
  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle();
    let res;
    let body;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      body = await res.text();
    } catch {
      await sleep(delay);
      delay = Math.min(delay * 2, 60000);
      continue;
    }
    if (res.status === 404) {
      const e = new Error(`Page not found on Wikisource: ${title}`);
      e.code = 'missing';
      throw e;
    }
    if (res.ok && body.includes('mw-parser-output')) {
      // Links are protocol-relative ("//xx.wikisource.org/wiki/…"); make them "/wiki/…" like action=parse.
      return body.split(`href="//${lang}.wikisource.org/wiki/`).join('href="/wiki/');
    }
    const ra = Number(res.headers.get('retry-after'));
    await sleep(ra > 0 ? Math.min(ra * 1000, 120000) : delay);
    delay = Math.min(delay * 2, 60000);
  }
  throw new Error('render failed');
}

async function fetchPage(lang, title, { resolve = false } = {}) {
  try {
    const resolved = resolve ? await resolveTitle(lang, title) : title;
    return { title: resolved, html: await fetchRendered(lang, resolved) };
  } catch (e) {
    if (e.code === 'missing') throw e;
    return apiParse(lang, title); // fallback: slower, but resolves titles itself
  }
}

const NUMERIC = /^[\s\d०-९౦-౯.()-]+$/;
const CHAPTER_WORD = { hi: 'अध्याय', te: 'అధ్యాయం', en: 'Chapter' };

// Wikisource editors are not consistent: a book's pages may be spelled "आनन्द मठ/…" and
// "आनन्दमठ/…", "कहानियाँ/…" and "कहानियां/…", or named "कर्मभूमि भाग 3" instead of "कर्मभूमि/…".
const normKey = (s) =>
  s
    .normalize('NFC')
    .replace(/ँ/g, 'ं')
    .replace(/[\s‌‍\-–—_.,()]/g, '');

/** Returns a test for "is this page title part of the book?". */
function bookMatcher(names) {
  const raws = [...new Set(names.filter(Boolean))];
  const keys = [...new Set(raws.map(normKey))];
  return (title) => {
    if (raws.includes(title)) return false;
    const k = normKey(title);
    if (keys.some((rk) => k !== rk && k.startsWith(rk) && k[rk.length] === '/')) return true;
    return raws.some((r) => title.startsWith(`${r} `) || title.startsWith(`${r}(`));
  };
}

const toAsciiDigits = (s) => s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966)).replace(/[౦-౯]/g, (d) => String(d.charCodeAt(0) - 0xc66));
const naturalOrder = (a, b) => toAsciiDigits(a).localeCompare(toAsciiDigits(b), undefined, { numeric: true });

/** Lists all sub-pages of a title ("Title/…") via the API. */
export async function listSubpages(lang, title) {
  const out = [];
  let cont = '';
  let failures = 0;
  for (let i = 0; i < 5 && failures < 3; ) {
    await throttle();
    const url = `https://${lang}.wikisource.org/w/api.php?action=query&format=json&formatversion=2&list=allpages&apnamespace=0&aplimit=500&apprefix=${encodeURIComponent(`${title}/`)}${cont}`;
    try {
      const j = await (await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(30000) })).json();
      if (!j.query) throw new Error('no result');
      out.push(...j.query.allpages.map((p) => p.title));
      if (!j.continue?.apcontinue) break;
      cont = `&apcontinue=${encodeURIComponent(j.continue.apcontinue)}`;
      i++;
    } catch {
      failures++;
      await sleep(4000 * failures);
    }
  }
  return out;
}

/**
 * Crawls a Wikisource work: the root page plus its sub-pages, in reading order. Chapters are
 * discovered by following tables of contents and each page's "next" link. Every fetched page is
 * cached on disk so an interrupted download resumes quickly.
 */
export async function crawlWikisource({ lang, page }, { cacheDir, onChapter, onProgress, maxPages = 600 }) {
  const getPage = async (t, isRoot = false) => {
    const key = crypto.createHash('sha1').update(`${lang}\n${t}`).digest('hex');
    const file = path.join(cacheDir, lang, `${key}.json`);
    const hit = await readJSONFile(file, null);
    if (hit) return hit;
    const { title, html } = await fetchPage(lang, t, { resolve: isRoot });
    const { blocks, links } = htmlToBlocks(html);
    const rec = { title, blocks, links, next: extractNext(html) };
    await writeJSONAtomic(file, rec);
    return rec;
  };

  const first = await getPage(page, true);
  const root = first.title;
  const inBook = bookMatcher([root, page]);
  const visited = new Set();
  const pending = [root];
  const backlog = []; // every in-book link seen so far, in order (used when a "next" chain breaks)
  let fetched = 0;
  let count = 0;
  let chars = 0;
  let listed = false;
  const seenText = new Set();

  const chapterName = (t) => {
    if (t === root || t === page) return '';
    if (t.includes('/') && !root.includes('/')) return t.split('/').pop().trim();
    if (t.startsWith(root)) return t.slice(root.length).replace(/^[/\s]+/, '').replace(/^\((.*)\)$/, '$1').trim() || t;
    return t.split('/').pop().trim();
  };

  for (;;) {
    if (!pending.length) {
      const nextFromBacklog = backlog.find((x) => !visited.has(x));
      if (nextFromBacklog) pending.push(nextFromBacklog);
      else if (!listed && chars < 150000 && fetched < maxPages) {
        // Still short: the "next" links probably stop early. Ask for every sub-page of the book.
        listed = true;
        const all = [...new Set([...(await listSubpages(lang, root)), ...(page !== root ? await listSubpages(lang, page) : [])])];
        pending.push(...all.filter((x) => !visited.has(x)).sort(naturalOrder));
      }
    }
    if (!pending.length || fetched >= maxPages) break;
    const t = pending.shift();
    if (visited.has(t)) continue;
    visited.add(t);
    const rec = t === root ? first : await getPage(t);
    fetched++;
    visited.add(rec.title);

    let total = 0;
    for (const b of rec.blocks) total += (b.p || b.h).length;
    const subLinks = rec.links.filter((l) => inBook(l.title));
    let linkLen = 0;
    for (const l of subLinks) linkLen += l.len;
    const own = total - linkLen;
    const fresh = [...new Set(subLinks.map((l) => l.title))].filter((x) => !visited.has(x));
    for (const x of fresh) if (!backlog.includes(x)) backlog.push(x);
    const isToc = subLinks.length >= 3 && own < Math.max(1500, total * 0.4);
    const nextInBook = rec.next && inBook(rec.next) && !visited.has(rec.next) ? rec.next : null;

    const isRootCover = t === root && nextInBook && own < 800;
    const include = isToc ? own > 1500 : !isRootCover;
    if (include && rec.blocks.length) {
      let title = chapterName(t);
      const firstHead = rec.blocks.find((b) => b.h);
      if ((!title || NUMERIC.test(title)) && firstHead && firstHead.h.length < 80 && t !== root) title = firstHead.h;
      if (title && NUMERIC.test(title)) title = `${CHAPTER_WORD[lang] || CHAPTER_WORD.en} ${title.trim()}`;
      const paras = rec.blocks.map((b) => (b.h ? { h: b.h } : b.p));
      // Some works have the same chapter transcribed twice under different page names.
      const fingerprint = `${total}:${rec.blocks.slice(0, 3).map((b) => b.p || b.h).join('|').slice(0, 300)}`;
      if (!seenText.has(fingerprint)) {
        seenText.add(fingerprint);
        onChapter({ title, paras });
        count++;
        chars += total;
      }
    }

    if (isToc) pending.unshift(...fresh);
    else if (nextInBook) pending.unshift(nextInBook);
    else if (fresh.length) pending.unshift(...fresh);
    onProgress?.({ pages: fetched, pending: pending.filter((x) => !visited.has(x)).length, chapters: count });
  }
  if (!count) throw new Error('No readable text was found for this book on Wikisource.');
  return { truncated: fetched >= maxPages && (pending.some((x) => !visited.has(x)) || backlog.some((x) => !visited.has(x))) };
}
