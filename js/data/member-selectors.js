import { appState } from '../state.js';
import { parseArr, randomUniformIndex } from '../utils.js';
import { buildRenameMapFromRows, resolveMemberName, inferAvatarScope } from './shared.js';

export const MEMBER_COLORS = [
  { id: 'blue', bg: '#eff6ff', fg: '#3b82f6', darkBg: '#1e3a5f', darkFg: '#60a5fa' },
  { id: 'sky', bg: '#f0f9ff', fg: '#0ea5e9', darkBg: '#0c4a6e', darkFg: '#38bdf8' },
  { id: 'cyan', bg: '#ecfeff', fg: '#06b6d4', darkBg: '#164e63', darkFg: '#22d3ee' },
  { id: 'teal', bg: '#f0fdfa', fg: '#14b8a6', darkBg: '#134e4a', darkFg: '#2dd4bf' },
  { id: 'emerald', bg: '#ecfdf5', fg: '#10b981', darkBg: '#064e3b', darkFg: '#34d399' },
  { id: 'green', bg: '#f0fdf4', fg: '#22c55e', darkBg: '#14532d', darkFg: '#4ade80' },
  { id: 'lime', bg: '#f7fee7', fg: '#84cc16', darkBg: '#365314', darkFg: '#a3e635' },
  { id: 'yellow', bg: '#fefce8', fg: '#eab308', darkBg: '#713f12', darkFg: '#fde047' },
  { id: 'amber', bg: '#fffbeb', fg: '#f59e0b', darkBg: '#78350f', darkFg: '#fbbf24' },
  { id: 'orange', bg: '#fff7ed', fg: '#f97316', darkBg: '#7c2d12', darkFg: '#fb923c' },
  { id: 'red', bg: '#fef2f2', fg: '#ef4444', darkBg: '#7f1d1d', darkFg: '#f87171' },
  { id: 'rose', bg: '#fff1f2', fg: '#f43f5e', darkBg: '#4c0519', darkFg: '#fb7185' },
  { id: 'pink', bg: '#fdf2f8', fg: '#ec4899', darkBg: '#831843', darkFg: '#f472b6' },
  { id: 'fuchsia', bg: '#fdf4ff', fg: '#d946ef', darkBg: '#701a75', darkFg: '#e879f9' },
  { id: 'violet', bg: '#f5f3ff', fg: '#8b5cf6', darkBg: '#2e1065', darkFg: '#a78bfa' },
  { id: 'slate', bg: '#f1f5f9', fg: '#64748b', darkBg: '#1e293b', darkFg: '#94a3b8' },
];

export const HIDDEN_MEMBER_COLORS = [
  { id: 'hidden-neon', label: '霓虹青', styleKey: 'neon', bg: '#ecfeff', fg: '#22d3ee', darkBg: '#042f2e', darkFg: '#67e8f9' },
  { id: 'hidden-gold', label: '流金', styleKey: 'gold', bg: '#fff4b0', fg: '#b45309', darkBg: '#2b1600', darkFg: '#fcd34d' },
  { id: 'hidden-cosmic', label: '星際紫', styleKey: 'cosmic', bg: '#f5f3ff', fg: '#7c3aed', darkBg: '#12002b', darkFg: '#c4b5fd' },
  { id: 'hidden-lava', label: '熔岩橙', styleKey: 'lava', bg: '#fff7ed', fg: '#ea580c', darkBg: '#2a0a00', darkFg: '#fb923c' },
  { id: 'hidden-mint', label: '薄荷綠', styleKey: 'mint', bg: '#d1fae5', fg: '#047857', darkBg: '#052e24', darkFg: '#10b981' },
  { id: 'hidden-aurora', label: '極光', styleKey: 'aurora', bg: '#eef2ff', fg: '#6366f1', darkBg: '#0b102a', darkFg: '#a5b4fc' },
  { id: 'hidden-sakura', label: '櫻霧', styleKey: 'sakura', bg: '#fff1f2', fg: '#fb7185', darkBg: '#2a0a14', darkFg: '#fda4af' },
  { id: 'hidden-ice', label: '冰晶', styleKey: 'ice', bg: '#f0f9ff', fg: '#38bdf8', darkBg: '#062235', darkFg: '#7dd3fc' },
  { id: 'hidden-ink', label: '墨影', styleKey: 'ink', bg: '#f1f5f9', fg: '#0f172a', darkBg: '#020617', darkFg: '#e2e8f0' },
  { id: 'hidden-prism', label: '稜鏡', styleKey: 'prism', bg: '#fdf4ff', fg: '#e879f9', darkBg: '#1a0622', darkFg: '#f5d0fe' },
];

export function getHiddenMemberStyleKey(id) {
  const v = typeof id === 'string' ? id.trim() : '';
  if (!v) return '';
  const h = HIDDEN_MEMBER_COLORS.find(x => x.id === v);
  return h?.styleKey || '';
}

function isDark() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

function resolveColor(c) {
  return isDark() ? { id: c.id, bg: c.darkBg, fg: c.darkFg } : { id: c.id, bg: c.bg, fg: c.fg };
}

export function getAvatarUrlByMemberNameFromRows(memberName, allRows = appState.allRows, scope = 'auto') {
  const name = memberName ?? '';
  let last = null;
  const want = inferAvatarScope(name, scope);
  for (const r of allRows) {
    if (!r || r.type !== 'avatar' || r.memberName !== name || !r.avatarUrl) continue;
    const rowScope = inferAvatarScope(r.memberName, r.avatarScope || 'auto');
    if (rowScope !== want) continue;
    last = r.avatarUrl;
  }
  return last;
}

export function getAvatarUrlByMemberName(memberName, scope = 'auto') {
  return getAvatarUrlByMemberNameFromRows(memberName, appState.allRows, scope);
}

export function getMemberColorFromRows(
  memberName,
  allRows = appState.allRows,
  pendingMemberColors = appState.pendingMemberColors,
) {
  const renames = buildRenameMapFromRows(allRows);
  const name = resolveMemberName(memberName ?? '', renames);

  const pendingId = pendingMemberColors?.[name];
  if (pendingId) {
    const pickedPending = [...MEMBER_COLORS, ...HIDDEN_MEMBER_COLORS].find(c => c.id === String(pendingId).trim());
    if (pickedPending) return resolveColor(pickedPending);
  }

  let colorId = null;
  for (const r of allRows) {
    if (r && r.type === 'memberProfile' && r.memberName && r.colorId) {
      const who = resolveMemberName(r.memberName, renames);
      if (who === name) colorId = String(r.colorId).trim();
    }
  }
  const picked = colorId && [...MEMBER_COLORS, ...HIDDEN_MEMBER_COLORS].find(c => c.id === colorId);
  if (picked) return resolveColor(picked);

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return resolveColor(MEMBER_COLORS[((hash % MEMBER_COLORS.length) + MEMBER_COLORS.length) % MEMBER_COLORS.length]);
}

/** @returns {{ id: string, bg: string, fg: string }} */
export function getMemberColor(memberName) {
  return getMemberColorFromRows(memberName, appState.allRows, appState.pendingMemberColors);
}

export function getMemberColorId(memberName) {
  const c = getMemberColor(memberName);
  return c?.id || '';
}

export function isHiddenMemberColorId(id) {
  const v = typeof id === 'string' ? id.trim() : '';
  return !!v && HIDDEN_MEMBER_COLORS.some(h => h.id === v);
}

export function getKnownMemberNamesFromRows(allRows = appState.allRows) {
  const names = new Set();
  const deleted = new Set();
  for (const r of allRows) {
    if (r.type === 'trip' && r.action === 'add' && r.members) {
      for (const m of parseArr(r.members)) names.add(m);
    }
    if (r.type === 'avatar' && r.memberName && inferAvatarScope(r.memberName, r.avatarScope || 'auto') === 'trip') {
      names.add(r.memberName);
    }
    if (r.type === 'memberProfile' && r.memberName) {
      names.add(r.memberName);
      if (r.deleted || r.action === 'delete') deleted.add(r.memberName);
      if (r.action === 'restore') deleted.delete(r.memberName);
    }
  }
  return [...names].filter(name => !deleted.has(name));
}

export function getKnownMemberNames() {
  return getKnownMemberNamesFromRows(appState.allRows);
}

export function pickRandomMemberColorId() {
  return MEMBER_COLORS[randomUniformIndex(MEMBER_COLORS.length)].id;
}
