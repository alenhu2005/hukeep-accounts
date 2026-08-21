import { esc } from './utils.js';

const URL_PATTERN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/giu;
const TRAILING_PUNCTUATION = /[.,!?;:，。！？；：、)\]}]+$/u;

function splitTrailingPunctuation(value) {
  const match = String(value).match(TRAILING_PUNCTUATION);
  if (!match) return { url: value, trailing: '' };
  return {
    url: value.slice(0, -match[0].length),
    trailing: match[0],
  };
}

export function linkifyNoteText(value) {
  const text = String(value ?? '');
  let html = '';
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const { url, trailing } = splitTrailingPunctuation(raw);
    if (!url) continue;
    const href = /^www\./iu.test(url) ? `https://${url}` : url;
    html += esc(text.slice(cursor, start));
    html += `<a class="note-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>${esc(trailing)}`;
    cursor = start + raw.length;
  }
  html += esc(text.slice(cursor));
  return html;
}
