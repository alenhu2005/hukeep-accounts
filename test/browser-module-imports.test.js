import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { init, parse } from 'es-module-lexer';
import { describe, expect, it } from 'vitest';

const jsRoot = resolve(import.meta.dirname, '../js');

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

function bareImports(source) {
  const [imports] = parse(source);
  const specifiers = imports.map(entry => entry.n).filter(Boolean);
  return specifiers.filter(specifier => !specifier.startsWith('.') && !specifier.startsWith('/'));
}

describe('browser module imports', () => {
  it('keeps source-deployed browser modules free of bare package imports', async () => {
    await init;
    const failures = javascriptFiles(jsRoot).flatMap(file =>
      bareImports(readFileSync(file, 'utf8')).map(specifier => ({ file, specifier })),
    );

    expect(failures).toEqual([]);
  });
});
