import { marked, Renderer } from 'marked';
import { esc } from './utils.js';

const renderer = new Renderer();
const TRAILING_PUNCTUATION = /[.,!?;:，。！？；：、)\]}]+$/u;

function safeExternalHref(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

renderer.html = token => esc(token.text || token.raw || '');

renderer.link = token => {
  const isBareUrl = /^(?:https?:\/\/|www\.)/iu.test(token.raw || '');
  const labelText = String(token.text || token.href || '');
  const trailing = isBareUrl ? labelText.match(TRAILING_PUNCTUATION)?.[0] || '' : '';
  const visibleLabel = trailing ? labelText.slice(0, -trailing.length) : labelText;
  const hrefValue = isBareUrl
    ? /^www\./iu.test(visibleLabel)
      ? `https://${visibleLabel}`
      : visibleLabel
    : token.href;
  const href = safeExternalHref(hrefValue);
  if (!href) return `${esc(visibleLabel)}${esc(trailing)}`;
  return `<a class="note-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(visibleLabel)}</a>${esc(trailing)}`;
};

renderer.image = token => `<span class="note-markdown-image-alt">${esc(token.text || '圖片')}</span>`;

export function linkifyNoteText(value) {
  return marked
    .parse(String(value ?? ''), {
      renderer,
      gfm: true,
      breaks: true,
      async: false,
    })
    .trim();
}
