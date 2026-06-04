import { appState } from './state.js';
import { animateOverlayIn } from './motion.js';

const OVERLAY_OUT_MS = 280;
const DEFAULT_VOID_REASONS = ['輸入錯誤', '重複記帳', '改用另一筆', '其他'];

function finishDialogClose(overlay) {
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.classList.remove('closing');
  if (overlay._closingT) {
    clearTimeout(overlay._closingT);
    overlay._closingT = null;
  }
}

function setReasonChoice(value, { focusOther = false } = {}) {
  const wrap = document.getElementById('dlg-field-wrap');
  const options = document.getElementById('dlg-reason-options');
  const input = document.getElementById('dlg-field-input');
  if (!wrap || !options || !input) return;
  const reason = String(value || '').trim();
  wrap.dataset.reasonChoice = reason;
  options.querySelectorAll('.dialog-reason-option').forEach(btn => {
    const selected = btn.dataset.reason === reason;
    btn.classList.toggle('is-selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  const isOther = reason === '其他';
  input.hidden = !isOther;
  input.value = isOther ? input.value : '';
  if (isOther && focusOther) {
    window.setTimeout(() => input.focus(), 40);
  }
}

function setupReasonOptions(opts = {}) {
  const wrap = document.getElementById('dlg-field-wrap');
  const options = document.getElementById('dlg-reason-options');
  const input = document.getElementById('dlg-field-input');
  if (!wrap || !options || !input) return;
  const reasons = Array.isArray(opts.reasons) && opts.reasons.length
    ? opts.reasons
    : DEFAULT_VOID_REASONS;
  options.innerHTML = '';
  options.hidden = false;
  reasons.forEach(reason => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dialog-reason-option';
    btn.textContent = reason;
    btn.dataset.reason = reason;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => setReasonChoice(reason, { focusOther: true }));
    options.appendChild(btn);
  });
  const preset = String(opts.value || '').trim();
  if (preset && reasons.includes(preset)) {
    setReasonChoice(preset);
  } else if (preset) {
    input.value = preset;
    setReasonChoice('其他');
  } else {
    setReasonChoice('');
  }
}

function setPromptField(opts = null) {
  const wrap = document.getElementById('dlg-field-wrap');
  const input = document.getElementById('dlg-field-input');
  const label = document.getElementById('dlg-field-label');
  const hint = document.getElementById('dlg-field-hint');
  const options = document.getElementById('dlg-reason-options');
  if (!wrap || !input) return;
  const enabled = !!opts;
  delete wrap.dataset.promptMode;
  delete wrap.dataset.reasonChoice;
  wrap.hidden = !enabled;
  if (options) {
    options.hidden = true;
    options.innerHTML = '';
  }
  input.value = enabled ? opts.value || '' : '';
  input.hidden = false;
  input.maxLength = Number.isFinite(opts?.maxLength) ? opts.maxLength : 80;
  input.placeholder = opts?.placeholder || '例如：輸入錯誤、重複記帳、改用另一筆';
  if (label) label.textContent = opts?.label || '撤回原因（可選）';
  if (hint) hint.textContent = opts?.hint || '留下原因後，之後查帳會更清楚。';
  if (enabled && opts.mode === 'voidReason') {
    wrap.dataset.promptMode = 'voidReason';
    input.placeholder = opts.placeholder || '請簡短補充原因';
    if (label) label.textContent = opts.label || '選擇撤回原因';
    if (hint) hint.textContent = opts.hint || '選「其他」才需要補充文字；不選也可以直接撤回。';
    setupReasonOptions(opts);
  }
}

function getPromptFieldValue() {
  const wrap = document.getElementById('dlg-field-wrap');
  const input = document.getElementById('dlg-field-input');
  if (wrap?.dataset.promptMode === 'voidReason') {
    const choice = String(wrap.dataset.reasonChoice || '').trim();
    if (choice === '其他') return String(input?.value || '').trim();
    return choice;
  }
  return String(input?.value || '').trim();
}

function openDialog(title, desc, okHandler, fieldOpts = null) {
  const titleEl = document.getElementById('dlg-title');
  const descEl = document.getElementById('dlg-desc');
  const okBtn = document.getElementById('dlg-ok');
  const ov = document.getElementById('dialog-overlay');
  titleEl.textContent = title;
  descEl.textContent = desc;
  setPromptField(fieldOpts);
  okBtn.onclick = okHandler;
  ov.classList.remove('closing');
  if (ov._closingT) {
    clearTimeout(ov._closingT);
    ov._closingT = null;
  }
  ov.classList.add('open');
  animateOverlayIn(ov, '.dialog', '.dialog h3, .dialog p, .dialog .form-group, .dialog .btn');
  if (fieldOpts && fieldOpts.mode !== 'voidReason') {
    window.setTimeout(() => document.getElementById('dlg-field-input')?.focus(), 80);
  }
}

export function showConfirm(title, desc) {
  return new Promise(resolve => {
    appState._dlgResolve = result => {
      appState._dlgResolve = null;
      resolve(result);
    };
    openDialog(title, desc, () => {
      closeDialog();
      appState._dlgResolve?.(true);
    });
  });
}

export function showTextPrompt(title, desc, opts = {}) {
  return new Promise(resolve => {
    appState._dlgResolve = result => {
      appState._dlgResolve = null;
      resolve(result);
    };
    openDialog(
      title,
      desc,
      () => {
        const value = getPromptFieldValue();
        closeDialog();
        appState._dlgResolve?.({ confirmed: true, value });
      },
      opts,
    );
  });
}

export function showVoidReasonPrompt(title, desc, opts = {}) {
  return showTextPrompt(title, desc, {
    ...opts,
    mode: 'voidReason',
    label: opts.label || '選擇撤回原因',
    hint: opts.hint || '選「其他」才需要補充文字；不選也可以直接撤回。',
    maxLength: Number.isFinite(opts.maxLength) ? opts.maxLength : 80,
  });
}

export function cancelDialog() {
  closeDialog();
  if (appState._dlgResolve) {
    appState._dlgResolve(false);
    appState._dlgResolve = null;
  }
}

export function closeDialog() {
  const overlay = document.getElementById('dialog-overlay');
  if (!overlay || !overlay.classList.contains('open') || overlay.classList.contains('closing')) return;
  if (overlay._closingT) clearTimeout(overlay._closingT);
  overlay.classList.add('closing');
  overlay._closingT = setTimeout(() => {
    finishDialogClose(overlay);
  }, OVERLAY_OUT_MS);
}

/** 單鍵提示（會蓋在畫面上直到使用者按下知道了） */
export function showAlert(title, desc) {
  return new Promise(resolve => {
    const overlay = document.getElementById('alert-overlay');
    const okBtn = document.getElementById('alert-dlg-ok');
    document.getElementById('alert-dlg-title').textContent = title;
    document.getElementById('alert-dlg-desc').textContent = desc;
    const done = () => {
      if (!overlay.classList.contains('open') || overlay.classList.contains('closing')) return;
      if (overlay._closingT) clearTimeout(overlay._closingT);
      overlay.classList.add('closing');
      overlay._closingT = setTimeout(() => {
        finishDialogClose(overlay);
        overlay.onclick = null;
        okBtn.onclick = null;
        resolve();
      }, OVERLAY_OUT_MS);
    };
    overlay.onclick = e => {
      if (e.target === overlay) done();
    };
    okBtn.onclick = () => done();
    overlay.classList.remove('closing');
    if (overlay._closingT) {
      clearTimeout(overlay._closingT);
      overlay._closingT = null;
    }
    overlay.classList.add('open');
    animateOverlayIn(overlay, '.dialog', '.dialog h3, .dialog p, .dialog .btn');
    okBtn.focus();
  });
}
