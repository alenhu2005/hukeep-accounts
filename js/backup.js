import { appState } from './state.js';
import { parseArr, toast } from './utils.js';

const TZ = 'Asia/Taipei';

function csvEscape(s) {
  const t = String(s ?? '');
  if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

function fmtMoney(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  const v = Math.round(Number(n));
  return v.toLocaleString('zh-TW');
}

/** 行程 id → 名稱（以最後一筆 add 為準） */
function buildTripNameMap(rows) {
  const m = {};
  for (const r of rows) {
    if (r.type === 'trip' && r.action === 'add' && r.id && r.name) {
      m[r.id] = r.name;
    }
  }
  return m;
}

function tripName(tripNames, tripId) {
  if (!tripId) return '（未知行程）';
  return tripNames[tripId] || `行程 ${String(tripId).slice(0, 8)}…`;
}

function splitModeHuman(r) {
  if (r.splitMode === '兩人付') {
    const hu = parseFloat(r.paidHu) || 0;
    const zhan = parseFloat(r.paidZhan) || 0;
    return `胡出 NT$${fmtMoney(hu)}、詹出 NT$${fmtMoney(zhan)}`;
  }
  const map = { 均分: '各付一半', 只有胡: '胡全額', 只有詹: '詹全額' };
  return map[r.splitMode] || r.splitMode || '';
}

const ACTION_LABEL = {
  add: '新增',
  void: '撤回',
  edit: '編輯',
  delete: '刪除',
  close: '結束',
  reopen: '重新開啟',
  remove: '移除成員',
};

const TYPE_LABEL = {
  daily: '日常消費',
  settlement: '還款',
  trip: '行程',
  tripMember: '行程成員',
  tripExpense: '出遊消費',
  tripSettlement: '出遊還款結清',
};

/**
 * 單列人話摘要。forCsv=true 時不併入備註（備註獨立欄）。
 */
function humanSummaryForRow(r, tripNames, opts = {}) {
  const forCsv = opts.forCsv === true;
  const act = ACTION_LABEL[r.action] || r.action;
  const tname = tripName(tripNames, r.tripId);

  if (r.type === 'daily' && r.action === 'add') {
    const amt = fmtMoney(r.amount);
    const sm = splitModeHuman(r);
    const cat = r.category ? ` · ${r.category}` : '';
    const nb = !forCsv && r.note ? ` · 備註：${r.note}` : '';
    const itemLabel = r.item || '（無項目）';
    return `「${itemLabel}」NT$${amt} · ${r.paidBy}付 · ${sm}${cat}${nb}`;
  }

  if (r.type === 'settlement' && r.action === 'add') {
    const amt = fmtMoney(r.amount);
    return `${r.paidBy} 還款 NT$${amt}（清帳）`;
  }

  if (r.type === 'daily' && r.action === 'void') {
    return `將一筆日常／還款紀錄標記為撤回（紀錄 id：${r.id}）`;
  }

  if (r.type === 'daily' && r.action === 'edit') {
    return `編輯紀錄（id：${r.id}）的日期、備註或分類`;
  }

  if (r.type === 'daily' && r.action === 'delete') {
    return `永久刪除紀錄（id：${r.id}）`;
  }

  if (r.type === 'trip' && r.action === 'add') {
    const mem = parseArr(r.members);
    return `建立行程「${r.name}」· 成員：${mem.length ? mem.join('、') : '（無）'}`;
  }

  if (r.type === 'trip' && r.action === 'delete') {
    return `刪除行程「${tripName(tripNames, r.id)}」`;
  }

  if (r.type === 'trip' && r.action === 'close') {
    return `結束行程「${tripName(tripNames, r.id)}」`;
  }

  if (r.type === 'trip' && r.action === 'reopen') {
    return `重新開啟行程「${tripName(tripNames, r.id)}」`;
  }

  if (r.type === 'tripMember' && r.action === 'add') {
    return `「${tname}」加入成員「${r.memberName}」`;
  }

  if (r.type === 'tripMember' && r.action === 'remove') {
    return `「${tname}」移除成員「${r.memberName}」`;
  }

  if (r.type === 'tripExpense' && r.action === 'add') {
    const amt = fmtMoney(r.amount);
    const among = parseArr(r.splitAmong);
    const splitLabel = among.length ? among.join('、') : '—';
    let pay = `${r.paidBy}付`;
    if (r.payers && Array.isArray(r.payers)) {
      pay = r.payers.map(p => `${p.name} NT$${fmtMoney(p.amount)}`).join(' ＋ ');
    }
    const cat = r.category ? ` · ${r.category}` : '';
    const nb = !forCsv && r.note ? ` · 備註：${r.note}` : '';
    const itemLabel = r.item || '（無項目）';
    const cnyVal = parseFloat(r.amountCny);
    const cnyPart =
      Number.isFinite(cnyVal) && cnyVal > 0 ? ` · ¥${String(cnyVal.toFixed(2).replace(/\.?0+$/, ''))}` : '';
    const fxVal = parseFloat(r.fxFeeNtd);
    const fxPart =
      Number.isFinite(fxVal) && fxVal > 0 ? ` · 匯差手續 NT$${fmtMoney(fxVal)}` : '';
    return `「${tname}」·「${itemLabel}」NT$${amt}${cnyPart}${fxPart} · ${pay} · 分攤：${splitLabel}${cat}${nb}`;
  }

  if (r.type === 'tripExpense' && r.action === 'void') {
    return `「${tname}」撤回一筆出遊消費（紀錄 id：${r.id}）`;
  }

  if (r.type === 'tripExpense' && r.action === 'edit') {
    return `「${tname}」編輯出遊消費（id：${r.id}）`;
  }

  if (r.type === 'tripExpense' && r.action === 'delete') {
    return `「${tname}」刪除出遊消費（id：${r.id}）`;
  }

  if (r.type === 'tripSettlement' && r.action === 'add') {
    const amt = fmtMoney(r.amount);
    return `「${tname}」${r.from} 付給 ${r.to} NT$${amt}（結清）`;
  }

  return `${TYPE_LABEL[r.type] || r.type} · ${act}（id：${r.id || '—'}）`;
}

function rowAmountForDisplay(r) {
  if (r.action !== 'add') return '';
  if (r.type === 'daily' || r.type === 'settlement' || r.type === 'tripExpense' || r.type === 'tripSettlement') {
    const a = r.amount;
    if (a == null || a === '') return '';
    return fmtMoney(a);
  }
  return '';
}

function rowDateForSort(r) {
  return (r.date || '').slice(0, 10) || '9999-12-31';
}

/** 可讀版 CSV：中文欄位、一列一筆事件 */
export function allRowsToHumanCSV() {
  const rows = appState.allRows;
  const tripNames = buildTripNameMap(rows);
  const headers = ['日期', '類型', '動作', '摘要', '金額_NT', '備註', '紀錄id'];
  const lines = [headers.join(',')];

  const sorted = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const d = rowDateForSort(a.r).localeCompare(rowDateForSort(b.r));
      return d !== 0 ? d : a.i - b.i;
    });

  for (const { r } of sorted) {
    const summary = humanSummaryForRow(r, tripNames, { forCsv: true });
    const typeLabel = TYPE_LABEL[r.type] || r.type;
    const actionLabel = ACTION_LABEL[r.action] || r.action;
    const noteCol =
      r.action === 'add' && (r.type === 'daily' || r.type === 'tripExpense') ? (r.note || '').trim() : '';
    const dateStr = (r.date || '').slice(0, 10) || '';
    const amt = rowAmountForDisplay(r);
    const vals = [dateStr, typeLabel, actionLabel, summary, amt, noteCol, r.id || ''];
    lines.push(vals.map(csvEscape).join(','));
  }

  return '\uFEFF' + lines.join('\n');
}

/** 原始技術用 CSV（與舊版相容，供試算表或還原用） */
export function allRowsToTechnicalCSV() {
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
    'settlementFrom',
    'settlementTo',
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
      r.from ?? '',
      r.to ?? '',
    ];
    lines.push(vals.map(csvEscape).join(','));
  }
  return '\uFEFF' + lines.join('\n');
}

export function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 分段、易讀純文字備份 */
export function allRowsToBackupText() {
  const rows = appState.allRows;
  const tripNames = buildTripNameMap(rows);
  const now = new Date().toLocaleString('zh-TW', {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const dailyLike = rows.filter(r => r.type === 'daily' || r.type === 'settlement');
  const tripOnly = rows.filter(r => r.type === 'trip');
  const tripExp = rows.filter(r => r.type === 'tripExpense');
  const tripSet = rows.filter(r => r.type === 'tripSettlement');
  const tripMem = rows.filter(r => r.type === 'tripMember');

  const head = [
    '╔════════════════════════════════════════════════════════════╗',
    '║  記帳本 · 可讀備份（純文字）                              ║',
    '╚════════════════════════════════════════════════════════════╝',
    '',
    `匯出時間（台北）：${now}`,
    `事件總筆數：${rows.length}（日常／還款相關 ${dailyLike.length} · 行程 ${tripOnly.length} · 出遊消費 ${tripExp.length} · 出遊結清 ${tripSet.length} · 成員異動 ${tripMem.length}）`,
    '',
    '以下依「日期」排序；同一日多筆時維持原本順序。',
    '',
    '────────────────────────────────────────────────────────────',
  ];

  const sorted = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const d = rowDateForSort(a.r).localeCompare(rowDateForSort(b.r));
      return d !== 0 ? d : a.i - b.i;
    });

  const body = sorted.map(({ r }, idx) => {
    const dateStr = (r.date || '（無日期）').slice(0, 10);
    const typeLabel = TYPE_LABEL[r.type] || r.type;
    const actionLabel = ACTION_LABEL[r.action] || r.action;
    const line = humanSummaryForRow(r, tripNames);
    const amt = rowAmountForDisplay(r);
    const amtPart = amt ? `　金額：NT$ ${amt}` : '';
    return `${idx + 1}. ${dateStr}　【${typeLabel}｜${actionLabel}】${amtPart}\n   ${line}`;
  });

  const foot = [
    '',
    '────────────────────────────────────────────────────────────',
    '※ 本檔為人眼閱讀用；若需還原試算表或進階處理，請使用「原始格式 CSV」。',
    '',
  ];

  return head.join('\n') + '\n' + body.join('\n\n') + '\n' + foot.join('\n');
}

export function exportBackupCSV() {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  downloadTextFile(`記帳備份_可讀版_${d}.csv`, allRowsToHumanCSV(), 'text/csv;charset=utf-8');
  toast('已下載可讀版 CSV');
}

export function exportTechnicalCSV() {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  downloadTextFile(`記帳備份_原始格式_${d}.csv`, allRowsToTechnicalCSV(), 'text/csv;charset=utf-8');
  toast('已下載原始格式 CSV');
}

export async function copyBackupText() {
  const text = allRowsToBackupText();
  try {
    await navigator.clipboard.writeText(text);
    toast('已複製可讀文字備份');
  } catch {
    toast('無法複製，請改用下載 CSV');
  }
}
