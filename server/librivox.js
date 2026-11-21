import { UA } from './util.js';

// LibriVox: free public-domain audiobooks read by volunteers (MP3s hosted on archive.org).

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'to', 'for', 'or']);
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tokens = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w));

function lastName(author) {
  const cleaned = String(author || '').replace(/\(.*?\)/g, '').trim();
  const parts = norm(cleaned).split(' ').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function score(ourTitle, theirTitle) {
  const A = tokens(ourTitle);
  const B = tokens(String(theirTitle).replace(/\(version \d+\)/i, ''));
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  const hit = A.filter((w) => setB.has(w)).length;
  return hit / A.length - 0.03 * Math.abs(B.length - A.length);
}

async function lvFetch(params) {
  const url = `https://librivox.org/api/feed/audiobooks/?format=json&${params}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  const body = await r.text();
  if (!r.ok && r.status !== 404) throw new Error(`LibriVox HTTP ${r.status}`);
  const end = body.lastIndexOf('}');
  try {
    return JSON.parse(body.slice(0, end + 1));
  } catch {
    return { books: [] };
  }
}

/** Finds the best matching LibriVox recording for a title/author, with its chapter MP3s. */
export async function findAudiobook({ title, author, lang = 'en' }) {
  const main = String(title).split(/[:;(,]/)[0].trim();
  // LibriVox files "The Adventures of Sherlock Holmes" as "Adventures of Sherlock Holmes".
  const bare = main.replace(/^(the|a|an)\s+/i, '');
  const prefixes = [...new Set([bare, main])].map((s) => s.split(/\s+/).slice(0, 4).join(' '));
  let books = [];
  for (const p of prefixes) {
    const data = await lvFetch(`title=${encodeURIComponent(`^${p}`)}&limit=40`);
    books = data.books || [];
    if (books.length) break;
  }
  const want = lastName(author);
  const language = { en: 'English', hi: 'Hindi', te: 'Telugu' }[lang] || 'English';
  const candidates = books
    .filter((b) => !b.language || b.language === language)
    .filter((b) => {
      if (!want) return true;
      return (b.authors || []).some((a) => {
        const ln = norm(a.last_name);
        return ln && (ln.startsWith(want.slice(0, 4)) || want.startsWith(ln.slice(0, 4)));
      });
    })
    .map((b) => ({ b, s: score(title, b.title) }))
    .filter((x) => x.s >= 0.6)
    .sort((x, y) => y.s - x.s || Number(x.b.id) - Number(y.b.id));
  if (!candidates.length) return { found: false };

  const best = candidates[0].b;
  const full = await lvFetch(`id=${encodeURIComponent(best.id)}&extended=1`);
  const book = (full.books || [])[0];
  const sections = (book?.sections || []).filter((s) => s.listen_url);
  if (!sections.length) return { found: false };
  return {
    found: true,
    source: 'librivox',
    title: book.title,
    url: book.url_librivox,
    totaltime: book.totaltime,
    readers: [...new Set(sections.flatMap((s) => (s.readers || []).map((r) => r.display_name)))].slice(0, 6),
    tracks: sections.map((s, i) => ({
      title: s.title || `Section ${i + 1}`,
      url: s.listen_url.replace(/^http:/, 'https:'),
      secs: Number(s.playtime) || 0,
    })),
  };
}
