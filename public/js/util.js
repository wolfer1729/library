export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function debounce(fn, ms) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

/** localStorage wrapper that never throws (private mode, blocked storage…). */
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function fmtSize(bytes) {
  if (!bytes) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < u.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** Detects the dominant script of a text: 'hi' (Devanagari), 'te' (Telugu) or 'en' (Latin). */
export function detectLang(text) {
  const s = String(text || '').slice(0, 30000);
  let deva = 0;
  let telu = 0;
  let latin = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x0900 && c <= 0x097f) deva++;
    else if (c >= 0x0c00 && c <= 0x0c7f) telu++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
  }
  const max = Math.max(deva, telu, latin);
  if (!max) return 'other';
  if (max === telu) return 'te';
  if (max === deva) return 'hi';
  return 'en';
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

let toastTimer;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, kind === 'error' ? 5000 : 2800);
}

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [p, q] = raw.split('?');
  return {
    parts: p.split('/').filter(Boolean).map((x) => {
      try {
        return decodeURIComponent(x);
      } catch {
        return x;
      }
    }),
    query: new URLSearchParams(q || ''),
  };
}

const scriptCache = new Map();
export function loadScript(src) {
  if (!scriptCache.has(src)) {
    scriptCache.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => {
          scriptCache.delete(src);
          reject(new Error(`Could not load ${src}`));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return scriptCache.get(src);
}
