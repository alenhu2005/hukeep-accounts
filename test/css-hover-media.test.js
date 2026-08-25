import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const CSS_DIR = fileURLToPath(new URL('../css', import.meta.url));

function hasPointerHoverGuard(rule) {
  let parent = rule.parent;
  while (parent) {
    if (
      parent.type === 'atrule' &&
      parent.name === 'media' &&
      /hover\s*:\s*hover/.test(parent.params) &&
      /pointer\s*:\s*fine/.test(parent.params)
    ) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

describe('touch interaction styles', () => {
  it('只在具備滑鼠 hover 的裝置套用 hover 規則', () => {
    const unguarded = [];
    for (const file of fs.readdirSync(CSS_DIR).filter(name => name.endsWith('.css'))) {
      const css = fs.readFileSync(path.join(CSS_DIR, file), 'utf8');
      const root = postcss.parse(css, { from: file });
      root.walkRules(rule => {
        if (rule.selector.includes(':hover') && !hasPointerHoverGuard(rule)) {
          unguarded.push(`${file}: ${rule.selector}`);
        }
      });
    }

    expect(unguarded).toEqual([]);
  });
});
