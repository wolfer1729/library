import { esc, hashStr } from './util.js';

// Generated "cloth-bound" covers: colour family by genre, varied per title.
const PALETTES = {
  classics: [['#4a1717', '#7f2a2a'], ['#1b2f4d', '#2c4c78'], ['#1f3a2a', '#2f5c42'], ['#3a2a1a', '#6b4a2a']],
  social: [['#20403f', '#33615f'], ['#3b2f4a', '#5a4870'], ['#4a3418', '#7a5527']],
  romance: [['#6e1a35', '#a8395c'], ['#7c2f3c', '#b85d6a'], ['#5a1f4a', '#8e3d78']],
  mystery: [['#1a2233', '#34425f'], ['#222', '#474747'], ['#23313a', '#3d5563']],
  adventure: [['#2c4a1f', '#4f7a33'], ['#5a3a12', '#93622a'], ['#123f4a', '#1f6a7a']],
  historical: [['#4d3315', '#80562a'], ['#3d2a20', '#6b4b3a'], ['#4a2c12', '#7d4a1d']],
  'short-stories': [['#2d3f54', '#4b6584'], ['#3f4b2e', '#64784a'], ['#4b2e3f', '#784a65']],
  children: [['#b8571c', '#e58a3a'], ['#2f7d5c', '#4fae86'], ['#3a63a8', '#5e8ad6'], ['#a8402f', '#d86b55']],
  folk: [['#8a3b12', '#c2652a'], ['#6b4a12', '#a8782a'], ['#2e5a4a', '#4b8a70']],
  fantasy: [['#2b1d4f', '#53379a'], ['#123a4f', '#2a6f8f'], ['#4a1d4f', '#7e3a86']],
  scifi: [['#0f2f3f', '#1d5b73'], ['#151a3a', '#2c3a7a'], ['#0f3a33', '#1f6b5e']],
  horror: [['#1a0d0d', '#4a1414'], ['#141414', '#3a2020'], ['#16141f', '#3a2a4a']],
  humor: [['#a8741a', '#d9a23a'], ['#2f6b8a', '#4f97b8'], ['#8a3a5a', '#bb5f84']],
  drama: [['#3f1a4a', '#6b2f7a'], ['#4a1a2a', '#7a2f48']],
  poetry: [['#4a2a4a', '#7a4d7a'], ['#2a3f4a', '#4d6b7a'], ['#5a3a2a', '#8a5f48']],
  epics: [['#7a4a0f', '#b8801f'], ['#5a2a0f', '#94501f'], ['#6b1f1f', '#a83a2a']],
  philosophy: [['#2a3a3a', '#4a6464'], ['#3a3020', '#665536']],
};
const ORNAMENTS = { classics: '❦', romance: '❤', mystery: '◈', adventure: '✦', historical: '♜', children: '✿', folk: '❀', fantasy: '✧', scifi: '✺', horror: '☾', humor: '☺', drama: '♣', poetry: '❧', epics: '☀', philosophy: '☯', social: '❖', 'short-stories': '✎' };

export function coverHTML(book, { flag = '' } = {}) {
  if (book.cover) {
    return `<div class="cover"><img src="${esc(book.cover)}" alt="" loading="lazy">${flag ? `<span class="cover-flag">${esc(flag)}</span>` : ''}</div>`;
  }
  const genre = (book.genres || [])[0] || 'classics';
  const pal = PALETTES[genre] || PALETTES.classics;
  const h = hashStr(book.id + book.title);
  const [c1, c2] = pal[h % pal.length];
  const lang = ['hi', 'te', 'en'].includes(book.lang) ? book.lang : 'en';
  // Shrink the title when the whole title, or its longest word, would not fit the frame.
  const longestWord = Math.max(...book.title.split(/\s+/).map((w) => [...w].length));
  const size = longestWord > 11 ? ' xlong' : [...book.title].length > 26 || longestWord > 8 ? ' long' : '';
  return `<div class="cover cover-gen" style="--c1:${c1};--c2:${c2}">
    <div class="cover-frame">
      <div class="cover-orn" aria-hidden="true">${ORNAMENTS[genre] || '❦'}</div>
      <div class="cover-title${size}" lang="${lang}">${esc(book.title)}</div>
      <div class="cover-rule"></div>
      <div class="cover-author" lang="${lang}">${esc(book.author || '')}</div>
    </div>${flag ? `<span class="cover-flag">${esc(flag)}</span>` : ''}
  </div>`;
}
