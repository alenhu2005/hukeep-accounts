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
  /** 日常「歷史紀錄」月曆：`YYYY-MM`（由 renderHome 初始化為當月） */
  homeCalendarMonth: null,
  /** 選中單日時 `YYYY-MM-DD`；null 表示不篩選日期 */
  homeCalendarFilterDate: null,
  /** 日常月曆彈層是否開啟 */
  homeCalendarModalOpen: false,
  /** 下次繪製日常／行程列表時，對紀錄列做捲動進場（進頁或展開更多） */
  revealHomeRecordsNext: false,
  /** 下次繪製行程明細消費列表時做捲動進場 */
  revealTripExpensesNext: false,
  /** 出遊歷史：日期條「每列 7 天」從行程起點往後的第幾頁（0 起算） */
  tripDetailHistoryWeekOffset: 0,
  /** 出遊歷史：選中單日 `YYYY-MM-DD`；null 表示顯示全部（依日期分組） */
  tripDetailHistoryFilterDate: null,
  /** 出遊統計「分類支出」圓餅圖是否展開（目前行程；重繪時沿用） */
  tripStatsPieExpanded: false,
  /** 各行程圓餅區是否曾展開（離開再進同一行程時還原） */
  tripStatsPieExpandedByTrip: /** @type {Record<string, boolean>} */ ({}),
  /** 下次繪製行程列表時，「已結束行程」標題與銜接卡片刻進場 */
  revealTripsSectionNext: false,
  /** 成員目錄抽屜開啟後列表列進場（一次） */
  revealMemberDirNext: false,
  /** 從其他分頁切換到「日常」時，結算金額是否做數字刷動 */
  animateHomeBalanceNext: false,
  /** 上次顯示在畫面上的結算金額絕對值（刷動動畫起點） */
  homeBalanceAbsShown: null,
  /** 記帳／撤回／還款後：日常結算由舊絕對值刷到新值（與切頁全頁動畫分開） */
  pendingHomeBalanceFromAbs: null,

  _dailyRecordsCache: [],
  _tripExpenseCache: [],
  _tripSettlementCache: [],

  analysisPeriod: 'month',
  /** 分析頁：相對於「本週／本月／本年」的位移（上一段為負） */
  analysisWeekOffset: 0,
  analysisMonthOffset: 0,
  analysisYearOffset: 0,
  /** 分析頁：點選單日時 `YYYY-MM-DD`；null 表示該週／該月整段 */
  analysisFilterDate: null,
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

  /** 出遊新增消費：賭博模式（文案與分類鎖定） */
  detailGamblingMode: false,

  /** memberName -> pending colorId (coalesced; used to avoid spamming spreadsheet) */
  pendingMemberColors: {},

  _dlgResolve: null,
  _editRecord: null,
  _pollTimer: null,
};
