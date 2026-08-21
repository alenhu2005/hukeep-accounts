import { describe, expect, it } from 'vitest';
import { linkifyNoteText } from '../js/note-links.js';

describe('linkifyNoteText', () => {
  it('turns http, https, and www URLs into safe external links', () => {
    const html = linkifyNoteText('文件：https://example.com/a?x=1\n備用 www.example.org/path');

    expect(html).toContain('href="https://example.com/a?x=1"');
    expect(html).toContain('href="https://www.example.org/path"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('keeps trailing punctuation outside the link', () => {
    expect(linkifyNoteText('請看 https://example.com/test。')).toContain(
      '>https://example.com/test</a>。',
    );
  });

  it('escapes HTML instead of rendering it', () => {
    const html = linkifyNoteText('<img src=x onerror=alert(1)> https://safe.example');

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });
});
