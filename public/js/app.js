import { t, getUiLang, setUiLang, langName, genreLabel, UI_LANGS } from './i18n.js';
import { api } from './api.js';
import { $, $$, esc, store, debounce, toast, parseHash, fmtTime, fmtSize } from './util.js';
import { icons } from './icons.js';
import { coverHTML } from './covers.js';
import { player } from './player.js';
import { mountReader } from './reader.js';
import { mountUpload } from './upload.js';

const state = {
  genres: [],
  books: [],
  byId: new Map(),
  loaded: false,
  bookLang: store.get('bookLang', 'all'),
};
const view = $('#view');
let cleanup = null;

const LANG_BADGE = { en: 'EN', hi: 'हिं', te: 'తె' };
const scriptLang = (b) => (['hi', 'te'].includes(b.lang) ? b.lang : 'en');
const inLang = (b) => state.bookLang === 'all' || b.lang === state.bookLang;
const genreById = (id) => state.genres.find((g) => g.id === id);

async function loadCatalog() {
  const data = await api.catalog();
  state.genres = data.genres;
  state.books = data.books;
  state.byId = new Map(data.books.map((b) => [b.id, b]));
  state.loaded = true;
}

function isDark() {
  const th = document.documentElement.dataset.theme;
  return th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

// ---------------------------------------------------------------- top bar

function renderTopbar() {
  const { parts, query } = parseHash();
  const q = parts[0] === 'search' ? query.get('q') || '' : '';
  $('#topbar').innerHTML = `
    <a class="brand" href="#/"><img src="img/icon.svg" alt=""><span class="brand-name">${esc(t('appName'))}</span></a>
    <form class="search" role="search">${icons.search}<input type="search" name="q" placeholder="${esc(t('searchPlaceholder'))}" aria-label="${esc(t('search'))}" value="${esc(q)}" autocomplete="off" enterkeyhint="search"></form>
    <div class="top-actions">
      <a class="btn" href="#/add" title="${esc(t('addBook'))}">${icons.plus}<span class="label">${esc(t('addBook'))}</span></a>
      <div class="seg" role="group" aria-label="${esc(t('uiLanguage'))}">${UI_LANGS.map(
        (l) => `<button type="button" data-ui="${l.id}" lang="${l.id}" aria-pressed="${l.id === getUiLang()}" title="${esc(l.name)}">${esc(l.short)}</button>`,
      ).join('')}</div>
      <button type="button" class="icon-btn" data-theme-toggle title="${esc(t('toggleTheme'))}" aria-label="${esc(t('toggleTheme'))}">${isDark() ? icons.sun : icons.moon}</button>
    </div>`;
  const input = $('#topbar input');
  const go = debounce(() => {
    const v = input.value.trim();
    if (v) location.replace(`#/search?q=${encodeURIComponent(v)}`);
    else if (parseHash().parts[0] === 'search') location.hash = '#/';
  }, 250);
  input.addEventListener('input', go);
  $('#topbar form').addEventListener('submit', (e) => {
    e.preventDefault();
    go.cancel();
    const v = input.value.trim();
    location.hash = v ? `#/search?q=${encodeURIComponent(v)}` : '#/';
  });
  $$('[data-ui]', $('#topbar')).forEach((b) =>
    b.addEventListener('click', () => {
      setUiLang(b.dataset.ui);
      renderTopbar();
      if (player.book) player.render();
      route();
    }),
  );
  $('[data-theme-toggle]').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('appTheme', next);
    renderTopbar();
  });
}

// ---------------------------------------------------------------- shared pieces

function cardHTML(b, progress) {
  const lang = scriptLang(b);
  const badges = [`<span class="badge">${esc(LANG_BADGE[b.lang] || '…')}</span>`];
  if (!b.hasText) badges.push(`<span class="badge gold">${icons.lock}${esc(t('catalogOnlyShort'))}</span>`);
  else if (b.upload) badges.push(`<span class="badge accent">${esc(t('yourBook'))}</span>`);
  if ((b.upload && b.audio?.length) || b.audioOffline) badges.push(`<span class="badge" title="${esc(t('narratedAudiobook'))}">${icons.headphones}</span>`);
  const bar = progress != null ? `<div class="progress-mini"><i style="width:${Math.round(progress * 100)}%"></i></div>` : '';
  return `<a class="card" href="#/book/${encodeURIComponent(b.id)}">
    ${coverHTML(b)}${bar}
    <div class="card-title" lang="${lang}">${esc(b.title)}</div>
    <div class="card-author" lang="${lang}">${esc(b.author || '')}</div>
    <div class="badges">${badges.join('')}</div>
  </a>`;
}

function shelfHTML(title, books, href, progressOf) {
  if (!books.length) return '';
  return `<section class="shelf">
    <div class="shelf-head"><h2>${esc(title)}</h2>${href ? `<a href="${href}">${esc(t('seeAll'))} (${books.length}) →</a>` : ''}</div>
    <div class="shelf-row">${books
      .slice(0, 20)
      .map((b) => cardHTML(b, progressOf ? progressOf(b) : null))
      .join('')}</div>
  </section>`;
}

function langChipsHTML(pool) {
  const opts = [['all', t('allLanguages')], ['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు']];
  return `<div class="chips" role="group" aria-label="${esc(t('bookLanguage'))}">${opts
    .map(([id, label]) => {
      const n = id === 'all' ? pool.length : pool.filter((b) => b.lang === id).length;
      return `<button type="button" class="chip" data-lang="${id}" ${id !== 'all' ? `lang="${id}"` : ''} aria-pressed="${state.bookLang === id}">${esc(label)} <span class="n">${n}</span></button>`;
    })
    .join('')}</div>`;
}

function bindLangChips(root, rerender) {
  $$('[data-lang]', root).forEach((b) =>
    b.addEventListener('click', () => {
      state.bookLang = b.dataset.lang;
      store.set('bookLang', state.bookLang);
      rerender();
    }),
  );
}

/** Readable books first; otherwise keeps catalogue order (most famous first). */
const recommended = (list) => [...list].sort((a, b) => Number(b.hasText) - Number(a.hasText));

function sortList(list, mode) {
  const coll = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  if (mode === 'title') return [...list].sort((a, b) => coll.compare(a.title, b.title));
  if (mode === 'author') return [...list].sort((a, b) => coll.compare(a.author || '', b.author || ''));
  if (mode === 'year') return [...list].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  return recommended(list);
}

function progressPct(p) {
  return p && p.n ? Math.min(1, Math.max(0.02, (p.ch + 1) / p.n)) : 0;
}

function footerHTML() {
  return `<footer class="footer"><p>${esc(t('footerSources'))}</p><p>${esc(t('footerCopyright'))}</p></footer>`;
}

function setTitle(s) {
  document.title = s ? `${s} · ${t('appName')}` : `${t('appName')} Library`;
}

// ---------------------------------------------------------------- views

function viewHome() {
  setTitle('');
  const all = state.books;
  const books = all.filter(inLang);
  const prog = store.get('progress', {});
  const continuing = Object.entries(prog)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => state.byId.get(id))
    .filter((b) => b && inLang(b))
    .slice(0, 12);
  const uploads = books.filter((b) => b.upload);
  view.innerHTML = `<div class="wrap">
    <section class="hero">
      <div>
        <h1>${t('heroTitle')}</h1>
        <p>${esc(t('heroSub'))}</p>
        <div class="stats">
          <div class="stat"><b>${all.length}</b><span>${esc(t('statBooks'))}</span></div>
          <div class="stat"><b>${all.filter((b) => b.hasText).length}</b><span>${esc(t('statReadable'))}</span></div>
          <div class="stat"><b>3</b><span>${esc(t('statLanguages'))}</span></div>
          <div class="stat"><b>${state.genres.length}</b><span>${esc(t('statGenres'))}</span></div>
        </div>
      </div>
      <div class="hero-actions"><a class="btn btn-lg" href="#/add">${icons.upload}<span>${esc(t('addBook'))}</span></a></div>
    </section>
    ${langChipsHTML(all)}
    <nav class="chips scroll" aria-label="${esc(t('genres'))}">${state.genres
      .map((g) => {
        const n = books.filter((b) => b.genres?.includes(g.id)).length;
        return n ? `<a class="chip" href="#/genre/${g.id}">${esc(genreLabel(g))} <span class="n">${n}</span></a>` : '';
      })
      .join('')}</nav>
    ${shelfHTML(t('continueReading'), continuing, null, (b) => progressPct(prog[b.id]))}
    ${shelfHTML(t('myBooks'), uploads, '#/uploads')}
    ${state.genres.map((g) => shelfHTML(genreLabel(g), recommended(books.filter((b) => b.genres?.includes(g.id))), `#/genre/${g.id}`)).join('')}
    ${footerHTML()}
  </div>`;
  bindLangChips(view, viewHome);
}

function gridPage({ title, sub, list, pool, sortable = true, query, rerender, emptyText }) {
  const sort = query?.get('sort') || 'default';
  const sorted = sortable ? sortList(list, sort) : list;
  view.innerHTML = `<div class="wrap">
    <div class="page-head"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
    <div class="toolbar">${langChipsHTML(pool)}${
      sortable
        ? `<label class="check"><span class="sr-only">${esc(t('sortBy'))}</span><select class="select" data-sort aria-label="${esc(t('sortBy'))}">${['default', 'title', 'author', 'year']
            .map((m) => `<option value="${m}" ${m === sort ? 'selected' : ''}>${esc(t(`sort${m[0].toUpperCase()}${m.slice(1)}`))}</option>`)
            .join('')}</select></label>`
        : ''
    }</div>
    ${sorted.length ? `<div class="grid">${sorted.map((b) => cardHTML(b)).join('')}</div>` : `<div class="empty"><p>${esc(emptyText || t('noBooksHere'))}</p></div>`}
  </div>`;
  bindLangChips(view, rerender);
  $('[data-sort]', view)?.addEventListener('change', (e) => {
    const { parts, query: q } = parseHash();
    q.set('sort', e.target.value);
    location.replace(`#/${parts.map(encodeURIComponent).join('/')}?${q}`);
  });
}

function viewGenre(gid, query) {
  const g = genreById(gid);
  if (!g) return viewNotFound();
  setTitle(genreLabel(g));
  const pool = state.books.filter((b) => b.genres?.includes(gid));
  const list = pool.filter(inLang);
  gridPage({ title: genreLabel(g), sub: t('nBooks', { n: list.length }), list, pool, query, rerender: () => viewGenre(gid, parseHash().query) });
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function searchBooks(q) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const b of state.books) {
    const title = norm(`${b.title} ${b.alt || ''}`);
    const author = norm(b.author);
    const genres = norm((b.genres || []).map((id) => {
      const g = genreById(id);
      return g ? `${g.en} ${g.hi} ${g.te}` : id;
    }).join(' '));
    const desc = norm(b.desc);
    let score = 0;
    let ok = true;
    for (const term of terms) {
      if (title.includes(term)) score += title.startsWith(term) ? 8 : 5;
      else if (author.includes(term)) score += 4;
      else if (genres.includes(term)) score += 2;
      else if (desc.includes(term)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ b, score: score + (b.hasText ? 0.5 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.b);
}

function viewSearch(query) {
  const q = query.get('q') || '';
  setTitle(q);
  const pool = searchBooks(q);
  const list = pool.filter(inLang);
  gridPage({
    title: t('searchResults', { q }),
    sub: list.length ? t('nBooks', { n: list.length }) : '',
    list,
    pool,
    sortable: false,
    rerender: () => viewSearch(parseHash().query),
    emptyText: `${t('noResults')} ${t('searchHint')}`,
  });
}

function viewUploads(query) {
  setTitle(t('uploadedBooksTitle'));
  const pool = state.books.filter((b) => b.upload);
  const list = pool.filter(inLang);
  if (!pool.length) {
    view.innerHTML = `<div class="wrap"><div class="empty"><h2>${esc(t('uploadedBooksTitle'))}</h2><p>${esc(t('noUploadsYet'))}</p><p><a class="btn" href="#/add">${icons.plus}<span>${esc(t('addBook'))}</span></a></p></div></div>`;
    return;
  }
  gridPage({ title: t('uploadedBooksTitle'), sub: t('uploadedBooksSub'), list, pool, query, rerender: () => viewUploads(parseHash().query) });
}

function viewNotFound() {
  setTitle(t('notFound'));
  view.innerHTML = `<div class="wrap"><div class="empty"><h2>${esc(t('notFound'))}</h2><p>${esc(t('notFoundHelp'))}</p><p><a class="btn" href="#/">${esc(t('goHome'))}</a></p></div></div>`;
}

// ---------------------------------------------------------------- book page

function viewBook(id) {
  const b = state.byId.get(id);
  if (!b) return viewNotFound();
  setTitle(b.title);
  const lang = scriptLang(b);
  const genres = (b.genres || []).map(genreById).filter(Boolean);
  const prog = store.get('progress', {})[b.id];
  const copies = (b.copies || []).map((cid) => state.byId.get(cid)).filter(Boolean);
  const siblings = b.group ? state.books.filter((x) => x.group === b.group && x.id !== b.id) : [];
  const linked = b.linkedTo ? state.byId.get(b.linkedTo) : null;
  const enc = encodeURIComponent(b.id);

  const actions = [];
  if (b.hasText) {
    actions.push(`<a class="btn btn-lg" href="#/read/${enc}">${icons.read}<span>${esc(prog ? t('continueReadingBtn') : t('startReading'))}</span></a>`);
    actions.push(`<a class="btn btn-lg btn-ghost" href="#/read/${enc}?tts=1">${icons.speaker}<span>${esc(t('readAloud'))}</span></a>`);
  } else {
    for (const c of copies) actions.push(`<a class="btn btn-lg" href="#/book/${encodeURIComponent(c.id)}">${icons.read}<span>${esc(t('openYourCopy'))}</span></a>`);
    actions.push(`<a class="btn btn-lg ${copies.length ? 'btn-ghost' : ''}" href="#/add?for=${enc}">${icons.upload}<span>${esc(t('addYourCopy'))}</span></a>`);
  }
  if (b.upload) {
    actions.push(`<a class="btn btn-ghost" href="#/edit/${enc}">${icons.edit}<span>${esc(t('edit'))}</span></a>`);
    if (b.original) actions.push(`<a class="btn btn-ghost" href="${esc(b.original.url)}?download" download>${icons.download}<span>${esc(t('downloadOriginal'))}</span></a>`);
    actions.push(`<button type="button" class="btn btn-danger" data-delete>${icons.trash}<span>${esc(t('delete'))}</span></button>`);
  }

  let source = '';
  if (b.sourceType === 'gutenberg') source = `<a href="${esc(b.sourceUrl)}" target="_blank" rel="noopener">${esc(t('sourceGutenberg'))} ${icons.external}</a>`;
  else if (b.sourceType === 'wikisource') source = `<a href="${esc(b.sourceUrl)}" target="_blank" rel="noopener">${esc(t('sourceWikisource'))} ${icons.external}</a>`;
  else if (b.sourceType === 'builtin') source = esc(t('sourceBuiltin'));
  else if (b.upload) source = esc(t('sourceUpload', { date: new Date(b.createdAt).toLocaleDateString(getUiLang()) }));

  const findUrl = `https://openlibrary.org/search?q=${encodeURIComponent(`${b.alt ? b.alt.split('·')[0] : b.title} ${b.alt?.split('·')[1] || b.author || ''}`.trim())}`;
  const more = recommended(
    state.books.filter((x) => x.id !== b.id && x.lang === b.lang && genres[0] && x.genres?.includes(genres[0].id)),
  );

  view.innerHTML = `<div class="wrap">
    <article class="book">
      <div class="book-cover">${coverHTML(b)}</div>
      <div>
        <div class="eyebrow">
          <span class="badge" lang="${lang}">${esc(langName(b.lang))}</span>
          ${genres.map((g) => `<a class="badge accent" href="#/genre/${g.id}">${esc(genreLabel(g))}</a>`).join('')}
          ${!b.hasText ? `<span class="badge gold">${icons.lock}${esc(t('catalogOnlyShort'))}</span>` : ''}
        </div>
        <h1 lang="${lang}">${esc(b.title)}</h1>
        ${b.alt ? `<div class="alt">${esc(b.alt)}</div>` : ''}
        <p class="byline" lang="${lang}">${esc(b.author || '')}${b.year ? ` · ${b.year < 0 ? `${-b.year} BCE` : b.year}` : ''}</p>
        ${b.desc ? `<p class="desc" lang="${lang}">${esc(b.desc)}</p>` : ''}
        ${linked ? `<div class="note">${icons.info}<div>${t('yourCopyOf', { title: `<a href="#/book/${encodeURIComponent(linked.id)}" lang="${scriptLang(linked)}">${esc(linked.title)}</a>` })}</div></div>` : ''}
        ${!b.hasText ? `<div class="note warn">${icons.lock}<div><b>${esc(t('catalogOnlyTitle'))}</b><br>${esc(t('catalogOnlyHelp'))} <a href="${esc(findUrl)}" target="_blank" rel="noopener">${esc(t('findOnline'))} ${icons.external}</a></div></div>` : ''}
        <div class="actions">${actions.join('')}</div>
        ${source ? `<div class="source">${source}</div>` : ''}
        ${b.hasText && (b.sourceType === 'gutenberg' || b.sourceType === 'wikisource')
          ? `<div class="source offline-state ${b.offline ? 'yes' : ''}">${b.offline ? icons.check : icons.download}<span>${esc(b.offline ? t('textSaved') : t('textNotSaved'))}</span></div>`
          : ''}
        ${siblings.length ? `<div class="translations">${esc(t('alsoIn'))} ${siblings.map((s) => `<a class="chip" href="#/book/${encodeURIComponent(s.id)}" lang="${scriptLang(s)}">${esc(langName(s.lang))}</a>`).join('')}</div>` : ''}
        ${b.hasText ? `<section class="panel" data-audio aria-live="polite"></section>` : ''}
      </div>
    </article>
    ${genres[0] ? shelfHTML(t('moreInGenre', { genre: genreLabel(genres[0]) }), more, `#/genre/${genres[0].id}`) : ''}
  </div>`;

  $('[data-delete]', view)?.addEventListener('click', async () => {
    if (!confirm(t('confirmDelete'))) return;
    try {
      await api.deleteUpload(b.id);
      if (player.isBook(b.id)) player.close();
      const all = store.get('progress', {});
      delete all[b.id];
      store.set('progress', all);
      await loadCatalog();
      toast(t('deleted'));
      location.hash = '#/';
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  const panel = $('[data-audio]', view);
  if (panel) return mountAudioPanel(panel, b);
  return null;
}

function mountAudioPanel(panel, b) {
  const enc = encodeURIComponent(b.id);
  let tracks = [];
  let destroyed = false;
  const head = (extra = '') => `<div class="panel-head"><h2>${icons.headphones}${esc(t('audiobook'))}</h2>${extra}</div>`;
  const readAloudBtn = `<a class="btn btn-sm btn-ghost" href="#/read/${enc}?tts=1">${icons.speaker}<span>${esc(t('useReadAloud'))}</span></a>`;

  function renderTracks(ab) {
    const saved = player.saved(b.id);
    const now = player.isBook(b.id) ? player.index : -1;
    const resume = saved && (saved.index > 0 || saved.time > 5);
    const total = ab.tracks.reduce((n, x) => n + (x.secs || 0), 0);
    const credit = ab.source === 'librivox' && ab.readers?.length ? `<div class="panel-body" style="padding-top:0">${esc(t('readBy', { names: ab.readers.slice(0, 3).join(', ') }))} · <a href="${esc(ab.url)}" target="_blank" rel="noopener">LibriVox ${icons.external}</a></div>` : '';
    panel.innerHTML = `${head(`<span class="muted" style="font-size:13px">${esc(t('nTracks', { n: ab.tracks.length }))}${total ? ` · ${fmtTime(total)}` : ''}</span>`)}
      <div class="panel-body" style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-sm" data-play="${resume ? saved.index : 0}" data-time="${resume ? saved.time : 0}">${icons.play}<span>${esc(resume ? t('resumeAt', { track: saved.index + 1, time: fmtTime(saved.time) }) : t('playFromStart'))}</span></button>
        ${resume ? `<button type="button" class="btn btn-sm btn-ghost" data-play="0" data-time="0">${esc(t('playFromStart'))}</button>` : ''}
      </div>
      ${credit}
      ${offlineRow(ab)}
      <ol class="tracks">${ab.tracks
        .map((tr, i) => `<li class="${i === now ? 'now' : ''}"><button type="button" data-play="${i}" data-time="0"><span class="n">${i + 1}</span><span>${esc(tr.title)}</span><span class="d">${tr.secs ? fmtTime(tr.secs) : ''}</span></button></li>`)
        .join('')}</ol>`;
    clearTimeout(pollTimer);
    const st = ab.offline?.status;
    if (st === 'queued' || st === 'downloading') pollTimer = setTimeout(refresh, 3000);
  }

  // Saving LibriVox recordings on this computer so they play without internet.
  function offlineRow(ab) {
    if (ab.source !== 'librivox') return '';
    if (ab.offline === 'ready') {
      return `<div class="panel-body offline-row yes">${icons.check}<span>${esc(t('audioSaved', { size: fmtSize(ab.bytes || 0) }))}</span>
        <button type="button" class="btn btn-sm btn-ghost" data-offline-remove>${icons.trash}<span>${esc(t('removeDownload'))}</span></button></div>`;
    }
    const job = ab.offline;
    if (job && (job.status === 'queued' || job.status === 'downloading')) {
      const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
      return `<div class="panel-body offline-row"><div class="spinner"></div><span>${esc(job.status === 'queued' ? t('audioQueued') : t('audioDownloading', { done: job.done, total: job.total }))}</span>
        <div class="bar" style="flex-basis:100%"><i style="width:${pct}%"></i></div></div>`;
    }
    const secs = ab.tracks.reduce((n, x) => n + (x.secs || 0), 0);
    const online = navigator.onLine !== false;
    const msg =
      job?.status === 'error'
        ? `<span style="color:var(--danger)">${esc(t('audioDownloadFailed', { error: job.error }))}</span>`
        : !online
          ? `<span>${esc(t('streamNeedsInternet'))}</span>`
          : '';
    return `<div class="panel-body offline-row">${msg}<button type="button" class="btn btn-sm btn-ghost" data-offline-save ${online ? '' : 'disabled'}>${icons.download}<span>${esc(t('saveAudioOffline', { size: secs ? fmtSize(secs * 8000) : '' }).replace(' ()', ''))}</span></button></div>`;
  }

  let pollTimer = null;
  function refresh() {
    api
      .audiobook(b.id)
      .then((ab) => {
        if (destroyed || !ab.found) return;
        tracks = ab.tracks;
        b.audioOffline = ab.offline === 'ready' || undefined;
        renderTracks(ab);
      })
      .catch(() => {
        if (!destroyed) pollTimer = setTimeout(refresh, 5000);
      });
  }

  panel.addEventListener('click', async (e) => {
    if (e.target.closest('[data-offline-save]')) {
      try {
        await api.saveAudiobook(b.id);
      } catch (err) {
        toast(err.message, 'error');
      }
      refresh();
      return;
    }
    if (e.target.closest('[data-offline-remove]')) {
      if (!confirm(t('confirmRemoveDownload'))) return;
      if (player.isBook(b.id)) player.close();
      try {
        await api.removeAudiobook(b.id);
      } catch (err) {
        toast(err.message, 'error');
      }
      refresh();
      return;
    }
    const btn = e.target.closest('[data-play]');
    if (!btn || !tracks.length) return;
    const i = Number(btn.dataset.play);
    const time = Number(btn.dataset.time) || 0;
    if (player.isBook(b.id) && player.index === i && !time) player.toggle();
    else player.load(b, tracks, i, { time });
  });

  panel.innerHTML = `${head()}<div class="panel-body" style="display:flex;gap:10px;align-items:center"><div class="spinner"></div>${esc(t('searchingAudio'))}</div>`;
  const offPlayer = player.on(() => {
    if (destroyed || !tracks.length) return;
    $$('.tracks li', panel).forEach((li, i) => li.classList.toggle('now', player.isBook(b.id) && player.index === i));
  });

  const noAudio = (msg, extra = '') => {
    panel.innerHTML = `${head()}<div class="panel-body"><p style="margin:0 0 12px">${esc(msg)}</p><div style="display:flex;gap:8px;flex-wrap:wrap">${readAloudBtn}${extra}</div></div>`;
  };

  if (b.upload && !b.audio?.length) {
    noAudio(t('noAudioUpload'), `<a class="btn btn-sm btn-ghost" href="#/edit/${enc}">${icons.music}<span>${esc(t('addAudio'))}</span></a>`);
  } else if (!b.upload && !b.narrated) {
    noAudio(t('noNarrationLang'));
  } else {
    api
      .audiobook(b.id)
      .then((ab) => {
        if (destroyed) return;
        if (!ab.found || !ab.tracks?.length) return noAudio(t('noAudiobookFound'));
        tracks = ab.tracks;
        renderTracks(ab);
      })
      .catch(() => !destroyed && noAudio(t('noAudiobookFound')));
  }
  return () => {
    destroyed = true;
    clearTimeout(pollTimer);
    offPlayer();
  };
}

// ---------------------------------------------------------------- router

async function route() {
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
    cleanup = null;
  }
  const { parts, query } = parseHash();
  const [p0, p1] = parts;
  // Links from the front page may carry ?lang=<book language> and ?ui=<interface language>.
  const ql = query.get('lang');
  if (ql && ['all', 'en', 'hi', 'te'].includes(ql)) {
    state.bookLang = ql;
    store.set('bookLang', ql);
  }
  const qu = query.get('ui');
  if (qu && UI_LANGS.some((l) => l.id === qu) && qu !== getUiLang()) {
    setUiLang(qu);
    renderTopbar();
  }
  if (!state.loaded) {
    view.innerHTML = `<div class="wrap"><div class="empty"><div class="spinner" style="margin:0 auto 12px"></div>${esc(t('loadingLibrary'))}</div></div>`;
    try {
      await loadCatalog();
    } catch {
      view.innerHTML = `<div class="wrap"><div class="empty"><h2>${esc(t('offlineTitle'))}</h2><p>${esc(t('offlineHelp'))}</p><p><button type="button" class="btn" data-reload>${esc(t('retry'))}</button></p></div></div>`;
      $('[data-reload]', view).addEventListener('click', route);
      return;
    }
  }
  const prevPage = route.last;
  route.last = `${p0 || ''}/${p1 || ''}`;
  if (p0 !== 'search' && prevPage !== route.last) window.scrollTo(0, 0);
  const searchInput = $('#topbar input');
  if (searchInput && p0 !== 'search' && document.activeElement !== searchInput) searchInput.value = '';

  switch (p0) {
    case undefined:
      viewHome();
      break;
    case 'genre':
      viewGenre(p1, query);
      break;
    case 'search':
      viewSearch(query);
      break;
    case 'uploads':
      viewUploads(query);
      break;
    case 'book':
      cleanup = viewBook(p1);
      break;
    case 'read': {
      const b = state.byId.get(p1);
      if (!b) viewNotFound();
      else {
        setTitle(b.title);
        cleanup = mountReader(view, b, query);
      }
      break;
    }
    case 'add': {
      setTitle(t('addBookTitle'));
      const forId = query.get('for');
      const forBook = forId ? state.byId.get(forId) : null;
      cleanup = mountUpload(view, { genres: state.genres, forBook: forBook && !forBook.upload ? forBook : null, onSaved: afterSave });
      break;
    }
    case 'edit': {
      const b = state.byId.get(p1);
      if (!b || !b.upload) viewNotFound();
      else {
        setTitle(t('editBookTitle'));
        cleanup = mountUpload(view, { genres: state.genres, edit: { ...b }, onSaved: afterSave });
      }
      break;
    }
    default:
      viewNotFound();
  }
}

async function afterSave(book) {
  await loadCatalog().catch(() => {});
  location.hash = `#/book/${encodeURIComponent(book.id)}`;
}

player.init();
renderTopbar();
$('[data-skip]')?.addEventListener('click', (e) => {
  e.preventDefault();
  view.focus();
});
window.addEventListener('hashchange', route);
route();
