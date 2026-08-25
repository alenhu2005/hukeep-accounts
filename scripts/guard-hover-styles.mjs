import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CSS_DIR = path.join(ROOT, 'css');
const POINTER_HOVER_QUERY = '(hover: hover) and (pointer: fine)';

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

function indentHoverRule(rule) {
  rule.raws.before = '\n  ';
  rule.raws.after = '\n  ';
  rule.each(node => {
    if (node.raws.before?.includes('\n')) {
      node.raws.before = node.raws.before.replace(/\n/g, '\n  ');
    }
  });
}

function guardHoverRules(root) {
  const rules = [];
  root.walkRules(rule => rules.push(rule));

  for (const rule of rules) {
    if (!rule.selector.includes(':hover') || hasPointerHoverGuard(rule)) continue;
    const selectors = postcss.list.comma(rule.selector);
    const hoverSelectors = selectors.filter(selector => selector.includes(':hover'));
    const otherSelectors = selectors.filter(selector => !selector.includes(':hover'));
    const hoverRule = rule.clone({ selector: hoverSelectors.join(',\n  ') });
    indentHoverRule(hoverRule);

    const media = postcss.atRule({ name: 'media', params: POINTER_HOVER_QUERY });
    media.raws.before = rule.raws.before;
    media.raws.after = '\n';
    media.append(hoverRule);

    if (otherSelectors.length) {
      rule.selector = otherSelectors.join(',\n');
      rule.after(media);
    } else {
      rule.replaceWith(media);
    }
  }
}

for (const name of fs.readdirSync(CSS_DIR).filter(file => file.endsWith('.css'))) {
  const file = path.join(CSS_DIR, name);
  const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
  guardHoverRules(root);
  fs.writeFileSync(file, root.toString());
}
