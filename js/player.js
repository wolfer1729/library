import { esc, store, fmtTime, toast } from './util.js';
import { icons } from './icons.js';
import { coverHTML } from './covers.js';
import { t } from './i18n.js';

// Persistent audiobook player (LibriVox recordings or uploaded audio files).

export const RATES = [0.75, 1, 1.15, 1.25, 1.5, 1.75, 2];

class Player {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.book = null;
    this.tracks = [];
    this.index = 0;
    this.rate = store.get('abRate', 1);
    this.listeners = new Set();
    this.lastSave = 0;
    this.dragging = false;
    const a = this.audio;
    a.addEventListener('timeupdate', () => {
      this.updateTime();
      if (Date.now() - this.lastSave > 4000) this.save();
    });
    a.addEventListener('loadedmetadata', () => this.updateTime());
    a.addEventListener('play', () => this.sync());
    a.addEventListener('pause', () => {
      this.save();
      this.sync();
    });
    a.addEventListener('ended', () => {
      if (this.index + 1 < this.tracks.length) this.playIndex(this.index + 1);
      else {
        this.save(true);
        this.sync();
      }
    });
    a.addEventListener('error', () => {
      if (this.book && a.getAttribute('src')) toast(t('audioError'), 'error');
      this.sync();
    });
  }

  get el() {
    return document.getElementById('player');
  }

  init() {
    const el = this.el;
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-a]')?.dataset.a;
      if (act === 'toggle') this.toggle();
      else if (act === 'prev') this.audio.currentTime > 5 ? (this.audio.currentTime = 0) : this.playIndex(this.index - 1);
      else if (act === 'next') this.playIndex(this.index + 1);
      else if (act === 'back') this.skip(-15);
      else if (act === 'fwd') this.skip(30);
      else if (act === 'close') this.close();
    });
    el.addEventListener('input', (e) => {
      if (e.target.type !== 'range') return;
      this.dragging = true;
      const d = this.audio.duration || 0;
      const cur = el.querySelector('[data-cur]');
      if (cur) cur.textContent = fmtTime((e.target.value / 1000) * d);
    });
    el.addEventListener('change', (e) => {
      if (e.target.type === 'range') {
        const d = this.audio.duration || 0;
        if (d) this.audio.currentTime = (e.target.value / 1000) * d;
        this.dragging = false;
      } else if (e.target.dataset.a === 'rate') {
        this.setRate(Number(e.target.value));
      }
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  get playing() {
    return Boolean(this.book) && !this.audio.paused && !this.audio.ended;
  }

  isBook(id) {
    return this.book?.id === id;
  }

  saved(id) {
    return store.get(`ab:${id}`, null);
  }

  load(book, tracks, index = 0, { time = 0, autoplay = true } = {}) {
    if (!tracks.length) return;
    this.book = book;
    this.tracks = tracks;
    this.index = Math.min(Math.max(0, index), tracks.length - 1);
    this.audio.src = tracks[this.index].url;
    this.audio.playbackRate = this.rate;
    if (time > 0) {
      const seek = () => {
        this.audio.currentTime = time;
        this.audio.removeEventListener('loadedmetadata', seek);
      };
      this.audio.addEventListener('loadedmetadata', seek);
    }
    this.render();
    this.mediaSession();
    if (autoplay) this.audio.play().catch(() => {});
    this.emit();
  }

  playIndex(i) {
    if (!this.book || i < 0 || i >= this.tracks.length) return;
    this.index = i;
    this.audio.src = this.tracks[i].url;
    this.audio.playbackRate = this.rate;
    this.audio.play().catch(() => {});
    this.render();
    this.mediaSession();
    this.save();
    this.emit();
  }

  toggle() {
    if (!this.book) return;
    if (this.audio.paused) this.audio.play().catch(() => {});
    else this.audio.pause();
  }

  pause() {
    if (this.book && !this.audio.paused) this.audio.pause();
  }

  skip(delta) {
    const d = this.audio.duration || 0;
    this.audio.currentTime = Math.max(0, Math.min(d || Infinity, this.audio.currentTime + delta));
  }

  setRate(r) {
    this.rate = r;
    this.audio.playbackRate = r;
    store.set('abRate', r);
  }

  close() {
    this.save();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.book = null;
    this.tracks = [];
    this.el.hidden = true;
    this.el.innerHTML = '';
    document.body.classList.remove('has-player');
    this.emit();
  }

  save(finished = false) {
    if (!this.book) return;
    this.lastSave = Date.now();
    store.set(`ab:${this.book.id}`, { index: this.index, time: finished ? 0 : this.audio.currentTime || 0, at: Date.now() });
  }

  render() {
    const el = this.el;
    if (!this.book) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    document.body.classList.add('has-player');
    const tr = this.tracks[this.index];
    const lang = ['hi', 'te'].includes(this.book.lang) ? this.book.lang : 'en';
    el.setAttribute('aria-label', t('audiobookPlayer'));
    el.innerHTML = `
      <a class="pl-info" href="#/book/${encodeURIComponent(this.book.id)}">
        ${coverHTML(this.book)}
        <div class="pl-meta"><b lang="${lang}">${esc(this.book.title)}</b><span>${esc(tr.title)} · ${this.index + 1}/${this.tracks.length}</span></div>
      </a>
      <div class="pl-center">
        <div class="pl-controls">
          <button class="icon-btn" data-a="prev" title="${esc(t('prevTrack'))}" aria-label="${esc(t('prevTrack'))}">${icons.prev}</button>
          <button class="icon-btn skip" data-a="back" title="${esc(t('back15'))}" aria-label="${esc(t('back15'))}">${icons.back15}</button>
          <button class="icon-btn pl-play" data-a="toggle" title="${esc(t('playPause'))}" aria-label="${esc(t('playPause'))}">${this.playing ? icons.pause : icons.play}</button>
          <button class="icon-btn skip" data-a="fwd" title="${esc(t('fwd30'))}" aria-label="${esc(t('fwd30'))}">${icons.fwd30}</button>
          <button class="icon-btn" data-a="next" title="${esc(t('nextTrack'))}" aria-label="${esc(t('nextTrack'))}">${icons.next}</button>
        </div>
        <div class="pl-seek"><span data-cur>0:00</span><input type="range" min="0" max="1000" value="0" aria-label="${esc(t('seek'))}"><span data-dur>0:00</span></div>
      </div>
      <div class="pl-right">
        <select class="select" data-a="rate" aria-label="${esc(t('speed'))}">${RATES.map((r) => `<option value="${r}" ${r === this.rate ? 'selected' : ''}>${r}×</option>`).join('')}</select>
        <button class="icon-btn" data-a="close" title="${esc(t('close'))}" aria-label="${esc(t('close'))}">${icons.close}</button>
      </div>`;
    this.updateTime();
  }

  sync() {
    const b = this.el.querySelector('[data-a="toggle"]');
    if (b) b.innerHTML = this.playing ? icons.pause : icons.play;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = this.playing ? 'playing' : 'paused';
    this.emit();
  }

  updateTime() {
    const el = this.el;
    const d = this.audio.duration || 0;
    const c = this.audio.currentTime || 0;
    const cur = el.querySelector('[data-cur]');
    const dur = el.querySelector('[data-dur]');
    const range = el.querySelector('input[type="range"]');
    if (!cur) return;
    if (!this.dragging) {
      cur.textContent = fmtTime(c);
      if (range) range.value = d ? Math.round((c / d) * 1000) : 0;
    }
    dur.textContent = fmtTime(d);
  }

  mediaSession() {
    if (!('mediaSession' in navigator) || !this.book) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.tracks[this.index].title,
        artist: this.book.author || '',
        album: this.book.title,
        artwork: this.book.cover ? [{ src: new URL(this.book.cover, location.href).href }] : [],
      });
      const h = (a, fn) => {
        try {
          navigator.mediaSession.setActionHandler(a, fn);
        } catch {
          /* unsupported action */
        }
      };
      h('play', () => this.audio.play());
      h('pause', () => this.audio.pause());
      h('previoustrack', () => this.playIndex(this.index - 1));
      h('nexttrack', () => this.playIndex(this.index + 1));
      h('seekbackward', () => this.skip(-15));
      h('seekforward', () => this.skip(30));
    } catch {
      /* ignore */
    }
  }
}

export const player = new Player();
