/** @typedef {'blue'|'teal'|'violet'|'rose'|'amber'|'emerald'} AccentId */

export const ACCENT_IDS = /** @type {const} */ ([
  'blue',
  'teal',
  'violet',
  'rose',
  'amber',
  'emerald',
]);

/** 顯示名稱（選單用） */
export const ACCENT_LABELS = /** @type {Record<AccentId, string>} */ ({
  blue: '標準藍',
  teal: '青綠',
  violet: '紫羅蘭',
  rose: '玫瑰紅',
  amber: '琥珀',
  emerald: '翠綠',
});

/** 淺色狀態列 theme-color */
const ACCENT_META_LIGHT = /** @type {Record<AccentId, string>} */ ({
  blue: '#3b82f6',
  teal: '#0d9488',
  violet: '#7c3aed',
  rose: '#e11d48',
  amber: '#d97706',
  emerald: '#059669',
});

/**
 * @param {string | null | undefined} raw
 * @returns {AccentId}
 */
export function normalizeAccentId(raw) {
  return ACCENT_IDS.includes(/** @type {AccentId} */ (raw)) ? /** @type {AccentId} */ (raw) : 'blue';
}

/**
 * @param {AccentId} id
 */
export function applyAccentMetaColor(id) {
  const hex = ACCENT_META_LIGHT[id] || ACCENT_META_LIGHT.blue;
  const meta = document.querySelector('meta[name="theme-color"][media*="light"]');
  if (meta) meta.setAttribute('content', hex);
}

/**
 * 啟動時呼叫：依 document 上已有之 data-accent 更新 meta（inline script 已設好 data-accent）
 */
export function applyAccentMetaFromDom() {
  const id = normalizeAccentId(document.documentElement.getAttribute('data-accent'));
  applyAccentMetaColor(id);
}

/**
 * @param {AccentId} id
 */
function syncAccentMenuHighlight() {
  const current = normalizeAccentId(document.documentElement.getAttribute('data-accent'));
  const overlay = document.getElementById('accent-menu-overlay');
  if (!overlay) return;
  overlay.querySelectorAll('.accent-menu-btn[data-accent-id]').forEach(el => {
    const btn = /** @type {HTMLElement} */ (el);
    const id = btn.getAttribute('data-accent-id');
    btn.classList.toggle('is-current', id === current);
  });
}

export function setAccentTheme(id) {
  const next = normalizeAccentId(id);
  localStorage.setItem('accent', next);
  document.documentElement.setAttribute('data-accent', next);
  applyAccentMetaColor(next);
  syncAccentMenuHighlight();
  closeAccentMenu();
}

export function closeAccentMenu() {
  const overlay = document.getElementById('accent-menu-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

/**
 * @param {Event} [event]
 */
export function toggleAccentMenu(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const overlay = document.getElementById('accent-menu-overlay');
  if (!overlay) return;
  const open = overlay.classList.toggle('open');
  overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) {
    syncAccentMenuHighlight();
    const id = normalizeAccentId(document.documentElement.getAttribute('data-accent'));
    const btn = overlay.querySelector(`[data-accent-id="${id}"]`);
    if (btn instanceof HTMLElement) {
      requestAnimationFrame(() => btn.focus());
    }
  }
}
