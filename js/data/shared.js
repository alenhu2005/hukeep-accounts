import { USER_A, USER_B } from '../config.js';

/**
 * 試算表／重試 POST 可能造成同一 id 多筆 add；顯示與結算只保留第一筆。
 * @param {import('../model.js').LedgerRow[]} addRows
 */
export function dedupeLedgerAddsById(addRows) {
  const seen = new Set();
  const out = [];
  for (const r of addRows) {
    const id = r?.id != null ? String(r.id).trim() : '';
    if (!id) {
      out.push(r);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

export function buildRenameMapFromRows(allRows = []) {
  const renames = new Map();
  for (const r of allRows) {
    if (r && r.type === 'memberProfile' && r.action === 'rename' && r.memberName && r.newName) {
      renames.set(String(r.memberName), String(r.newName));
    }
  }
  return renames;
}

export function resolveMemberName(name, renames) {
  let cur = String(name ?? '');
  const visited = new Set();
  while (renames.has(cur) && !visited.has(cur)) {
    visited.add(cur);
    cur = renames.get(cur);
  }
  return cur;
}

export function inferAvatarScope(memberName, scope) {
  if (scope === 'trip' || scope === 'daily') return scope;
  const n = memberName ?? '';
  return n === USER_A || n === USER_B ? 'daily' : 'trip';
}
