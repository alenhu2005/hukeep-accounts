/** Central mutable UI / session state (single object avoids circular import issues). */
export const appState = {
  allRows: [],
  currentPage: 'home',
  currentTripId: null,

  homePaidBy: '胡',
  homeSplitMode: '均分',
  homeShowAll: false,
  _dailyRecordsCache: [],
  _tripExpenseCache: [],

  analysisPeriod: 'month',

  newTripMembers: [],
  detailSplitAmong: [],
  detailMultiPay: false,

  _dlgResolve: null,
  _editRecord: null,
  _pollTimer: null,
};
