export function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now();
}

export function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Safe embedding inside inline onclick="" */
export function jq(v) {
  return JSON.stringify(v);
}

export function jqAttr(v) {
  return jq(v).replace(/"/g, '&quot;');
}

export function parseArr(s) {
  try {
    const r = JSON.parse(s);
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

export function toast(msg) {
  const el = document.getElementById('toast-container');
  const div = document.createElement('div');
  div.className = 'toast-item';
  div.textContent = msg;
  el.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

/** AbortSignal.timeout fallback for older browsers */
export function abortSignalAfter(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
