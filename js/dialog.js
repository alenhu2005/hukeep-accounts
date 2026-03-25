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
