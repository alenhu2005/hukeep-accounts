import { appState } from './state.js';
import { toast } from './utils.js';

function csvEscape(s) {
  const t = String(s ?? '');
  if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

export function allRowsToCSV() {
  const headers = [
    'type',
    'action',
    'id',
    'date',
    'amount',
    'item',
    'paidBy',
    'splitMode',
    'note',
    'tripId',
    'name',
    'members',
    'paidHu',
    'paidZhan',
    'category',
    'splitAmong',
    'payers_json',
    'memberName',
  ];
  const lines = [headers.join(',')];
  for (const r of appState.allRows) {
    let payersJson = '';
    if (r.payers != null) {
      payersJson = typeof r.payers === 'string' ? r.payers : JSON.stringify(r.payers);
    }
    const splitAmong = typeof r.splitAmong === 'string' ? r.splitAmong : JSON.stringify(r.splitAmong || []);
    const members = typeof r.members === 'string' ? r.members : JSON.stringify(r.members || []);
    const vals = [
      r.type,
      r.action,
      r.id,
      r.date ?? '',
      r.amount ?? '',
      r.item ?? '',
      r.paidBy ?? '',
      r.splitMode ?? '',
      r.note ?? '',
      r.tripId ?? '',
      r.name ?? '',
      members,
      r.paidHu ?? '',
      r.paidZhan ?? '',
      r.category ?? '',
      splitAmong,
      payersJson,
      r.memberName ?? '',
    ];
    lines.push(vals.map(csvEscape).join(','));
  }
  return '\uFEFF' + lines.join('\n');
}

function rowToTextBlock(r) {
  if (!r) return '';
  const lines = [`── ${r.type} / ${r.action} ── id: ${r.id}`];
  const keys = [
    'date',
    'amount',
    'item',
    'paidBy',
    'splitMode',
    'note',
    'tripId',
    'name',
    'paidHu',
    'paidZhan',
    'category',
    'memberName',
  ];
  for (const k of keys) {
    if (r[k] != null && r[k] !== '') lines.push(`  ${k}: ${r[k]}`);
  }
  if (r.members) {
    lines.push(`  members: ${typeof r.members === 'string' ? r.members : JSON.stringify(r.members)}`);
  }
  if (r.splitAmong) {
    lines.push(
      `  splitAmong: ${typeof r.splitAmong === 'string' ? r.splitAmong : JSON.stringify(r.splitAmong)}`,
    );
  }
  if (r.payers) {
    lines.push(`  payers: ${typeof r.payers === 'string' ? r.payers : JSON.stringify(r.payers)}`);
  }
  return lines.join('\n');
}

export function allRowsToBackupText() {
  const head = [
    '記帳本資料備份',
    '匯出時間：' + new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
    '事件筆數：' + appState.allRows.length,
    '',
  ];
  return head.join('\n') + appState.allRows.map(rowToTextBlock).join('\n\n');
}

export function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportBackupCSV() {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  downloadTextFile(`記帳備份_${d}.csv`, allRowsToCSV(), 'text/csv;charset=utf-8');
  toast('已下載 CSV');
}

export async function copyBackupText() {
  const text = allRowsToBackupText();
  try {
    await navigator.clipboard.writeText(text);
    toast('已複製到剪貼簿');
  } catch {
    toast('無法複製，請改用匯出 CSV');
  }
}
