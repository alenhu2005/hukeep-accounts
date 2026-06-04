import { USER_A, USER_B } from '../config.js';
import { getDailyRecords } from '../data.js';
import { computeBalance } from '../finance.js';

function fmtExactAmount(n) {
  const abs = Math.abs(Number(n));
  if (!Number.isFinite(abs) || abs < 1e-9) return '0';
  return String(Number(abs.toFixed(6)));
}

/** @param {number} balance computeBalance 回傳值：正＝USER_B 欠 USER_A */
export function describeDailyBalanceExact(balance) {
  if (!Number.isFinite(balance) || Math.abs(balance) < 1e-9) {
    return {
      exact: 0,
      exactText: '0',
      whoText: '帳目已清',
      ceilText: '0',
    };
  }
  const exactText = fmtExactAmount(balance);
  const ceilAmt = Math.ceil(Math.abs(balance));
  if (balance > 0) {
    return {
      exact: balance,
      exactText,
      whoText: `${USER_B}欠${USER_A}`,
      ceilText: String(ceilAmt),
    };
  }
  return {
    exact: balance,
    exactText,
    whoText: `${USER_A}欠${USER_B}`,
    ceilText: String(ceilAmt),
  };
}

export function renderBackupBalancePanel() {
  const el = document.getElementById('backup-balance-debug');
  if (!el) return;

  const info = describeDailyBalanceExact(computeBalance(getDailyRecords()));
  if (info.exact === 0) {
    el.textContent = `日常帳精確欠款 NT$ 0（${info.whoText}）`;
    return;
  }

  el.textContent = `日常帳精確欠款 NT$ ${info.exactText}（${info.whoText} · 進位 ${info.ceilText}）`;
}
