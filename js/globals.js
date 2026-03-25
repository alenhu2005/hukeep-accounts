/**
 * Inline HTML handlers (onclick=...) expect globals on window.
 * Keep this list in sync with index.html and dynamic innerHTML in views.
 */
import { navigate } from './navigation.js';
import { cancelDialog } from './dialog.js';
import { toggleTheme } from './theme.js';
import { toggleHomeHistory } from './views-home.js';
import { setAnalysisPeriod } from './views-analysis.js';
import * as actions from './actions.js';

Object.assign(window, {
  navigate,
  cancelDialog,
  toggleTheme,
  toggleHomeHistory,
  setAnalysisPeriod,
  closeEditRecord: actions.closeEditRecord,
  submitEditRecord: actions.submitEditRecord,
  recordSettlement: actions.recordSettlement,
  toggleCollapsible: actions.toggleCollapsible,
  setHomePaidBy: actions.setHomePaidBy,
  setHomeSplitMode: actions.setHomeSplitMode,
  submitDailyRecord: actions.submitDailyRecord,
  exportBackupCSV: actions.exportBackupCSV,
  copyBackupText: actions.copyBackupText,
  showCreateTripForm: actions.showCreateTripForm,
  addNewTripMember: actions.addNewTripMember,
  hideCreateTripForm: actions.hideCreateTripForm,
  createTrip: actions.createTrip,
  addDetailMember: actions.addDetailMember,
  addPayerRow: actions.addPayerRow,
  toggleMultiPay: actions.toggleMultiPay,
  submitTripExpense: actions.submitTripExpense,
  updateMultiPayTotal: actions.updateMultiPayTotal,
  toggleSplit: actions.toggleSplit,
  voidDailyRecord: actions.voidDailyRecord,
  openEditRecordById: actions.openEditRecordById,
  deleteTripAction: actions.deleteTripAction,
  copyTripSettlementSummary: actions.copyTripSettlementSummary,
  reopenTripAction: actions.reopenTripAction,
  closeTripAction: actions.closeTripAction,
  removeMemberAction: actions.removeMemberAction,
  voidTripExpenseAction: actions.voidTripExpenseAction,
  removeNewTripMember: actions.removeNewTripMember,
});
