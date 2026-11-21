// Copies web fonts (Google Fonts) and the PDF/EPUB reader libraries into public/ so the app needs
// no internet connection. Files that already exist are skipped.
// Usage: node scripts/fetch-assets.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Noto+Sans:wght@400;500;600&family=Noto+Sans+Devanagari:wght@400;500;600&family=Noto+Sans+Telugu:wght@400;500;600&family=Noto+Serif:ital,wght@0,400;0,600;1,400&family=Noto+Serif+Devanagari:wght@400;600&family=Noto+Serif+Telugu:wght@400;600&display=swap';
// A modern browser user agent makes Google Fonts serve compact WOFF2 files.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const VENDOR = {
  'pdf.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'pdf.worker.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'jszip.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
};

const exists = (p) => fs.access(p).then(() => true, () => false);

async function download(url, dest, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

export async function fetchAssets(root, log = console.log) {
  const pub = path.join(root, 'public');
  const fontDir = path.join(pub, 'fonts');
  const vendorDir = path.join(pub, 'vendor');
  await fs.mkdir(fontDir, { recursive: true });
  await fs.mkdir(vendorDir, { recursive: true });

  for (const [name, url] of Object.entries(VENDOR)) {
    const dest = path.join(vendorDir, name);
    if (!(await exists(dest))) {
      await download(url, dest);
      log(`  saved vendor/${name}`);
    }
  }

  const cssPath = path.join(pub, 'css', 'fonts.css');
  if (await exists(cssPath)) {
    log('  fonts already saved');
    return;
  }
  const r = await fetch(FONT_CSS, { headers: { 'User-Agent': BROWSER_UA } });
  if (!r.ok) throw new Error(`Google Fonts → HTTP ${r.status}`);
  let css = await r.text();
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
  let n = 0;
  for (const url of urls) {
    const parts = new URL(url).pathname.split('/').filter(Boolean); // s/<family>/<version>/<file>
    const name = `${parts[1]}-${parts[parts.length - 1]}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dest = path.join(fontDir, name);
    if (!(await exists(dest))) await download(url, dest);
    css = css.split(url).join(`../fonts/${name}`);
    n++;
  }
  await fs.writeFile(cssPath, `/* Local copy of Google Fonts (Fraunces, Noto Sans/Serif incl. Devanagari & Telugu). SIL Open Font License. */\n${css}`);
  log(`  saved ${n} font files`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  fetchAssets(root).then(
    () => console.log('Assets ready.'),
    (e) => {
      console.error(e.message);
      process.exitCode = 1;
    },
  );
}
