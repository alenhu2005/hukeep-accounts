/**
 * 共用收合區塊：切換 .is-open、箭頭 path、aria-expanded。
 * 由 index.html / views 的 onclick 與 actions 共用。
 */
export function toggleCollapsible(id, iconId, triggerId) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.classList.toggle('is-open');
  const icon = document.getElementById(iconId);
  if (icon) {
    icon.innerHTML = open
      ? '<path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>'
      : '<path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>';
  }
  if (triggerId) {
    const trig = document.getElementById(triggerId);
    if (trig) trig.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}
