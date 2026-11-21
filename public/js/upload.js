import { t, langName, genreLabel, getUiLang } from './i18n.js';
import { api, isStatic } from './api.js';
import { $, esc, toast, fmtSize } from './util.js';
import { icons } from './icons.js';
import { coverHTML } from './covers.js';
import { extractFile, ACCEPT } from './extract.js';

const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.m4b,.aac,.ogg,.oga,.opus,.wav,.flac,.webm';
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Add / edit a book. `edit` is an existing uploaded book; `forBook` is a catalogue entry the user
 * is adding their own copy of.
 */
export function mountUpload(el, { genres, edit = null, forBook = null, onSaved }) {
  const seed = edit || forBook || {};
  const f = {
    content: null, // { text } or { chapters }
    file: null,
    cover: null,
    coverPreview: edit?.cover || null,
    audio: [],
    genres: new Set(seed.genres || []),
    lang: seed.lang || getUiLang(),
    busy: false,
  };
  let coverObjectUrl = null;

  el.innerHTML = `
  <div class="wrap">
    <div class="page-head">
      <h1>${esc(edit ? t('editBookTitle') : t('addBookTitle'))}</h1>
      <p>${esc(edit ? t('editBookSub') : t('addBookSub'))}</p>
    </div>
    ${forBook ? `<div class="note">${icons.info}<div>${t('addingCopyOf', { title: `<b lang="${esc(forBook.lang)}">${esc(forBook.title)}</b>` })}</div></div>` : ''}
    ${isStatic() ? `<div class="note">${icons.lock}<div>${esc(t('uploadsLocalNote'))}</div></div>` : ''}
    <form class="form-grid" novalidate>
      <section class="box a-file">
        <h2><span class="step">1</span>${esc(t('stepFile'))}</h2>
        <p class="hint">${esc(edit ? t('fileHintEdit') : t('fileHint'))}</p>
        <label class="dropzone" data-drop>
          <input type="file" accept="${ACCEPT}" data-file>
          ${icons.upload}<b>${esc(t('dropHere'))}</b><small>TXT · EPUB · PDF · HTML · MD</small>
        </label>
        <div data-file-info></div>
        <details style="margin-top:14px">
          <summary style="cursor:pointer;color:var(--ink-2);font-size:14px">${esc(t('orPaste'))}</summary>
          <textarea class="textarea" data-paste rows="8" style="margin-top:10px" placeholder="${esc(t('pastePlaceholder'))}"></textarea>
        </details>
      </section>

      <section class="box a-details">
        <h2><span class="step">2</span>${esc(t('stepDetails'))}</h2>
        <p class="hint">${esc(t('detailsHint'))}</p>
        <div class="field"><label for="f-title">${esc(t('fTitle'))} <span class="req">*</span></label><input class="input" id="f-title" data-k="title" required maxlength="300" value="${esc(seed.title || '')}"></div>
        <div class="field"><label for="f-author">${esc(t('fAuthor'))}</label><input class="input" id="f-author" data-k="author" maxlength="200" value="${esc(seed.author || '')}"></div>
        <div class="row2">
          <div class="field"><label for="f-lang">${esc(t('fLanguage'))}</label>
            <select class="input" id="f-lang" data-k="lang">
              ${['en', 'hi', 'te', 'other'].map((l) => `<option value="${l}" ${l === f.lang ? 'selected' : ''}>${esc(langName(l))}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label for="f-year">${esc(t('fYear'))}</label><input class="input" id="f-year" data-k="year" inputmode="numeric" maxlength="5" value="${esc(seed.year ?? '')}"></div>
        </div>
        <div class="field"><span class="label">${esc(t('fGenres'))}</span>
          <div class="genre-pick" data-genres>${genres
            .map((g) => `<button type="button" class="chip" data-g="${g.id}" aria-pressed="${f.genres.has(g.id)}">${esc(genreLabel(g))}</button>`)
            .join('')}</div>
        </div>
        <div class="field"><label for="f-desc">${esc(t('fDescription'))}</label><textarea class="textarea" id="f-desc" data-k="desc" rows="5" maxlength="5000">${esc(seed.desc || '')}</textarea></div>
      </section>

      <section class="box a-media">
        <h2><span class="step">3</span>${esc(t('stepMedia'))}</h2>
        <p class="hint">${esc(t('mediaHint'))}</p>
        <div class="field"><span class="label">${esc(t('coverImage'))}</span>
          <div class="cover-pick">
            <div data-cover-prev style="width:76px"></div>
            <div>
              <label class="btn btn-ghost btn-sm">${icons.image}<span>${esc(t('chooseImage'))}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-cover></label>
              <p class="hint" style="margin:6px 0 0">${esc(t('coverHint'))}</p>
            </div>
          </div>
        </div>
        <div class="field" style="margin-bottom:0"><span class="label">${esc(t('audioFiles'))}</span>
          <label class="btn btn-ghost btn-sm" style="align-self:flex-start">${icons.music}<span>${esc(t('chooseAudio'))}</span><input type="file" accept="${AUDIO_ACCEPT}" multiple hidden data-audio></label>
          <ul class="file-list" data-audio-list></ul>
          <p class="hint" style="margin:6px 0 0">${esc(t('audioHint'))}</p>
        </div>
        <label class="check" style="margin-top:14px"><input type="checkbox" data-keep checked> ${esc(t('keepOriginal'))}</label>
      </section>

      <div class="form-actions">
        <div class="grow"><div data-msg></div><div class="bar" data-bar hidden><i></i></div></div>
        <a class="btn btn-ghost" href="${edit ? `#/book/${encodeURIComponent(edit.id)}` : forBook ? `#/book/${encodeURIComponent(forBook.id)}` : '#/'}">${esc(t('cancel'))}</a>
        <button type="submit" class="btn" data-submit>${icons.check}<span>${esc(edit ? t('saveChanges') : t('addToLibrary'))}</span></button>
      </div>
    </form>
  </div>`;

  const form = $('form', el);
  const info = $('[data-file-info]', el);
  const msg = $('[data-msg]', el);
  const barWrap = $('[data-bar]', el);
  const barFill = $('[data-bar] i', el);
  const submit = $('[data-submit]', el);
  const field = (k) => $(`[data-k="${k}"]`, el);

  // ------------------------------------------------------------ cover
  function renderCover() {
    const preview = {
      id: 'preview',
      title: field('title').value || t('untitled'),
      author: field('author').value,
      lang: field('lang').value,
      genres: [...f.genres],
      cover: f.coverPreview,
    };
    $('[data-cover-prev]', el).innerHTML = coverHTML(preview);
  }
  function setCover(file) {
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    f.cover = file;
    coverObjectUrl = URL.createObjectURL(file);
    f.coverPreview = coverObjectUrl;
    renderCover();
  }
  $('[data-cover]', el).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) setCover(file);
  });
  ['title', 'author', 'lang'].forEach((k) => field(k).addEventListener('input', () => !f.cover && !edit?.cover && renderCover()));
  renderCover();

  // ------------------------------------------------------------ genres
  $('[data-genres]', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const g = b.dataset.g;
    if (f.genres.has(g)) f.genres.delete(g);
    else if (f.genres.size < 6) f.genres.add(g);
    b.setAttribute('aria-pressed', String(f.genres.has(g)));
    if (!f.cover && !edit?.cover) renderCover();
  });

  // ------------------------------------------------------------ book file
  const drop = $('[data-drop]', el);
  $('[data-file]', el).addEventListener('change', (e) => e.target.files[0] && handleFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('drag')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  async function handleFile(file) {
    f.content = null;
    f.file = null;
    info.innerHTML = `<div class="file-chosen">${icons.file}<div class="grow"><b>${esc(file.name)}</b><span>${esc(fmtSize(file.size))} · ${esc(t('extracting'))}</span><div class="bar"><i data-xbar></i></div></div><div class="spinner"></div></div>`;
    const xbar = $('[data-xbar]', info);
    try {
      const r = await extractFile(file, (p) => {
        xbar.style.width = `${Math.round(p * 100)}%`;
      });
      if (!r.stats.words) throw new Error(r.warnings.includes('pdf-no-text') ? 'pdf-no-text' : 'no-text');
      f.content = r.chapters ? { chapters: r.chapters } : { text: r.text };
      f.file = file;
      if (!field('title').value.trim() && (r.meta.title || file.name)) field('title').value = r.meta.title || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      if (!field('author').value.trim() && r.meta.author) field('author').value = r.meta.author;
      if (r.meta.lang && ['en', 'hi', 'te'].includes(r.meta.lang)) field('lang').value = r.meta.lang;
      if (r.cover && !f.cover) setCover(r.cover);
      else renderCover();
      const bits = [t('nWords', { n: r.stats.words.toLocaleString() })];
      if (r.stats.chapters) bits.push(t('nChapters', { n: r.stats.chapters }));
      bits.push(langName(r.meta.lang));
      const isPdf = /\.pdf$/i.test(file.name);
      info.innerHTML = `
        <div class="file-chosen">${icons.check}<div class="grow"><b>${esc(file.name)}</b><span>${esc(bits.join(' · '))}</span></div>
          <button type="button" class="icon-btn" data-clear title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">${icons.close}</button></div>
        <div class="preview" lang="${esc(r.meta.lang)}">${esc(r.stats.sample)}…</div>
        ${isPdf ? `<p class="hint" style="margin:8px 0 0">${esc(t('pdfCheckPreview'))}</p>` : ''}`;
      $('[data-clear]', info).addEventListener('click', () => {
        f.content = null;
        f.file = null;
        info.innerHTML = '';
        $('[data-file]', el).value = '';
      });
    } catch (e) {
      const key = { 'pdf-no-text': 'pdfNoText', 'epub-invalid': 'epubInvalid', 'no-text': 'noTextInFile' }[e.message];
      info.innerHTML = `<div class="note warn">${icons.alert}<div><b>${esc(t('extractFailed'))}</b><br>${esc(key ? t(key) : e.message)}</div></div>`;
      $('[data-file]', el).value = '';
    }
  }

  // ------------------------------------------------------------ audio
  const audioList = $('[data-audio-list]', el);
  function renderAudio() {
    const existing = (edit?.audio || [])
      .map(
        (a) =>
          `<li>${icons.music}<span class="grow">${esc(a.name)}</span><span class="muted">${esc(fmtSize(a.size))}</span><button type="button" class="icon-btn" data-del-audio="${esc(a.file)}" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">${icons.trash}</button></li>`,
      )
      .join('');
    const fresh = f.audio
      .map(
        (a, i) =>
          `<li>${icons.plus}<span class="grow">${esc(a.name)}</span><span class="muted">${esc(fmtSize(a.size))}</span><button type="button" class="icon-btn" data-rm-audio="${i}" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">${icons.close}</button></li>`,
      )
      .join('');
    audioList.innerHTML = existing + fresh;
  }
  $('[data-audio]', el).addEventListener('change', (e) => {
    f.audio.push(...[...e.target.files].sort(byName));
    e.target.value = '';
    renderAudio();
  });
  audioList.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm-audio]');
    if (rm) {
      f.audio.splice(Number(rm.dataset.rmAudio), 1);
      renderAudio();
      return;
    }
    const del = e.target.closest('[data-del-audio]');
    if (del && edit && confirm(t('confirmRemoveAudio'))) {
      try {
        const updated = await api.deleteFile(edit.id, del.dataset.delAudio);
        edit.audio = updated.audio;
        renderAudio();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
  renderAudio();

  // ------------------------------------------------------------ save
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (f.busy) return;
    const title = field('title').value.trim();
    if (!title) {
      msg.textContent = t('needTitle');
      field('title').focus();
      return;
    }
    const pasted = $('[data-paste]', el).value.trim();
    let content = f.content;
    if (!content && pasted) content = { text: pasted };
    if (!edit && !content) {
      msg.textContent = t('needText');
      drop.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const meta = {
      title,
      author: field('author').value.trim(),
      lang: field('lang').value,
      year: field('year').value.trim(),
      desc: field('desc').value.trim(),
      genres: [...f.genres],
      linkedTo: forBook?.id || edit?.linkedTo || null,
    };
    f.busy = true;
    submit.disabled = true;
    msg.textContent = t('saving');
    const wasEdit = Boolean(edit);
    try {
      let book = edit ? await api.updateUpload(edit.id, { meta, ...(content || {}) }) : await api.createUpload({ meta, ...content });
      // From here on the book exists: a retry after a failed file upload must update, not duplicate.
      edit = book;
      f.content = null;
      $('[data-paste]', el).value = '';
      if (!$('[data-keep]', el).checked) f.file = null;
      const total = (f.cover ? 1 : 0) + (f.file ? 1 : 0) + f.audio.length;
      let n = 0;
      const send = async (kind, file) => {
        n++;
        msg.textContent = t('uploadingFile', { name: file.name, n, total });
        barWrap.hidden = false;
        barFill.style.width = '0%';
        book = await api.putFile(book.id, kind, file, file.name, (p) => {
          barFill.style.width = `${Math.round(p * 100)}%`;
        });
        edit = book;
      };
      if (f.cover) {
        await send('cover', f.cover);
        f.cover = null;
      }
      if (f.file) {
        await send('original', f.file);
        f.file = null;
      }
      while (f.audio.length) {
        await send('audio', f.audio[0]);
        f.audio.shift();
        renderAudio();
      }
      toast(wasEdit ? t('changesSaved') : t('bookAdded'));
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      onSaved(book);
    } catch (err) {
      f.busy = false;
      submit.disabled = false;
      barWrap.hidden = true;
      renderAudio();
      msg.innerHTML = `<span style="color:var(--danger)">${esc(t('saveFailed'))}: ${esc(err.message === 'network' ? t('serverOffline') : err.message)}</span>`;
    }
  });

  return () => {
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  };
}
