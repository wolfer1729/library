// Text processing: plain text -> chapters, and Wikisource HTML -> paragraphs.
// A chapter is { title: string, paras: Array<string | { h: string }> }.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•', middot: '·',
  zwnj: '‌', zwj: '‍', shy: '', copy: '©', deg: '°', times: '×', para: '¶', sect: '§',
  thinsp: ' ', ensp: ' ', emsp: ' ', prime: '′', Prime: '″', dagger: '†', Dagger: '‡', minus: '−',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!cp || cp > 0x10ffff) return '';
      if (cp === 0x200b || cp === 0xfeff) return '';
      if (cp === 160) return ' ';
      return String.fromCodePoint(cp);
    }
    return ENTITIES[e] ?? m;
  });
}

const hasWords = (s) => /[\p{L}\p{N}]/u.test(s);

// ---------------------------------------------------------------- plain text

const WORD_NUM =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last|final';
const KEYWORD_HEAD = new RegExp(
  `^(?:chapter|book|part|volume|vol\\.?|act|scene|stave|letter|canto|section|adventure|episode|lecture)\\s+` +
    `(?:[ivxlcdm]+\\b|\\d+\\b|the\\s+\\w+|(?:${WORD_NUM})\\b)`,
  'i',
);
const SOLO_HEAD = /^(?:prologue|epilogue|preface|introduction|conclusion|afterword|foreword|postscript)\.?$/i;
const INDIC_HEAD =
  /^(?:अध्याय|परिच्छेद|प्रकरण|खण्ड|खंड|भाग|सर्ग|అధ్యాయము|అధ్యాయం|ప్రకరణము|ప్రకరణం|భాగము|భాగం|సర్గ)\s*[-—:.]?\s*[\d०-९౦-౯]+/;

export function isHeading(s) {
  const t = s.trim();
  if (!t || t.length > 90 || t.includes('\n')) return false;
  if (KEYWORD_HEAD.test(t)) return true;
  if (SOLO_HEAD.test(t)) return true;
  if (/^[IVXLC]+\.?$/.test(t)) return true; // "IV" or "IV."
  if (/^[IVXLC]+\.\s+\S/.test(t) && t === t.toUpperCase() && /[A-Z]/.test(t.slice(4))) return true; // "I. A SCANDAL IN BOHEMIA"
  if (/^[\d०-९౦-౯]{1,3}[.)]?$/.test(t)) return true;
  if (INDIC_HEAD.test(t)) return true;
  return false;
}

function looksLikeSubtitle(s) {
  const t = s.trim();
  if (!t || t.length > 70 || t.includes('\n') || isHeading(t)) return false;
  if (/[,;:]$/.test(t)) return false;
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) return true;
  if (/[.!?]\s+\S/.test(t)) return false; // contains a full sentence: it's body text
  // Title Case-ish line without terminal sentence punctuation.
  return !/[.?!"”’']$/.test(t) && /^[“"'‘A-Z\p{Lu}]/u.test(t);
}

/** Splits raw text into paragraphs, unwrapping hard-wrapped prose but keeping verse line breaks. */
export function textToParas(text) {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .replace(/^﻿/, '')
    .replace(/[​﻿]/g, '')
    .split(/\n[ \t]*\n+/);
  const paras = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
    if (!lines.length) continue;
    const joined = lines.join(' ').trim();
    if (/^\[(?:Illustration|Image)[^\]]*\]?$/i.test(joined)) continue;
    let p;
    const avg = lines.reduce((n, l) => n + l.trim().length, 0) / lines.length;
    if (lines.length >= 2 && avg < 46 && lines.every((l) => l.trim().length < 62)) {
      p = lines.map((l) => l.trim()).join('\n'); // verse / list
    } else {
      p = lines.map((l) => l.trim()).join(' ');
    }
    p = p
      .replace(/_([^_\n]+)_/g, '$1')
      .replace(/(^|[\s(“"‘'])_(?=\S)/g, '$1')
      .replace(/(\S)_(?=$|[\s.,;:!?)”"’'])/gm, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    if (!p) continue;
    if (!hasWords(p)) {
      if (/[*⁂✱]/.test(p) && p.length < 30) paras.push('* * *');
      continue;
    }
    paras.push(p);
  }
  return paras;
}

function textLen(paras) {
  let n = 0;
  for (const p of paras) n += typeof p === 'string' ? p.length : p.h.length;
  return n;
}

function chunkIntoSections(paras, target = 15000) {
  const out = [];
  let cur = [];
  let len = 0;
  for (const p of paras) {
    cur.push(p);
    len += typeof p === 'string' ? p.length : p.h.length;
    if (len >= target) {
      out.push({ title: '', paras: cur });
      cur = [];
      len = 0;
    }
  }
  if (cur.length) out.push({ title: '', paras: cur });
  return out;
}

const cleanTitle = (s) => s.replace(/[[\]_]/g, '').replace(/\s+/g, ' ').trim();
const joinTitle = (a, b) => (/[.:—–-]$/.test(a) ? `${a} ${b}` : `${a}. ${b}`);

/** Returns a chapter title if the paragraph is a heading (incl. "CHAPTER I.\nDown the Rabbit-Hole"). */
function headingOf(p) {
  if (typeof p !== 'string') return null;
  if (!p.includes('\n')) return isHeading(p) ? cleanTitle(p) : null;
  const lines = p.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length <= 3 && p.length < 160 && isHeading(lines[0]) && !lines.slice(1).some(isHeading)) {
    return cleanTitle(lines.reduce(joinTitle));
  }
  return null;
}

/** Plain text -> chapters, detecting headings such as "CHAPTER IV", "Book the First", "अध्याय ३". */
export function splitPlainText(text) {
  const paras = textToParas(text);
  if (!paras.length) return [];
  const heads = paras.map(headingOf);
  let chapters = [{ title: '', paras: [] }];
  for (let i = 0; i < paras.length; i++) {
    if (!heads[i]) {
      chapters[chapters.length - 1].paras.push(paras[i]);
      continue;
    }
    let j = i;
    while (j + 1 < paras.length && heads[j + 1]) j++;
    let run = j - i + 1;
    if (run >= 3) {
      // A run of headings is a table of contents: keep it as text. The run's last heading (or last
      // two, e.g. "BOOK ONE" + "CHAPTER I") is followed by body text, so it starts a real chapter.
      const keep = /^(?:book|part|volume)\b/i.test(heads[j - 1]) ? 2 : 1;
      for (let k = i; k <= j - keep; k++) chapters[chapters.length - 1].paras.push({ h: heads[k] });
      i = j - keep + 1;
      run = keep;
    }
    // One heading, or two in a row ("BOOK ONE" + "CHAPTER 1"): a single chapter title.
    let title = run === 2 ? `${heads[i]} — ${heads[j]}` : heads[i];
    const next = paras[j + 1];
    if (next && looksLikeSubtitle(next)) {
      title = joinTitle(title, cleanTitle(next));
      j++;
    }
    chapters.push({ title, paras: [] });
    i = j;
  }
  // Front matter: everything before the first substantial chapter (title pages, contents lists).
  const firstReal = chapters.findIndex((c, idx) => idx > 0 && textLen(c.paras) >= 3000);
  if (firstReal > 1) {
    const front = { title: '', paras: [] };
    for (const c of chapters.slice(0, firstReal)) {
      if (textLen(c.paras) >= 1500 && c.title) {
        front.keep = (front.keep || []).concat([c]);
        continue;
      }
      if (c.title) front.paras.push({ h: c.title });
      front.paras.push(...c.paras);
    }
    chapters = [front, ...(front.keep || []), ...chapters.slice(firstReal)];
    delete front.keep;
  }
  // Merge remaining "thin" chapters (a heading with almost no text) into their neighbours.
  const merged = [];
  for (const c of chapters) {
    const thin = textLen(c.paras) < 300;
    if (thin && merged.length) {
      const prev = merged[merged.length - 1];
      if (c.title) prev.paras.push({ h: c.title });
      prev.paras.push(...c.paras);
    } else if (thin && !merged.length) {
      merged.push({ title: '', paras: c.title ? [{ h: c.title }, ...c.paras] : [...c.paras] });
    } else {
      merged.push(c);
    }
  }
  chapters = merged.filter((c) => c.paras.length);
  const total = textLen(paras);
  if (chapters.length < 2 || chapters.length > 600) {
    return total < 25000 ? [{ title: '', paras }] : chunkIntoSections(paras);
  }
  // A huge single chapter (heading detection missed most of the book) is split for usability.
  return chapters.flatMap((c) => (textLen(c.paras) > 250000 ? chunkIntoSections(c.paras).map((s, i) => ({ title: i ? `${c.title} (${i + 1})` : c.title, paras: s.paras })) : [c]));
}

/** Normalises chapters sent by a client (e.g. from an EPUB) into the canonical shape. */
export function sanitizeChapters(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const c of input.slice(0, 5000)) {
    if (!c || !Array.isArray(c.paras)) continue;
    const paras = [];
    for (const p of c.paras) {
      if (typeof p === 'string') {
        const t = p.replace(/[​﻿]/g, '').trim();
        if (t && hasWords(t)) paras.push(t.slice(0, 50000));
      } else if (p && typeof p.h === 'string' && p.h.trim()) {
        paras.push({ h: p.h.trim().slice(0, 500) });
      }
    }
    if (paras.length) out.push({ title: String(c.title || '').trim().slice(0, 300), paras });
  }
  return out;
}

// ---------------------------------------------------------------- HTML

const VOID = new Set(['br', 'img', 'hr', 'wbr', 'input', 'meta', 'link', 'area', 'col', 'source', 'embed', 'track', 'param', 'base']);
const BLOCK = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'dl', 'dd', 'dt', 'tr', 'table', 'tbody', 'thead', 'tfoot',
  'blockquote', 'center', 'section', 'article', 'pre', 'figure', 'figcaption', 'caption', 'td', 'th', 'header', 'footer',
  'aside', 'nav', 'main', 'body', 'html',
]);
const SKIP_TAGS = new Set(['style', 'script', 'noscript', 'template', 'head', 'title', 'svg', 'math', 'button', 'select', 'textarea']);
const SKIP_CLASS =
  /(?:^|\s)(?:ws-noexport|noprint|navbox|navbox-inner|mw-editsection|reference|mw-references-wrap|references|reflist|licenseContainer|licensetpl|pagenum|ws-pagenum|metadata|mw-cite-backlink|catlinks|ambox|mbox-small|sisitem|mw-jump-link|printfooter|hiddenStructure|mw-kartographer-maplink)(?:\s|$)/i;
const SKIP_ID = /^(?:headertemplate|ws-data|toc|catlinks|footer|navigationNotes)$/i;

/**
 * Converts (MediaWiki) HTML into text blocks. Also collects internal /wiki/ links found in the
 * readable content (used to discover chapter sub-pages on Wikisource).
 */
export function htmlToBlocks(html) {
  const blocks = [];
  const links = [];
  const stack = [];
  let skipDepth = 0;
  let headDepth = 0;
  let preDepth = 0;
  let cur = '';
  let curLink = null;

  const flush = () => {
    const t = cur
      .replace(/[​﻿]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
    cur = '';
    if (!t) return;
    if (!hasWords(t)) {
      if (/[*⁂✱]/.test(t) && t.length < 30) blocks.push({ p: '* * *' });
      return;
    }
    blocks.push(headDepth > 0 ? { h: t.replace(/\n/g, ' ') } : { p: t });
  };

  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      if (skipDepth) continue;
      let txt = decodeEntities(m[4]);
      if (!preDepth) txt = txt.replace(/[\r\n\t ]+/g, ' ');
      cur += txt;
      if (curLink) curLink.len += txt.trim().length;
      continue;
    }
    if (m[2] === undefined) {
      if (m[0] === '<' && !skipDepth) cur += '<';
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    if (!closing) {
      if (tag === 'br') {
        if (!skipDepth) cur += '\n';
        continue;
      }
      if (VOID.has(tag)) {
        if (tag === 'hr' && !skipDepth) flush();
        continue;
      }
      if (/\/\s*$/.test(attrs)) continue; // self-closing non-void element
      const cls = decodeEntities((/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs) || [])[1] || '');
      const id = (/\bid\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1] || '';
      const skip = SKIP_TAGS.has(tag) || SKIP_CLASS.test(cls) || SKIP_ID.test(id) || /display:\s*none/i.test(attrs);
      if (!skipDepth && BLOCK.has(tag)) flush();
      const entry = { tag, skip, head: /^h[1-6]$/.test(tag), pre: tag === 'pre', link: null };
      if (skip) skipDepth++;
      if (entry.head) headDepth++;
      if (entry.pre) preDepth++;
      if (tag === 'a' && !skipDepth) {
        const href = (/\bhref\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1];
        if (href && href.startsWith('/wiki/')) {
          let title = href.slice(6).split('#')[0].split('?')[0];
          try {
            title = decodeURIComponent(title);
          } catch {
            /* keep raw */
          }
          title = decodeEntities(title).replace(/_/g, ' ');
          entry.link = curLink = { title, len: 0 };
          links.push(curLink);
        }
      }
      stack.push(entry);
    } else {
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          idx = i;
          break;
        }
      }
      if (idx < 0) continue;
      while (stack.length > idx) {
        const e = stack.pop();
        if (!skipDepth && BLOCK.has(e.tag)) flush();
        if (e.skip) skipDepth--;
        if (e.head) headDepth--;
        if (e.pre) preDepth--;
        if (e.link) curLink = null;
      }
    }
  }
  flush();
  return { blocks, links };
}

/** Finds the "next" link in a Wikisource header template. */
export function extractNext(html) {
  const div = /id="headernext"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (!div) return null;
  const a = /<a\s[^>]*href="\/wiki\/([^"#?]+)"/i.exec(div[1]);
  if (!a) return null;
  try {
    return decodeEntities(decodeURIComponent(a[1])).replace(/_/g, ' ');
  } catch {
    return null;
  }
}
