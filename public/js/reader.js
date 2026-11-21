import { t, langName } from './i18n.js';
import { api } from './api.js';
import { $, $$, esc, store, debounce, toast, detectLang } from './util.js';
import { icons } from './icons.js';
import { Narrator, ttsSupported, voicesFor, onVoicesReady, textOf, isOnline } from './tts.js';
import { player } from './player.js';

const TTS_RATES = [0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const THEMES = { paper: '#fbf8f1', sepia: '#f3e7cf', night: '#121110' };

export function saveProgress(id, data) {
  const all = store.get('progress', {});
  all[id] = { ...all[id], ...data, at: Date.now() };
  store.set('progress', all);
}

export function mountReader(el, book, query) {
  document.body.classList.add('reading');
  const S = { size: 20, theme: null, font: 'serif', width: 68, ...store.get('readerSettings', {}) };
  const rootTheme = document.documentElement.dataset.theme;
  const dark = rootTheme === 'dark' || (!rootTheme && matchMedia('(prefers-color-scheme: dark)').matches);
  const saved = store.get('progress', {})[book.id];
  let lang = ['en', 'hi', 'te'].includes(book.lang) ? book.lang : null;
  let chapters = [];
  let status = 'loading';
  let ch = -1;
  let destroyed = false;
  let timer = null;
  let ttsOpen = false;
  let waitingForNext = false;
  let lastError = null;
  const target = { ch: saved?.ch ?? 0, p: saved?.p ?? 0 };
  const wantTts = query.get('tts') === '1';

  el.innerHTML = `
  <div class="reader" data-rt="${S.theme || (dark ? 'night' : 'paper')}" data-font="${S.font}" style="--rs:${S.size}px;--rw:${S.width}ch">
    <div class="reader-bar">
      <a class="icon-btn" href="#/book/${encodeURIComponent(book.id)}" title="${esc(t('back'))}" aria-label="${esc(t('back'))}">${icons.arrowLeft}</a>
      <div class="rb-title"><b lang="${esc(book.lang)}">${esc(book.title)}</b><span data-chname></span></div>
      <select class="select" data-toc aria-label="${esc(t('contents'))}" hidden></select>
      <button class="icon-btn" data-act="tts" title="${esc(t('readAloud'))}" aria-label="${esc(t('readAloud'))}">${icons.speaker}</button>
      <button class="icon-btn" data-act="settings" title="${esc(t('readingSettings'))}" aria-label="${esc(t('readingSettings'))}" aria-expanded="false">${icons.type}</button>
      <div class="settings-pop" data-settings hidden>
        <div class="row"><span>${esc(t('textSize'))}</span><div class="seg"><button data-size="-2" aria-label="${esc(t('smaller'))}">A−</button><button data-size="2" aria-label="${esc(t('larger'))}">A+</button></div></div>
        <div class="row"><span>${esc(t('theme'))}</span><div style="display:flex;gap:10px">${Object.entries(THEMES)
          .map(([k, c]) => `<button class="swatch" data-theme="${k}" style="background:${c}" title="${esc(t(`theme_${k}`))}" aria-label="${esc(t(`theme_${k}`))}"></button>`)
          .join('')}</div></div>
        <div class="row"><span>${esc(t('font'))}</span><div class="seg"><button data-font="serif">${esc(t('fontSerif'))}</button><button data-font="sans">${esc(t('fontSans'))}</button></div></div>
        <div class="row"><span>${esc(t('lineWidth'))}</span><div class="seg"><button data-width="56">S</button><button data-width="68">M</button><button data-width="86">L</button></div></div>
      </div>
    </div>
    <div class="reader-status" data-status></div>
    <article class="reader-page" data-page lang="${lang || 'en'}"></article>
    <div class="tts-bar" data-ttsbar hidden>
      <div class="tts-row">
        <button class="icon-btn" data-tts="prev" title="${esc(t('prevPara'))}" aria-label="${esc(t('prevPara'))}">${icons.prev}</button>
        <button class="icon-btn tts-play" data-tts="toggle" title="${esc(t('playPause'))}" aria-label="${esc(t('playPause'))}">${icons.play}</button>
        <button class="icon-btn" data-tts="next" title="${esc(t('nextPara'))}" aria-label="${esc(t('nextPara'))}">${icons.next}</button>
        <div class="tts-status"><b data-tts-state></b><span data-tts-pos></span></div>
        <select class="select" data-tts-rate aria-label="${esc(t('speed'))}">${TTS_RATES.map((r) => `<option value="${r}">${r}×</option>`).join('')}</select>
        <select class="select" data-tts-voice aria-label="${esc(t('voice'))}"></select>
        <button class="icon-btn" data-tts="close" title="${esc(t('close'))}" aria-label="${esc(t('close'))}">${icons.close}</button>
      </div>
      <div class="tts-warn" data-tts-warn hidden></div>
    </div>
  </div>`;

  const R = $('.reader', el);
  const page = $('[data-page]', el);
  const toc = $('[data-toc]', el);
  const statusEl = $('[data-status]', el);
  const pop = $('[data-settings]', el);
  const bar = $('[data-ttsbar]', el);
  const ttsBtn = $('[data-act="tts"]', el);

  // ------------------------------------------------------------ settings
  const markSettings = () => {
    $$('[data-theme]', pop).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === R.dataset.rt)));
    $$('[data-font]', pop).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.font === S.font)));
    $$('[data-width]', pop).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.width) === S.width)));
  };
  const saveSettings = () => store.set('readerSettings', S);
  markSettings();
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.size) {
      S.size = Math.max(14, Math.min(34, S.size + Number(b.dataset.size)));
      R.style.setProperty('--rs', `${S.size}px`);
    } else if (b.dataset.theme) {
      S.theme = b.dataset.theme;
      R.dataset.rt = S.theme;
    } else if (b.dataset.font) {
      S.font = b.dataset.font;
      R.dataset.font = S.font;
    } else if (b.dataset.width) {
      S.width = Number(b.dataset.width);
      R.style.setProperty('--rw', `${S.width}ch`);
    }
    saveSettings();
    markSettings();
  });
  const settingsBtn = $('[data-act="settings"]', el);
  settingsBtn.addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    settingsBtn.setAttribute('aria-expanded', String(!pop.hidden));
  });
  const closePop = (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !settingsBtn.contains(e.target)) {
      pop.hidden = true;
      settingsBtn.setAttribute('aria-expanded', 'false');
    }
  };
  document.addEventListener('click', closePop);

  // ------------------------------------------------------------ chapters
  const allUntitled = () => chapters.every((c) => !c.title);
  function chapterLabel(i) {
    const c = chapters[i];
    if (!c) return '';
    if (c.title) return c.title;
    if (chapters.length === 1) return book.title;
    if (allUntitled()) return `${t('section')} ${i + 1}`;
    return i === 0 ? t('opening') : `${t('section')} ${i + 1}`;
  }

  function renderToc() {
    if (chapters.length < 2) {
      toc.hidden = true;
      return;
    }
    toc.hidden = false;
    toc.innerHTML = chapters.map((c, i) => `<option value="${i}">${esc(chapterLabel(i).slice(0, 90))}</option>`).join('') + (status === 'loading' ? `<option disabled>${esc(t('moreLoading'))}</option>` : '');
    toc.value = String(ch);
  }

  function paraHTML(p, j) {
    return typeof p === 'string' ? `<p data-i="${j}">${esc(p)}</p>` : `<h3 data-i="${j}">${esc(p.h)}</h3>`;
  }

  function renderChapter(i, para = 0, { scroll = true } = {}) {
    if (!chapters[i]) return;
    ch = i;
    const c = chapters[i];
    if (!lang) {
      lang = detectLang(c.paras.slice(0, 40).map(textOf).join(' '));
      if (!['en', 'hi', 'te'].includes(lang)) lang = 'en';
      page.lang = lang;
    }
    const prev = i > 0 ? `<button class="btn btn-ghost" data-nav="${i - 1}">${icons.chevLeft}<span>${esc(t('prevChapter'))}</span></button>` : '<span></span>';
    const next =
      i + 1 < chapters.length
        ? `<button class="btn btn-ghost" data-nav="${i + 1}"><span>${esc(t('nextChapter'))}</span>${icons.chevRight}</button>`
        : status === 'loading'
          ? `<span class="muted">${esc(t('moreLoading'))}</span>`
          : `<span class="muted">${esc(t('theEnd'))}</span>`;
    page.innerHTML = `<h2 class="ch-title">${esc(chapterLabel(i))}</h2>${c.paras.map(paraHTML).join('')}<nav class="ch-nav">${prev}${next}</nav>`;
    $('[data-chname]', el).textContent = chapters.length > 1 ? chapterLabel(i) : '';
    renderToc();
    if (scroll) {
      const node = para > 0 && page.querySelector(`[data-i="${para}"]`);
      if (node) {
        node.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -80);
      } else {
        window.scrollTo(0, 0);
      }
    }
    saveProgress(book.id, { ch: i, p: para, n: chapters.length });
  }

  toc.addEventListener('change', () => {
    goTo(Number(toc.value), 0);
  });
  page.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      goTo(Number(nav.dataset.nav), 0);
      return;
    }
    if (!ttsOpen) return;
    const p = e.target.closest('[data-i]');
    if (p) {
      player.pause();
      narrator.load(chapters[ch].paras);
      narrator.play(Number(p.dataset.i));
    }
  });

  function goTo(i, para) {
    const speaking = narrator.state === 'playing' || narrator.state === 'waiting';
    renderChapter(i, para);
    if (ttsOpen) {
      narrator.load(chapters[ch].paras);
      if (speaking) narrator.play(para);
      else updateTts();
    }
  }

  // reading position
  const onScroll = debounce(() => {
    if (ch < 0 || narrator.state === 'playing') return;
    const top = 70;
    const nodes = page.querySelectorAll('[data-i]');
    let idx = 0;
    for (const n of nodes) {
      if (n.getBoundingClientRect().bottom > top) {
        idx = Number(n.dataset.i);
        break;
      }
    }
    saveProgress(book.id, { ch, p: idx, n: chapters.length });
  }, 400);
  window.addEventListener('scroll', onScroll, { passive: true });

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight' && ch + 1 < chapters.length) goTo(ch + 1, 0);
    else if (e.key === 'ArrowLeft' && ch > 0) goTo(ch - 1, 0);
  };
  document.addEventListener('keydown', onKey);

  // ------------------------------------------------------------ loading
  function showStatus() {
    if (status === 'error') {
      statusEl.innerHTML = `${icons.alert}<span>${esc(t('loadError'))} <span class="muted">(${esc(lastError || '')})</span></span> <button class="btn btn-sm btn-ghost" data-retry>${esc(t('retry'))}</button>`;
      $('[data-retry]', statusEl).addEventListener('click', () => {
        status = 'loading';
        poll(true);
      });
      return;
    }
    if (status !== 'loading') {
      statusEl.innerHTML = '';
      return;
    }
    let msg = t('loadingBook');
    if (book.sourceType === 'gutenberg') msg = t('fetchingGutenberg');
    if (book.sourceType === 'wikisource') msg = chapters.length ? t('fetchingWikisourceN', { n: chapters.length }) : t('fetchingWikisource');
    statusEl.innerHTML = `<div class="spinner"></div><span>${esc(msg)}</span>`;
  }

  async function poll(retry = false) {
    clearTimeout(timer);
    showStatus();
    try {
      const r = await api.content(book.id, chapters.length, retry);
      if (destroyed) return;
      const before = chapters.length;
      if (r.from === before && r.chapters.length) chapters.push(...r.chapters);
      status = r.status;
      lastError = r.error;
      if (status === 'ready') book.offline = true; // the server keeps a copy from now on
      if (ch < 0 && chapters.length && (status !== 'loading' || chapters.length > target.ch)) {
        renderChapter(Math.min(target.ch, chapters.length - 1), target.p);
        if (wantTts) openTts(true);
      } else if (chapters.length !== before || status !== 'loading') {
        renderToc();
        if (ch >= 0 && ch === chapters.length - 2 && before !== chapters.length) {
          // refresh "next chapter" button of the current chapter
          const nav = page.querySelector('.ch-nav');
          if (nav && !nav.querySelector(`[data-nav="${ch + 1}"]`)) {
            nav.lastElementChild.outerHTML = `<button class="btn btn-ghost" data-nav="${ch + 1}"><span>${esc(t('nextChapter'))}</span>${icons.chevRight}</button>`;
          }
        }
      }
      if (waitingForNext && ch + 1 < chapters.length) {
        waitingForNext = false;
        renderChapter(ch + 1, 0);
        narrator.load(chapters[ch].paras);
        narrator.play(0);
      }
      showStatus();
      if (status === 'loading') timer = setTimeout(() => poll(), chapters.length ? 2500 : 1500);
      if (status === 'ready' && !chapters.length) page.innerHTML = `<p class="muted">${esc(t('noText'))}</p>`;
    } catch (e) {
      if (destroyed) return;
      if (e.status === 409 || e.status === 404) {
        statusEl.innerHTML = '';
        page.innerHTML = `<div class="empty"><h2>${esc(t('notAvailable'))}</h2><p>${esc(t('catalogOnlyHelp'))}</p><p><a class="btn" href="#/book/${encodeURIComponent(book.id)}">${esc(t('back'))}</a></p></div>`;
        return;
      }
      status = 'error';
      lastError = e.message === 'network' ? t('serverOffline') : e.message;
      showStatus();
    }
  }

  // ------------------------------------------------------------ read aloud
  const narrator = new Narrator({
    onPara: (i) => {
      highlight(i);
      saveProgress(book.id, { ch, p: i, n: chapters.length });
    },
    onEnd: () => {
      if (ch + 1 < chapters.length) {
        renderChapter(ch + 1, 0);
        narrator.load(chapters[ch].paras);
        narrator.play(0);
      } else if (status === 'loading') {
        waitingForNext = true;
        narrator.wait();
      } else {
        toast(t('finishedBook'));
      }
    },
    onState: () => updateTts(),
    onVoiceFallback: (v) => {
      voiceSel.value = v.voiceURI;
      toast(t('voiceSwitched', { voice: v.name.replace(/^Microsoft |^Google /, '') }));
    },
    onError: () => {
      warn.hidden = false;
      warn.innerHTML = `<b>${esc(t('noOfflineVoiceTitle', { lang: langName(lang) }))}</b> ${esc(t('noOfflineVoiceHelp'))}`;
    },
  });

  function highlight(i) {
    page.querySelector('.speaking')?.classList.remove('speaking');
    const n = page.querySelector(`[data-i="${i}"]`);
    if (!n) return;
    n.classList.add('speaking');
    const r = n.getBoundingClientRect();
    const barTop = bar.hidden ? innerHeight : bar.getBoundingClientRect().top;
    if (r.top < 70 || r.bottom > barTop - 10) n.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  const rateSel = $('[data-tts-rate]', el);
  const voiceSel = $('[data-tts-voice]', el);
  const warn = $('[data-tts-warn]', el);
  rateSel.value = String(narrator.rate);
  if (!rateSel.value) rateSel.value = '1';

  function fillVoices() {
    if (!lang) return;
    narrator.setLang(lang);
    const list = voicesFor(lang);
    voiceSel.innerHTML = list.length
      ? list.map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name.replace(/^Microsoft |^Google /, ''))}</option>`).join('')
      : `<option value="">${esc(t('systemVoice'))}</option>`;
    if (narrator.voice) voiceSel.value = narrator.voice.voiceURI;
    if (!ttsSupported) {
      warn.hidden = false;
      warn.innerHTML = esc(t('ttsUnsupported'));
    } else if (!list.length) {
      warn.hidden = false;
      warn.innerHTML = `<b>${esc(t('noVoiceTitle', { lang: langName(lang) }))}</b> ${esc(t('noVoiceHelp'))}`;
    } else if (!isOnline() && !list.some((v) => v.localService)) {
      warn.hidden = false;
      warn.innerHTML = `<b>${esc(t('noOfflineVoiceTitle', { lang: langName(lang) }))}</b> ${esc(t('noOfflineVoiceHelp'))}`;
    } else {
      warn.hidden = true;
    }
  }
  const offVoices = onVoicesReady(() => {
    if (ttsOpen) fillVoices();
  });
  const onNetChange = () => {
    if (ttsOpen) fillVoices();
  };
  window.addEventListener('online', onNetChange);
  window.addEventListener('offline', onNetChange);
  rateSel.addEventListener('change', () => narrator.setRate(Number(rateSel.value)));
  voiceSel.addEventListener('change', () => voiceSel.value && narrator.setVoice(voiceSel.value));

  function updateTts() {
    const st = narrator.state;
    ttsBtn.classList.toggle('on', ttsOpen);
    R.classList.toggle('tts-on', ttsOpen);
    $('[data-tts="toggle"]', el).innerHTML = st === 'playing' ? icons.pause : icons.play;
    const label = { playing: t('ttsPlaying'), paused: t('ttsPaused'), waiting: t('ttsWaiting'), idle: t('ttsIdle') }[st];
    $('[data-tts-state]', el).textContent = label;
    const n = chapters[ch]?.paras.length || 0;
    $('[data-tts-pos]', el).textContent = st === 'idle' ? t('tapToRead') : `${chapterLabel(ch).slice(0, 40)} · ¶ ${Math.min(narrator.i + 1, n)}/${n}`;
    if (st !== 'playing') page.querySelector('.speaking')?.classList.toggle('speaking', st === 'paused');
  }

  function firstVisiblePara() {
    for (const n of page.querySelectorAll('[data-i]')) if (n.getBoundingClientRect().bottom > 80) return Number(n.dataset.i);
    return 0;
  }

  function openTts(autostart) {
    if (ch < 0) return;
    ttsOpen = true;
    bar.hidden = false;
    fillVoices();
    narrator.load(chapters[ch].paras);
    updateTts();
    if (autostart && ttsSupported) {
      player.pause();
      narrator.play(firstVisiblePara());
    }
  }

  function closeTts() {
    ttsOpen = false;
    bar.hidden = true;
    narrator.stop();
    page.querySelector('.speaking')?.classList.remove('speaking');
    updateTts();
  }

  ttsBtn.addEventListener('click', () => (ttsOpen ? closeTts() : openTts(true)));
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tts]')?.dataset.tts;
    if (!a) return;
    if (a === 'close') return closeTts();
    if (a === 'toggle') {
      if (narrator.state === 'playing' || narrator.state === 'waiting') narrator.pause();
      else {
        player.pause();
        if (narrator.state === 'idle') narrator.play(firstVisiblePara());
        else narrator.play();
      }
    } else if (a === 'next') {
      player.pause();
      narrator.next();
    } else if (a === 'prev') {
      player.pause();
      narrator.prev();
    }
  });
  const offPlayer = player.on(() => {
    if (player.playing && narrator.state === 'playing') narrator.pause();
  });

  poll();

  return () => {
    destroyed = true;
    clearTimeout(timer);
    narrator.stop();
    offVoices();
    offPlayer();
    window.removeEventListener('online', onNetChange);
    window.removeEventListener('offline', onNetChange);
    onScroll.cancel();
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', closePop);
    document.body.classList.remove('reading');
  };
}
