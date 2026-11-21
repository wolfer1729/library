import { UA } from './util.js';

// gutenberg.org itself often refuses automated downloads (HTTP 503), so official mirrors are tried
// first. Mirrors use the classic layout: book 2600 lives at /2/6/0/2600/2600-0.txt (UTF-8).
const classic = (id) => {
  const s = String(id);
  return `${s.length === 1 ? '0' : s.slice(0, -1).split('').join('/')}/${s}`;
};
// Older books have no "-0" (UTF-8) file, only "<id>.txt" (ASCII) or "<id>-8.txt" (Latin-1).
const SOURCES = [
  { url: (id) => `https://mirrors.xmission.com/gutenberg/${classic(id)}/${id}-0.txt`, timeout: 120000 },
  { url: (id) => `https://mirrors.xmission.com/gutenberg/${classic(id)}/${id}.txt`, timeout: 120000 },
  { url: (id) => `https://mirrors.xmission.com/gutenberg/${classic(id)}/${id}-8.txt`, timeout: 120000 },
  { url: (id) => `https://mirror.csclub.uwaterloo.ca/gutenberg/${classic(id)}/${id}-0.txt`, timeout: 120000 },
  { url: (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`, timeout: 120000 },
  { url: (id) => `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.txt`, timeout: 300000 },
];

export function gutenbergUrl(id) {
  return `https://www.gutenberg.org/ebooks/${id}`;
}

function decode(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export async function fetchGutenberg(id) {
  if (!/^\d+$/.test(String(id))) throw new Error('Invalid Gutenberg id');
  const errors = [];
  for (const src of SOURCES) {
    const url = src.url(id);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(src.timeout) });
      if (!r.ok) {
        errors.push(`${new URL(url).host}: HTTP ${r.status}`);
        continue;
      }
      const text = decode(await r.arrayBuffer());
      if (text.length < 500) {
        errors.push(`${new URL(url).host}: empty file`);
        continue;
      }
      return text;
    } catch (e) {
      errors.push(`${new URL(url).host}: ${e.name === 'TimeoutError' ? 'timed out' : e.message}`);
    }
  }
  throw new Error(`Could not download this book from Project Gutenberg (${errors.join('; ')})`);
}

/** Removes the Project Gutenberg licence header/footer, keeping only the book text. */
export function stripGutenberg(text) {
  let t = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const start = t.search(/^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*$/im);
  if (start >= 0) t = t.slice(t.indexOf('\n', start) + 1);
  const end = t.search(/^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK/im);
  if (end >= 0) t = t.slice(0, end);
  t = t.replace(/^\s*End of (?:the )?Project Gutenberg[^\n]*$/gim, '');
  // Producer credits at the very top.
  t = t.replace(/^\s*(?:Produced by|This e-?book was produced by|E-text prepared by|Transcribed from)[^\n]*(?:\n[^\n]+)*\n/i, '');
  return t.trim();
}
