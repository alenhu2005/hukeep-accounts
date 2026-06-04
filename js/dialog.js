import { appState } from './state.js';

const OVERLAY_OUT_MS = 280;

function finishDialogClose(overlay) {
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.classList.remove('closing');
  if (overlay._closingT) {
    clearTimeout(overlay._closingT);
    overlay._closingT = null;
  }
}

function setPromptField(opts = null) {
  const wrap = document.getElementById('dlg-field-wrap');
  const input = document.getElementById('dlg-field-input');
  const label = document.getElementById('dlg-field-label');
  const hint = document.getElementById('dlg-field-hint');
  if (!wrap || !input) return;
  const enabled = !!opts;
  wrap.hidden = !enabled;
  input.value = enabled ? opts.value || '' : '';
  input.maxLength = Number.isFinite(opts?.maxLength) ? opts.maxLength : 80;
  input.placeholder = opts?.placeholder || '例如：輸入錯誤、重複記帳、改用另一筆';
  if (label) label.textContent = opts?.label || '撤回原因（可選）';
  if (hint) hint.textContent = opts?.hint || '留下原因後，之後查帳會更清楚。';
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
  if (fieldOpts) {
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
        const input = document.getElementById('dlg-field-input');
        const value = String(input?.value || '').trim();
        closeDialog();
        appState._dlgResolve?.({ confirmed: true, value });
      },
      opts,
    );
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
    okBtn.focus();
  });
}
