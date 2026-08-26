import { describe, expect, it } from 'vitest';
import { linkifyNoteText } from '../js/note-links.js';

describe('linkifyNoteText', () => {
  it('renders common Markdown including asterisk emphasis and lists', () => {
    const html = linkifyNoteText('**重要**與*補充*\n\n- 護照\n- 充電器\n\n`代碼`');

    expect(html).toContain('<strong>重要</strong>');
    expect(html).toContain('<em>補充</em>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>護照</li>');
    expect(html).toContain('<code>代碼</code>');
  });

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

  it('blocks unsafe Markdown links and Markdown image injection', () => {
    const html = linkifyNoteText(
      '[危險連結](javascript:alert(1)) ![遠端圖片](https://evil.example/tracker.png)',
    );

    expect(html).toContain('危險連結');
    expect(html).toContain('遠端圖片');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('<img');
  });

  it('escapes raw anchors and blocks relative or entity-obfuscated schemes', () => {
    const html = linkifyNoteText(
      '<a href="https://evil.example">原始連結</a> [相對連結](//evil.example) [混淆連結](jav&#x61;script:alert(1))',
    );

    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
    expect(html).not.toContain('<a href="https://evil.example"');
    expect(html).not.toContain('href="//evil.example"');
    expect(html).not.toContain('javascript:');
  });
});
