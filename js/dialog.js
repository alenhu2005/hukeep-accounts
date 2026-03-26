import { appState } from './state.js';

export function showConfirm(title, desc) {
  return new Promise(resolve => {
    appState._dlgResolve = resolve;
    document.getElementById('dlg-title').textContent = title;
    document.getElementById('dlg-desc').textContent = desc;
    document.getElementById('dlg-ok').onclick = () => {
      closeDialog();
      resolve(true);
    };
    document.getElementById('dialog-overlay').classList.add('open');
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
  document.getElementById('dialog-overlay').classList.remove('open');
}

/** 單鍵提示（會蓋在畫面上直到使用者按下知道了） */
export function showAlert(title, desc) {
  return new Promise(resolve => {
    const overlay = document.getElementById('alert-overlay');
    const okBtn = document.getElementById('alert-dlg-ok');
    document.getElementById('alert-dlg-title').textContent = title;
    document.getElementById('alert-dlg-desc').textContent = desc;
    const close = () => {
      overlay.classList.remove('open');
      overlay.onclick = null;
      okBtn.onclick = null;
      resolve();
    };
    overlay.onclick = e => {
      if (e.target === overlay) close();
    };
    okBtn.onclick = () => close();
    overlay.classList.add('open');
    okBtn.focus();
  });
}
