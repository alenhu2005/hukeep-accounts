import { USER_A } from './config.js';

/**
 * Central mutable UI / session state (single object avoids circular import issues).
 * @property {'idle'|'syncing'|'synced'|'cache_only'|'error'} syncStatus
 * @property {number|null} lastSyncAt — 上次成功從伺服端拉取並套用後的時間戳（ms）
 */
export const appState = {
  allRows: [],
  /** 閒置 | 同步中 | 已與伺服端一致 | 僅快取（連線失敗）| 無資料且無法載入 */
  syncStatus: 'idle',
  lastSyncAt: null,

  currentPage: 'home',
  currentTripId: null,

  homePaidBy: USER_A,
  homeSplitMode: '均分',
  homeShowAll: false,
  /** 從其他分頁切換到「日常」時，結算金額是否做數字刷動 */
  animateHomeBalanceNext: false,
  /** 上次顯示在畫面上的結算金額絕對值（刷動動畫起點） */
  homeBalanceAbsShown: null,
  /** 記帳／撤回／還款後：日常結算由舊絕對值刷到新值（與切頁全頁動畫分開） */
  pendingHomeBalanceFromAbs: null,

  _dailyRecordsCache: [],
  _tripExpenseCache: [],

  analysisPeriod: 'month',
  /** 分析頁圓餅環上：分類 / 比例 / 金額（可各別關閉） */
  ...(() => {
    try {
      const raw = localStorage.getItem('ledger_pie_label_opts_v1');
      if (raw) {
        const o = JSON.parse(raw);
        return {
          pieLabelShowCategory: o.cat !== false,
          pieLabelShowPct: o.pct !== false,
          pieLabelShowAmount: o.amt !== false,
        };
      }
      if (localStorage.getItem('ledger_show_pie_labels_v1') === '0') {
        return { pieLabelShowCategory: false, pieLabelShowPct: false, pieLabelShowAmount: false };
      }
    } catch {
      /* fallthrough */
    }
    return { pieLabelShowCategory: false, pieLabelShowPct: false, pieLabelShowAmount: false };
  })(),

  newTripMembers: [],
  detailSplitAmong: [],
  detailSplitMode: 'equal',
  /** memberName -> amount (for custom split mode) */
  detailSplitCustom: {},
  /** memberName -> boolean (manually edited in custom split mode) */
  detailSplitTouched: {},
  /** whether total amount has been manually edited in custom split mode */
  detailSplitTotalTouched: false,
  /** custom split: total amount is derived from split sum (auto) */
  detailSplitTotalDerived: false,
  /** currently focused custom-split member name */
  detailSplitEditingMember: '',
  /** lock target in custom split: 'total' or member name */
  detailSplitLockedTarget: '',
  /** custom split: memberName that is currently auto-filled as residual (treated as "still unfilled") */
  detailSplitAutoFilledTarget: '',
  detailPaidBy: '',
  detailMultiPay: false,
  /** multi-pay UI: currently focused payer input ('total' or member name). */
  detailMultiPayEditingTarget: '',
  /** multi-pay UI: lock target in current custom distribution: 'total' or member name */
  detailMultiPayLockedTarget: '',
  /** multi-pay UI: whether total amount is manually entered by user */
  detailMultiPayTotalTouched: false,
  /** multi-pay UI: rowId -> whether user has manually entered this row */
  detailMultiPayTouchedRows: {},
  /** multi-pay UI: next unique row id */
  detailMultiPayNextRowId: 1,

  /** memberName -> pending colorId (coalesced; used to avoid spamming spreadsheet) */
  pendingMemberColors: {},

  _dlgResolve: null,
  _editRecord: null,
  _pollTimer: null,
};
