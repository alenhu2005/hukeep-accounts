/**
 * 金額欄：僅半形數字；阻擋 IME 組字（含注音底線預覽），請用英數或直接按數字鍵。
 * 全形數字會轉半形。
 */
const ALLOWED_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Escape',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

function isAmountInput(el) {
  return el instanceof HTMLInputElement && el.classList.contains('form-input-amount');
}

function normalizeFullWidthDigits(s) {
  return s.replace(/[\uFF10-\uFF19]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
}

function sanitizeDigits(el) {
  const old = el.value;
  const normalized = normalizeFullWidthDigits(old);
  const stripped = normalized.replace(/\D/g, '');
  if (old === stripped) return;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  el.value = stripped;
  const diff = old.length - stripped.length;
  const pos = Math.max(0, Math.min(stripped.length, start - diff));
  requestAnimationFrame(() => {
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* ignore */
    }
  });
}

function onFocusIn(e) {
  const el = e.target;
  if (!isAmountInput(el)) return;
  el.setAttribute('lang', 'en');
  el.setAttribute('spellcheck', 'false');
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('autocorrect', 'off');
}

/** 擋住組字插入（備援，與 keydown 229 並用） */
function onBeforeInput(e) {
  if (!isAmountInput(e.target)) return;
  const t = e.inputType || '';
  if (t === 'insertCompositionText' || t === 'insertFromComposition') {
    e.preventDefault();
  }
}

function onKeydown(ev) {
  if (!isAmountInput(ev.target)) return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ALLOWED_KEYS.has(ev.key)) return;

  // 阻擋 IME 組字鍵（含注音預覽）；一般 0–9 不會走 229
  if (ev.keyCode === 229 || ev.key === 'Process') {
    ev.preventDefault();
    return;
  }

  if (ev.isComposing) return;
  if (ev.key.length === 1 && /\d/.test(ev.key)) return;
  if (ev.key.length !== 1) return;
  ev.preventDefault();
}

function onInput(e) {
  if (!isAmountInput(e.target)) return;
  if (e.isComposing) return;
  sanitizeDigits(e.target);
}

function onCompositionEnd(e) {
  if (!isAmountInput(e.target)) return;
  const el = e.target;
  requestAnimationFrame(() => {
    sanitizeDigits(el);
    setTimeout(() => sanitizeDigits(el), 0);
  });
}

function onFocusOut(e) {
  if (!isAmountInput(e.target)) return;
  sanitizeDigits(e.target);
}

export function initAmountInputs() {
  const app = document.getElementById('app');
  if (!app) return;
  app.addEventListener('focusin', onFocusIn, true);
  app.addEventListener('beforeinput', onBeforeInput, true);
  app.addEventListener('keydown', onKeydown, true);
  app.addEventListener('input', onInput, true);
  app.addEventListener('compositionend', onCompositionEnd, true);
  app.addEventListener('focusout', onFocusOut, true);
}
