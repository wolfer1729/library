import { store } from './util.js';

// Read-aloud using the browser's built-in speech synthesis (Web Speech API).
// Text is spoken sentence by sentence (short utterances avoid Chrome's ~15 s cut-off bug).

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
const LANG_TAG = { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' };

export function allVoices() {
  return ttsSupported ? speechSynthesis.getVoices() : [];
}

export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * Voices for a language, best first: natural/online voices, then Indian locales. Without internet,
 * voices installed on the device (localService) come first, because online voices can't speak.
 */
export function voicesFor(lang) {
  const prefix = (lang || 'en').toLowerCase();
  const offline = !isOnline();
  const score = (v) =>
    (offline && v.localService ? 32 : 0) +
    (/natural/i.test(v.name) ? 8 : 0) +
    (/online|neural|google|premium|enhanced/i.test(v.name) ? 4 : 0) +
    (/-in$/i.test(v.lang.replace('_', '-')) ? 2 : 0) +
    (v.default ? 1 : 0);
  return allVoices()
    .filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(prefix))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export function onVoicesReady(cb) {
  if (!ttsSupported) return () => {};
  const handler = () => cb(allVoices());
  speechSynthesis.addEventListener?.('voiceschanged', handler);
  if (allVoices().length) setTimeout(handler, 0);
  return () => speechSynthesis.removeEventListener?.('voiceschanged', handler);
}

export function textOf(p) {
  return typeof p === 'string' ? p : p?.h || '';
}

export function isSpeakable(p) {
  return /[\p{L}\p{N}]/u.test(textOf(p));
}

/** Splits text into chunks of whole sentences, each at most `max` characters. */
export function chunkText(s, max = 220) {
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const parts = s.match(/[^.!?।॥]+(?:[.!?।॥]+["'”’)\]]*|$)\s*/g) || [s];
  const out = [];
  let buf = '';
  for (let p of parts) {
    if ((buf + p).length <= max) {
      buf += p;
      continue;
    }
    if (buf.trim()) out.push(buf.trim());
    buf = '';
    while (p.length > max) {
      let cut = p.lastIndexOf(', ', max);
      if (cut < max * 0.5) cut = p.lastIndexOf(' ', max);
      if (cut < max * 0.3) cut = max;
      out.push(p.slice(0, cut + 1).trim());
      p = p.slice(cut + 1);
    }
    buf = p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export class Narrator {
  constructor({ onPara, onEnd, onState, onVoiceFallback, onError } = {}) {
    this.onPara = onPara;
    this.onEnd = onEnd;
    this.onState = onState;
    this.onVoiceFallback = onVoiceFallback;
    this.onError = onError;
    this.paras = [];
    this.i = 0;
    this.chunks = null;
    this.ci = 0;
    this.state = 'idle'; // idle | playing | paused | waiting
    this.rate = store.get('ttsRate', 1);
    this.lang = 'en';
    this.voice = null;
    this.token = 0;
    this.errors = 0;
  }

  setLang(lang) {
    this.lang = lang;
    this.pickVoice();
  }

  pickVoice() {
    const list = voicesFor(this.lang);
    const saved = store.get(`ttsVoice:${this.lang}`, null);
    let voice = list.find((v) => v.voiceURI === saved) || list[0] || null;
    if (voice && !voice.localService && !isOnline()) voice = list.find((v) => v.localService) || voice;
    this.voice = voice;
    return this.voice;
  }

  /** An online voice failed (usually: no internet). Switch to an installed voice and retry. */
  _fallback() {
    const local = voicesFor(this.lang).find((v) => v.localService && v !== this.voice);
    if (local && this.voice && !this.voice.localService) {
      this.voice = local;
      this.onVoiceFallback?.(local);
      this._speak();
      return true;
    }
    return false;
  }

  setVoice(uri) {
    store.set(`ttsVoice:${this.lang}`, uri);
    this.pickVoice();
    if (this.state === 'playing') this._speak();
  }

  setRate(rate) {
    this.rate = rate;
    store.set('ttsRate', rate);
    if (this.state === 'playing') this._speak();
  }

  load(paras) {
    this.paras = paras || [];
    this.i = 0;
    this.chunks = null;
    this.ci = 0;
  }

  play(fromIndex) {
    if (!ttsSupported) return;
    if (fromIndex != null) {
      this.i = Math.max(0, Math.min(fromIndex, this.paras.length));
      this.chunks = null;
      this.ci = 0;
    }
    this.errors = 0;
    this._speak();
  }

  pause() {
    this.token++;
    if (ttsSupported) speechSynthesis.cancel();
    this._setState('paused');
  }

  stop() {
    this.token++;
    if (ttsSupported) speechSynthesis.cancel();
    this._setState('idle');
  }

  wait() {
    this.token++;
    if (ttsSupported) speechSynthesis.cancel();
    this._setState('waiting');
  }

  next() {
    this.play(this.i + 1);
  }

  prev() {
    this.play(Math.max(0, this.i - (this.ci > 0 ? 0 : 1)));
  }

  _setState(s) {
    this.state = s;
    this.onState?.(s);
  }

  _speak() {
    const tok = ++this.token;
    speechSynthesis.cancel();
    while (this.i < this.paras.length && !isSpeakable(this.paras[this.i])) {
      this.i++;
      this.chunks = null;
      this.ci = 0;
    }
    if (this.i >= this.paras.length) {
      this._setState('idle');
      this.onEnd?.();
      return;
    }
    if (!this.chunks) {
      this.chunks = chunkText(textOf(this.paras[this.i]));
      this.ci = 0;
    }
    if (this.ci === 0) this.onPara?.(this.i);
    this._setState('playing');
    const u = new SpeechSynthesisUtterance(this.chunks[this.ci]);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang || LANG_TAG[this.lang] || this.lang;
    u.rate = this.rate;
    const advance = () => {
      this.ci++;
      if (this.ci >= this.chunks.length) {
        this.i++;
        this.chunks = null;
        this.ci = 0;
      }
      this._speak();
    };
    let started = false;
    u.onstart = () => {
      started = true;
    };
    u.onend = () => {
      if (tok !== this.token) return;
      this.errors = 0;
      advance();
    };
    u.onerror = (e) => {
      if (tok !== this.token || e.error === 'interrupted' || e.error === 'canceled') return;
      if (['network', 'synthesis-failed', 'synthesis-unavailable'].includes(e.error) && this.voice && !this.voice.localService) {
        if (this._fallback()) return;
        this.stop();
        this.onError?.('needs-network');
        return;
      }
      this.errors++;
      if (this.errors > 3) {
        this.stop();
        return;
      }
      advance();
    };
    this.utterance = u; // keep a reference so the browser doesn't garbage-collect it mid-speech
    setTimeout(() => {
      if (tok !== this.token) return;
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    }, 40);
    // Online voices can stay silent without any error when there is no internet.
    if (this.voice && !this.voice.localService) {
      setTimeout(() => {
        if (tok !== this.token || started || isOnline()) return;
        this.token++;
        speechSynthesis.cancel();
        if (!this._fallback()) {
          this.stop();
          this.onError?.('needs-network');
        }
      }, 8000);
    }
  }
}
