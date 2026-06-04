import { USER_A, USER_B } from './config.js';
import { appState } from './state.js';
import { getDailyRecords, getDailyRecordsFromRows } from './data.js';
import { computeBalance } from './finance.js';
import { esc, parseArr, toast } from './utils.js';

const TZ = 'Asia/Taipei';

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

function parseListField(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  return parseArr(value).map(v => String(v || '').trim()).filter(Boolean);
}

function parseObjectListField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    const reason = r.voidReason ? `；原因：${r.voidReason}` : '';
    return `將一筆日常／還款紀錄標記為撤回（紀錄 id：${r.id}${reason}）`;
  }

  if (r.type === 'daily' && r.action === 'edit') {
    return `編輯紀錄（id：${r.id}）的日期、備註或分類`;
  }

  if (r.type === 'daily' && r.action === 'delete') {
    return `永久刪除紀錄（id：${r.id}）`;
  }

  if (r.type === 'trip' && r.action === 'add') {
    const mem = parseListField(r.members);
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

  if (r.type === 'trip' && r.action === 'enableCnyMode') {
    return `行程「${tripName(tripNames, r.id)}」開啟人民幣模式`;
  }

  if (r.type === 'tripMember' && r.action === 'add') {
    return `「${tname}」加入成員「${r.memberName}」`;
  }

  if (r.type === 'tripMember' && r.action === 'remove') {
    return `「${tname}」移除成員「${r.memberName}」`;
  }

  if (r.type === 'tripExpense' && r.action === 'add') {
    const amt = fmtMoney(r.amount);
    const among = parseListField(r.splitAmong);
    const splitLabel = among.length ? among.join('、') : '—';
    const payers = parseObjectListField(r.payers);
    let pay = `${r.paidBy}付`;
    if (payers.length > 0) {
      pay = payers.map(p => `${p.name} NT$${fmtMoney(p.amount)}`).join(' ＋ ');
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
    const reason = r.voidReason ? `；原因：${r.voidReason}` : '';
    return `「${tname}」撤回一筆出遊消費（紀錄 id：${r.id}${reason}）`;
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

function rowAnyAmountForDisplay(r) {
  if (r.amount == null || r.amount === '') return '';
  return fmtMoney(r.amount);
}

function rowCnyForDisplay(r) {
  const cny = parseFloat(r.amountCny);
  if (!Number.isFinite(cny) || cny <= 0) return '';
  return String(cny.toFixed(2).replace(/\.?0+$/, ''));
}

function rowFxFeeForDisplay(r) {
  const fx = parseFloat(r.fxFeeNtd);
  if (!Number.isFinite(fx) || fx <= 0) return '';
  return fmtMoney(fx);
}

function rowBookLabel(r) {
  if (r.type === 'daily' || r.type === 'settlement') return '日常';
  if (r.type === 'trip' || r.type === 'tripMember' || r.type === 'tripExpense' || r.type === 'tripSettlement') return '出遊';
  return '其他';
}

function rowTripLabel(r, tripNames) {
  if (r.type === 'trip') return r.name || tripName(tripNames, r.id);
  if (r.tripId) return tripName(tripNames, r.tripId);
  return '';
}

function rowStatusLabel(r) {
  if (r.action === 'void') return '撤回事件';
  if (r.action === 'delete') return '刪除事件';
  if (r.action === 'edit') return '編輯事件';
  if (r.action === 'close') return '結束事件';
  if (r.action === 'reopen') return '重開事件';
  const voided = r.voided === true || String(r.voided || '').trim().toLowerCase() === 'true';
  if (voided) return '已撤回';
  if (r.type === 'trip' && (r.closed === true || String(r.closed || '').trim().toLowerCase() === 'true')) return '已結束';
  return '有效';
}

function rowSubjectLabel(r) {
  if (r.type === 'daily') return r.item || '日常消費';
  if (r.type === 'settlement') return '日常還款';
  if (r.type === 'trip') return r.name || '行程';
  if (r.type === 'tripMember') return r.memberName || '行程成員';
  if (r.type === 'tripExpense') return r.item || '出遊消費';
  if (r.type === 'tripSettlement') return [r.from, r.to].filter(Boolean).join(' → ') || '出遊還款';
  return r.item || r.name || r.id || '';
}

function rowPaymentLabel(r) {
  if (r.type === 'daily') return r.paidBy ? `${r.paidBy}付款` : '';
  if (r.type === 'settlement') return r.paidBy ? `${r.paidBy}還款` : '';
  if (r.type === 'tripSettlement') return [r.from, r.to].filter(Boolean).join(' → ');
  if (r.type === 'tripExpense') {
    const payers = parseObjectListField(r.payers);
    if (payers.length > 0) {
      return payers
        .map(p => {
          const name = String(p?.name || '').trim();
          const amount = fmtMoney(p?.amount);
          return name && amount ? `${name} NT$${amount}` : name;
        })
        .filter(Boolean)
        .join(' ＋ ');
    }
    return r.paidBy ? `${r.paidBy}付款` : '';
  }
  return '';
}

function rowSplitLabel(r) {
  if (r.type === 'daily') return splitModeHuman(r);
  if (r.type === 'trip') {
    const members = parseListField(r.members);
    return members.join('、');
  }
  if (r.type === 'tripMember') return r.memberName || '';
  if (r.type === 'tripExpense') {
    const splitDetails = parseObjectListField(r.splitDetails)
      .map(item => {
        const name = String(item?.name || '').trim();
        const amount = fmtMoney(item?.amount);
        return name && amount ? `${name} NT$${amount}` : name;
      })
      .filter(Boolean);
    if (splitDetails.length > 0) return splitDetails.join('、');
    return parseListField(r.splitAmong).join('、');
  }
  return '';
}

function rowDateForSort(r) {
  return (r.date || '').slice(0, 10) || '9999-12-31';
}

export function buildOperationTimeline(rows = appState.allRows, limit = 12) {
  const source = Array.isArray(rows) ? rows : [];
  const tripNames = buildTripNameMap(source);
  return source
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const d = rowDateForSort(b.r).localeCompare(rowDateForSort(a.r));
      if (d !== 0) return d;
      return b.i - a.i;
    })
    .slice(0, Math.max(1, limit))
    .map(({ r }) => ({
      id: r.id || '',
      date: (r.date || '（無日期）').slice(0, 10),
      typeLabel: TYPE_LABEL[r.type] || r.type || '資料',
      actionLabel: ACTION_LABEL[r.action] || r.action || '更新',
      summary: humanSummaryForRow(r, tripNames),
    }));
}

export function operationTimelineToText(rows = appState.allRows, limit = 30) {
  const timeline = buildOperationTimeline(rows, limit);
  const head = ['最近操作紀錄', `匯出時間（台北）：${new Date().toLocaleString('zh-TW', { timeZone: TZ })}`, ''];
  const body = timeline.map((item, idx) => {
    return `${idx + 1}. ${item.date}　【${item.typeLabel}｜${item.actionLabel}】\n   ${item.summary}`;
  });
  return [...head, ...body].join('\n');
}

export function renderBackupOperationPanel() {
  const el = document.getElementById('backup-operation-panel');
  if (!el) return;
  const timeline = buildOperationTimeline(appState.allRows, 6);
  el.innerHTML = `
    <div class="backup-panel-head">
      <div>
        <div class="backup-panel-kicker">最近操作</div>
        <div class="backup-panel-title">目前資料快照</div>
      </div>
    </div>
    ${
      timeline.length
        ? `<div class="backup-operation-list">${timeline
            .map(
              item => `
                <div class="backup-operation-item">
                  <div class="backup-operation-meta">${esc(item.date)} · ${esc(item.typeLabel)} · ${esc(item.actionLabel)}</div>
                  <div class="backup-operation-summary">${esc(item.summary)}</div>
                </div>
              `,
            )
            .join('')}</div>`
        : '<div class="backup-health-empty">目前沒有可顯示的操作。</div>'
    }
  `;
}

/** 可讀版 CSV：中文欄位、一列一筆事件 */
export function allRowsToHumanCSV() {
  const rows = appState.allRows;
  const tripNames = buildTripNameMap(rows);
  const headers = [
    '日期',
    '帳本',
    '行程',
    '類型',
    '動作',
    '狀態',
    '項目/事件',
    '金額_NT',
    '人民幣',
    '匯差手續_NT',
    '收付',
    '分攤/成員',
    '分類',
    '備註',
    '撤回原因',
    '摘要',
    '紀錄id',
  ];
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
    const noteCol = (r.note || '').trim();
    const dateStr = (r.date || '').slice(0, 10) || '';
    const vals = [
      dateStr,
      rowBookLabel(r),
      rowTripLabel(r, tripNames),
      typeLabel,
      actionLabel,
      rowStatusLabel(r),
      rowSubjectLabel(r),
      rowAnyAmountForDisplay(r),
      rowCnyForDisplay(r),
      rowFxFeeForDisplay(r),
      rowPaymentLabel(r),
      rowSplitLabel(r),
      r.category || '',
      noteCol,
      (r.voidReason || '').trim(),
      summary,
      r.id || '',
    ];
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
    'voidReason',
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
      r.voidReason ?? '',
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

  const balanceInfo = describeDailyBalanceExact(computeBalance(getDailyRecordsFromRows(rows)));

  const head = [
    '╔════════════════════════════════════════════════════════════╗',
    '║  記帳本 · 可讀備份（純文字）                              ║',
    '╚════════════════════════════════════════════════════════════╝',
    '',
    `匯出時間（台北）：${now}`,
    balanceInfo.exact === 0
      ? '日常帳精確欠款：NT$ 0（帳目已清）'
      : `日常帳精確欠款：NT$ ${balanceInfo.exactText}（${balanceInfo.whoText}；進位還款 NT$ ${balanceInfo.ceilText}）`,
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

export async function copyOperationTimelineText() {
  try {
    await navigator.clipboard.writeText(operationTimelineToText(appState.allRows, 30));
    toast('已複製最近操作紀錄');
  } catch {
    toast('無法複製操作紀錄');
  }
}
