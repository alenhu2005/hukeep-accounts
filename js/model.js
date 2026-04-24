import { normalizeDate, normalizeTimeOnly } from './time.js';

/**
 * GAS Web App 回傳 `JSON.parse` 後為陣列；每筆應有 `type`，再經 `normalizeRow` 補預設值。
 *
 * @typedef {Object} DailyLedgerRow
 * @property {'daily'} type
 * @property {string} [id]
 * @property {'add'|'edit'|'delete'|'void'} [action]
 * @property {string} [item]
 * @property {string} [paidBy] — 例如「胡」「詹」
 * @property {string} [splitMode] — 「均分」「只有胡」「只有詹」「兩人付」
 * @property {string|number} [amount]
 * @property {string} [paidHu]
 * @property {string} [paidZhan]
 * @property {string} [date] — YYYY-MM-DD
 * @property {string} [note]
 * @property {string} [category]
 * @property {boolean} [_voided] — 由 data 層標記
 */

/**
 * @typedef {Object} SettlementLedgerRow
 * @property {'settlement'} type
 * @property {string} [id]
 * @property {'add'} [action]
 * @property {string} [paidBy]
 * @property {string|number} [amount]
 * @property {string} [date]
 */

/**
 * @typedef {Object} TripLedgerRow
 * @property {'trip'} type
 * @property {string} [id]
 * @property {'add'|'delete'|'close'|'reopen'|'setColor'|'enableCnyMode'} [action]
 * @property {string} [name]
 * @property {string} [item]
 * @property {string} [members] — JSON 字串或陣列字串化
 * @property {string} [createdAt]
 * @property {string} [date]
 * @property {string} [splitMode] — 遷移用，可能含 members
 */

/**
 * @typedef {Object} TripMemberLedgerRow
 * @property {'tripMember'} type
 * @property {string} [tripId]
 * @property {'add'|'remove'} [action]
 * @property {string} [memberName]
 */

/**
 * @typedef {Object} TripExpenseLedgerRow
 * @property {'tripExpense'} type
 * @property {string} [id]
 * @property {'add'|'edit'|'delete'|'void'} [action]
 * @property {string} [tripId]
 * @property {string|number} [amount]
 * @property {string} [paidBy]
 * @property {string} [splitAmong] — JSON 陣列字串
 * @property {string} [splitMode] — 可能內嵌 `tripId::splitAmong`
 * @property {string} [date]
 * @property {string} [note]
 * @property {string} [category]
 * @property {string|number} [amountCny] — 選填；輔助紀錄人民幣，分帳仍以 amount（新台幣）為準
 * @property {string|number} [fxFeeNtd] — 選填；舊資料／表單補登之匯差手續（新台幣），併入分攤；編輯若變更 amount 則會清除
 * @property {Array<{name:string,amount:number|string}>|string|null} [payers]
 * @property {boolean} [_voided]
 */

/**
 * @typedef {DailyLedgerRow|SettlementLedgerRow|TripLedgerRow|TripMemberLedgerRow|TripExpenseLedgerRow} LedgerRow
 */

export const TRIP_TYPES = new Set(['trip', 'tripMember', 'tripExpense', 'tripSettlement', 'avatar', 'memberProfile']);
export const DAILY_TYPES = new Set(['daily', 'settlement']);

export function isDailyRow(r) {
  return r && DAILY_TYPES.has(r.type);
}
export function isTripRow(r) {
  return r && TRIP_TYPES.has(r.type);
}

/**
 * 將試算表／GAS 單列正規化為前端慣用欄位（會就地修改 `r`）。
 * @param {LedgerRow} r
 * @returns {LedgerRow}
 */
export function normalizeRow(r) {
  if (!r || !r.type) return r;
  if (r.type === 'daily') {
    r.action = r.action ?? 'add';
    r.item = r.item ?? '';
    r.paidBy = r.paidBy ?? '';
    r.splitMode = r.splitMode ?? '均分';
    r.date = normalizeDate(r.date);
    if ('_clientPostedAt' in r) r._clientPostedAt = normalizeTimeOnly(r._clientPostedAt);
    r.amount = r.amount ?? 0;
    r.note = r.note || '';
    r.voided = r.voided === true || String(r.voided || '').trim().toLowerCase() === 'true';
    if (r.action === 'edit') {
      if ('category' in r) {
        const v = r.category;
        if (v == null || (typeof v === 'string' && v.trim() === '')) {
          delete r.category;
        } else {
          r.category = String(v).trim();
        }
      } else {
        delete r.category;
      }
    } else {
      r.category = typeof r.category === 'string' ? r.category.trim() : '';
    }
  } else if (r.type === 'settlement') {
    r.action = r.action ?? 'add';
    r.item = '還款';
    r.paidBy = r.paidBy ?? '';
    r.date = normalizeDate(r.date);
    if ('_clientPostedAt' in r) r._clientPostedAt = normalizeTimeOnly(r._clientPostedAt);
    r.amount = r.amount ?? 0;
    r.voided = r.voided === true || String(r.voided || '').trim().toLowerCase() === 'true';
  } else if (r.type === 'trip') {
    r.action = r.action ?? 'add';
    if ('closed' in r) r.closed = r.closed === true || String(r.closed).trim().toLowerCase() === 'true';
    else r.closed = false;
    if ('cnyMode' in r) r.cnyMode = r.cnyMode === true || String(r.cnyMode).trim().toLowerCase() === 'true';
    else r.cnyMode = false;
    if (typeof r.colorId === 'string') r.colorId = r.colorId.trim();
    else r.colorId = '';
    if (r.action === 'enableCnyMode') {
      r.id = String(r.id || '').trim();
    } else {
      r.name = r.name ?? (r.item || '');
      r.createdAt = r.createdAt ?? (r.date || '');
      r.members = r.members ?? (r.splitMode || '[]');
    }
  } else if (r.type === 'tripMember') {
    r.tripId = r.tripId ?? (r.id || '');
    r.memberName = r.memberName ?? (r.date || '');
  } else if (r.type === 'tripExpense') {
    r.action = r.action ?? 'add';
    if (r.tripId == null || r.splitAmong == null) {
      const sm = r.splitMode || '';
      const sep = sm.indexOf('::');
      r.tripId = r.tripId ?? (sep >= 0 ? sm.slice(0, sep) : '');
      r.splitAmong = r.splitAmong ?? (sep >= 0 ? sm.slice(sep + 2) : '[]');
    }
    r.item = r.item ?? '';
    r.paidBy = r.paidBy ?? '';
    r.amount = r.amount ?? 0;
    r.date = normalizeDate(r.date);
    if ('_clientPostedAt' in r) r._clientPostedAt = normalizeTimeOnly(r._clientPostedAt);
    r.note = r.note || '';
    r.voided = r.voided === true || String(r.voided || '').trim().toLowerCase() === 'true';
    if (r.action === 'edit') {
      if ('category' in r) {
        const v = r.category;
        if (v == null || (typeof v === 'string' && v.trim() === '')) {
          delete r.category;
        } else {
          r.category = String(v).trim();
        }
      } else {
        delete r.category;
      }
    } else {
      r.category = typeof r.category === 'string' ? r.category.trim() : '';
    }
    if (typeof r.payers === 'string') {
      try {
        r.payers = JSON.parse(r.payers);
      } catch {
        r.payers = null;
      }
    }
    if (typeof r.splitDetails === 'string') {
      try {
        r.splitDetails = JSON.parse(r.splitDetails);
      } catch {
        r.splitDetails = null;
      }
    }
    if (r.amountCny != null && String(r.amountCny).trim() !== '') {
      const cny = parseFloat(r.amountCny);
      if (Number.isFinite(cny) && cny > 0) r.amountCny = cny;
      else delete r.amountCny;
    } else {
      delete r.amountCny;
    }
    if (r.fxFeeNtd != null && String(r.fxFeeNtd).trim() !== '') {
      const fx = parseFloat(r.fxFeeNtd);
      if (Number.isFinite(fx) && fx > 0) r.fxFeeNtd = fx;
      else delete r.fxFeeNtd;
    } else {
      delete r.fxFeeNtd;
    }
  } else if (r.type === 'tripSettlement') {
    r.action = r.action ?? 'add';
    r.tripId = r.tripId ?? '';
    r.from = r.from ?? '';
    r.to = r.to ?? '';
    r.amount = r.amount ?? 0;
    r.date = normalizeDate(r.date);
    if ('_clientPostedAt' in r) r._clientPostedAt = normalizeTimeOnly(r._clientPostedAt);
    r.voided = r.voided === true || String(r.voided || '').trim().toLowerCase() === 'true';
  } else if (r.type === 'memberProfile') {
    r.action = r.action ?? '';
    if (typeof r.memberName === 'string') r.memberName = r.memberName.trim();
    if (typeof r.newName === 'string') r.newName = r.newName.trim();
    if (typeof r.colorId === 'string') r.colorId = r.colorId.trim();
    if ('deleted' in r) {
      r.deleted = r.deleted === true || String(r.deleted).trim().toLowerCase() === 'true';
    } else {
      r.deleted = false;
    }
  } else if (r.type === 'avatar') {
    if (typeof r.memberName === 'string') r.memberName = r.memberName.trim();
    if (typeof r.avatarUrl === 'string') r.avatarUrl = r.avatarUrl.trim();
    if (typeof r.avatarScope === 'string') r.avatarScope = r.avatarScope.trim();
    else r.avatarScope = 'auto';
  }
  return r;
}
