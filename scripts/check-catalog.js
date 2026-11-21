// Verifies the catalogue: unique ids, known genres, and that every Gutenberg / Wikisource source exists.
// Usage: npm run check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = 'Granthalaya/1.0 (catalogue check; Node.js)';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'catalog');
const genres = new Set(JSON.parse(fs.readFileSync(path.join(dir, 'genres.json'), 'utf8')).map((g) => g.id));
const books = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'genres.json')) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const b of data.books) books.push({ lang: data.lang, ...b, file: f });
}

let problems = 0;
const fail = (msg) => {
  problems++;
  console.log(`  ✗ ${msg}`);
};

console.log(`Checking ${books.length} books…`);
const seen = new Set();
for (const b of books) {
  if (seen.has(b.id)) fail(`duplicate id ${b.id} (${b.file})`);
  seen.add(b.id);
  if (!/^[a-z0-9-]+$/.test(b.id)) fail(`bad id "${b.id}"`);
  for (const g of b.genres || []) if (!genres.has(g)) fail(`${b.id}: unknown genre "${g}"`);
  if (!b.genres?.length) fail(`${b.id}: no genres`);
}

// Gutenberg: request the first bytes from the mirror the app uses.
const classic = (id) => {
  const s = String(id);
  return `${s.length === 1 ? '0' : s.slice(0, -1).split('').join('/')}/${s}`;
};
const gut = books.filter((b) => b.source?.type === 'gutenberg');
console.log(`Gutenberg: ${gut.length} books`);
async function probe(id) {
  for (const name of [`${id}-0.txt`, `${id}.txt`, `${id}-8.txt`]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`https://mirrors.xmission.com/gutenberg/${classic(id)}/${name}`, {
          headers: { 'User-Agent': UA, Range: 'bytes=0-400' },
          signal: AbortSignal.timeout(30000),
        });
        const head = await r.text();
        if (r.status === 404) break;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return head;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
      }
    }
  }
  throw new Error('not found on the mirror');
}
for (let i = 0; i < gut.length; i += 2) {
  await Promise.all(
    gut.slice(i, i + 2).map(async (b) => {
      const id = b.source.id;
      try {
        const head = await probe(id);
        if (!/Project Gutenberg/i.test(head)) fail(`${b.id}: Gutenberg #${id} → unexpected content`);
        else console.log(`  ✓ ${b.id}: ${(head.match(/(?:eBook|EBook|Etext) of ([^\r\n]+)/i) || [])[1] || id}`);
      } catch (e) {
        fail(`${b.id}: Gutenberg #${id} → ${e.message}`);
      }
    }),
  );
}

// Wikisource: check page titles in batches of 50 per language.
const ws = books.filter((b) => b.source?.type === 'wikisource');
console.log(`Wikisource: ${ws.length} books`);
const byLang = {};
for (const b of ws) (byLang[b.source.lang || b.lang] ||= []).push(b);
for (const [lang, list] of Object.entries(byLang)) {
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const body = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: chunk.map((b) => b.source.page).join('|') });
    const r = await fetch(`https://${lang}.wikisource.org/w/api.php`, { method: 'POST', headers: { 'User-Agent': UA }, body });
    const j = await r.json();
    const map = (arr) => Object.fromEntries((arr || []).map((x) => [x.from, x.to]));
    const norm = map(j.query.normalized);
    const redir = map(j.query.redirects);
    const pages = Object.fromEntries(j.query.pages.map((p) => [p.title, p]));
    for (const b of chunk) {
      const n = norm[b.source.page] || b.source.page;
      const p = pages[redir[n] || n];
      if (!p || p.missing) fail(`${b.id}: Wikisource page not found (${lang}: ${b.source.page})`);
      else console.log(`  ✓ ${b.id}: ${p.title}`);
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
}

console.log(problems ? `\n${problems} problem(s) found.` : '\nAll good.');
process.exitCode = problems ? 1 : 0;
