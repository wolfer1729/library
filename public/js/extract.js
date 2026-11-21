import { loadScript, detectLang } from './util.js';

// Extracts readable text from files the user uploads, entirely in the browser.
// TXT/MD/HTML natively; EPUB via JSZip; PDF via Mozilla pdf.js (both loaded on demand from
// public/vendor/, so uploading works offline).

const PDFJS = 'vendor/pdf.min.js';
const PDFJS_WORKER = 'vendor/pdf.worker.min.js';
const JSZIP = 'vendor/jszip.min.js';

export const ACCEPT = '.txt,.text,.md,.markdown,.html,.htm,.xhtml,.epub,.pdf';

const BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'section', 'article', 'tr', 'td', 'th', 'dd', 'dt', 'figcaption', 'center', 'header', 'footer', 'aside', 'table', 'ul', 'ol', 'body']);
const SKIP = new Set(['script', 'style', 'noscript', 'head', 'title', 'svg', 'math', 'nav', 'template']);
const hasWords = (s) => /[\p{L}\p{N}]/u.test(s);

/** Walks a DOM tree and returns paragraphs (strings) and headings ({ h }). */
export function domToParas(root) {
  const out = [];
  let cur = '';
  const flush = (head) => {
    const t = cur.replace(/[ \t\r\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
    cur = '';
    if (t && hasWords(t)) out.push(head ? { h: t.replace(/\n/g, ' ') } : t);
  };
  const walk = (node, head) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        cur += n.nodeValue.replace(/\s+/g, ' ');
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.localName.toLowerCase();
      if (SKIP.has(tag)) continue;
      if (tag === 'br') {
        cur += '\n';
        continue;
      }
      const isHead = /^h[1-6]$/.test(tag);
      const block = BLOCKS.has(tag) || isHead;
      if (block) flush(head);
      walk(n, head || isHead);
      if (block) flush(head || isHead);
    }
  };
  walk(root, false);
  flush(false);
  return out;
}

function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    return new TextDecoder('windows-1252').decode(u8);
  }
}

const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

/**
 * @returns {Promise<{text?: string, chapters?: Array, meta: {title?, author?, lang?}, cover?: Blob, warnings: string[]}>}
 */
export async function extractFile(file, onProgress = () => {}) {
  const ext = extOf(file.name);
  let result;
  if (ext === 'pdf') result = await extractPdf(file, onProgress);
  else if (ext === 'epub') result = await extractEpub(file, onProgress);
  else if (['html', 'htm', 'xhtml'].includes(ext)) result = extractHtml(decodeText(await file.arrayBuffer()));
  else result = { text: decodeText(await file.arrayBuffer()).replace(/\r\n?/g, '\n'), meta: {}, warnings: [] };
  const sample = result.text ?? (result.chapters || []).flatMap((c) => c.paras.slice(0, 30)).map((p) => (typeof p === 'string' ? p : p.h)).join(' ');
  result.meta.lang = result.meta.lang || detectLang(sample);
  result.stats = stats(result);
  return result;
}

function stats(r) {
  const text = r.text ?? (r.chapters || []).flatMap((c) => c.paras.map((p) => (typeof p === 'string' ? p : p.h))).join('\n\n');
  const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
  return { chars: text.length, words, chapters: r.chapters?.length || 0, sample: text.slice(0, 700) };
}

function extractHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const paras = domToParas(doc.body || doc.documentElement);
  return {
    text: paras.map((p) => (typeof p === 'string' ? p : p.h)).join('\n\n'),
    meta: { title: doc.title?.trim() || undefined },
    warnings: [],
  };
}

// ---------------------------------------------------------------- EPUB

async function extractEpub(file, onProgress) {
  await loadScript(JSZIP);
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const readText = async (p) => {
    const f = zip.file(p) || zip.file(decodeURIComponent(p));
    return f ? f.async('string') : null;
  };
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const container = await readText('META-INF/container.xml');
  if (!container) throw new Error('epub-invalid');
  const opfPath = xml(container).querySelector('rootfile')?.getAttribute('full-path');
  const opfText = opfPath && (await readText(opfPath));
  if (!opfText) throw new Error('epub-invalid');
  const opf = xml(opfText);
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const resolve = (href) => resolveFrom(base, href);
  const byTag = (doc, tag) => [...doc.getElementsByTagName(tag), ...doc.getElementsByTagNameNS('*', tag.split(':').pop())];
  const manifest = new Map();
  for (const it of byTag(opf, 'item')) {
    manifest.set(it.getAttribute('id'), { href: resolve(it.getAttribute('href') || ''), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' });
  }
  const meta = {
    title: byTag(opf, 'dc:title')[0]?.textContent?.trim(),
    author: byTag(opf, 'dc:creator')[0]?.textContent?.trim(),
  };
  const dcLang = byTag(opf, 'dc:language')[0]?.textContent?.trim().slice(0, 2).toLowerCase();
  if (['en', 'hi', 'te'].includes(dcLang)) meta.lang = dcLang;

  // Chapter labels from the table of contents (EPUB 3 nav or EPUB 2 NCX).
  const labels = new Map();
  try {
    const nav = [...manifest.values()].find((m) => /\bnav\b/.test(m.props));
    if (nav) {
      const doc = new DOMParser().parseFromString(await readText(nav.href), 'application/xhtml+xml');
      const navBase = nav.href.includes('/') ? nav.href.slice(0, nav.href.lastIndexOf('/') + 1) : '';
      for (const a of doc.querySelectorAll('a[href]')) {
        const target = resolveFrom(navBase, a.getAttribute('href'));
        if (!labels.has(target)) labels.set(target, a.textContent.trim());
      }
    } else {
      const tocId = byTag(opf, 'spine')[0]?.getAttribute('toc');
      const ncx = tocId && manifest.get(tocId);
      if (ncx) {
        const doc = xml(await readText(ncx.href));
        const ncxBase = ncx.href.includes('/') ? ncx.href.slice(0, ncx.href.lastIndexOf('/') + 1) : '';
        for (const np of byTag(doc, 'navPoint')) {
          const src = np.getElementsByTagName('content')[0]?.getAttribute('src');
          const label = np.getElementsByTagName('text')[0]?.textContent?.trim();
          if (src && label) {
            const target = resolveFrom(ncxBase, src);
            if (!labels.has(target)) labels.set(target, label);
          }
        }
      }
    }
  } catch {
    /* labels are optional */
  }

  const spine = byTag(opf, 'itemref').map((r) => manifest.get(r.getAttribute('idref'))).filter((m) => m && /html|xml/.test(m.type));
  const chapters = [];
  for (let i = 0; i < spine.length; i++) {
    onProgress((i + 1) / spine.length);
    const src = await readText(spine[i].href);
    if (!src) continue;
    let doc = new DOMParser().parseFromString(src, 'application/xhtml+xml');
    if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(src, 'text/html');
    const body = doc.body || doc.getElementsByTagName('body')[0] || doc.documentElement;
    const paras = domToParas(body);
    if (!paras.length) continue;
    let title = labels.get(spine[i].href) || '';
    if (!title && typeof paras[0] === 'object' && paras[0].h.length < 120) title = paras[0].h;
    if (title && typeof paras[0] === 'object' && paras[0].h.trim() === title.trim()) paras.shift();
    if (!paras.length) continue;
    chapters.push({ title, paras });
  }
  if (!chapters.length) throw new Error('no-text');

  let cover;
  try {
    const coverMetaId = [...opf.getElementsByTagName('meta')].find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    const item = [...manifest.values()].find((m) => /cover-image/.test(m.props)) || (coverMetaId && manifest.get(coverMetaId));
    if (item && /^image\//.test(item.type)) {
      const blob = await zip.file(item.href)?.async('blob');
      if (blob) cover = new File([blob], `cover.${item.type.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`, { type: item.type });
      if (cover && /svg/.test(cover.type)) cover = undefined;
    }
  } catch {
    /* no cover */
  }
  return { chapters, meta, cover, warnings: [] };
}

function resolveFrom(base, href) {
  const parts = (base + href.split('#')[0]).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  try {
    return decodeURIComponent(out.join('/'));
  } catch {
    return out.join('/');
  }
}

// ---------------------------------------------------------------- PDF

async function extractPdf(file, onProgress) {
  await loadScript(PDFJS);
  const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const info = (await doc.getMetadata().catch(() => null))?.info || {};
  const paras = [];
  let cur = '';
  const push = () => {
    const t = cur.replace(/\s+/g, ' ').trim();
    cur = '';
    if (t && hasWords(t) && !/^[\divxlc\s.\-–—]+$/i.test(t)) paras.push(t);
  };
  let cover;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    if (p === 1) cover = await renderCover(page).catch(() => undefined);
    const tc = await page.getTextContent();
    const lines = [];
    let line = null;
    let lastEnd = null;
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const y = it.transform[5];
      const x = it.transform[4];
      const h = Math.abs(it.transform[3]) || it.height || 10;
      if (!line || Math.abs(y - line.y) > h * 0.5) {
        if (line && line.text.trim()) lines.push(line);
        line = { y, h, text: '' };
        lastEnd = null;
      }
      const gap = lastEnd != null ? x - lastEnd : 0;
      if (gap > h * 0.15 && !/\s$/.test(line.text) && !/^\s/.test(it.str)) line.text += ' ';
      line.text += it.str;
      lastEnd = x + (it.width || 0);
      if (it.hasEOL) {
        if (line.text.trim()) lines.push(line);
        line = null;
      }
    }
    if (line && line.text.trim()) lines.push(line);
    const gaps = [];
    for (let i = 1; i < lines.length; i++) {
      const g = lines[i - 1].y - lines[i].y;
      if (g > 0) gaps.push(g);
    }
    gaps.sort((a, b) => a - b);
    const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 14;
    for (let i = 0; i < lines.length; i++) {
      const txt = lines[i].text.replace(/\s+/g, ' ').trim();
      if (i > 0) {
        const g = lines[i - 1].y - lines[i].y;
        if (g > typical * 1.45 || g < 0) push();
      }
      if (/[a-z]-$/.test(cur) && /^[a-z]/.test(txt)) cur = cur.slice(0, -1) + txt;
      else cur += (cur ? ' ' : '') + txt;
    }
    if (/[.!?।॥"”’:]$/.test(cur.trim())) push();
    onProgress(p / doc.numPages);
  }
  push();
  const warnings = [];
  if (!paras.length) warnings.push('pdf-no-text');
  return { text: paras.join('\n\n'), meta: { title: info.Title?.trim() || undefined, author: info.Author?.trim() || undefined }, cover, warnings };
}

async function renderCover(page) {
  const vp = page.getViewport({ scale: 1 });
  const scale = 420 / vp.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  return blob ? new File([blob], 'cover.jpg', { type: 'image/jpeg' }) : undefined;
}
