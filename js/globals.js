/**
 * Inline HTML handlers (onclick=...) expect globals on window.
 * Keep this list in sync with index.html and dynamic innerHTML in views.
 */
import { navigate } from './navigation.js';
import { cancelDialog } from './dialog.js';
import { toggleTheme } from './theme.js';
import { toggleHomeHistory } from './views-home.js';
import { setAnalysisPeriod, setPieLabelOption } from './views-analysis.js';
import * as actions from './actions.js';
import {
  startTripLotteryDraw,
  setTripLotteryKeepInPool,
  resetTripLotteryPool,
  toggleTripLotteryPanel,
  removeFromTripLotteryPool,
  addToTripLotteryPoolFromInput,
  addToTripLotteryPoolFromSelect,
} from './trip-lottery.js';

Object.assign(window, {
  navigate,
  cancelDialog,
  openBackupMenu: actions.openBackupMenu,
  closeBackupMenu: actions.closeBackupMenu,
  toggleTheme,
  toggleHomeHistory,
  setAnalysisPeriod,
  setPieLabelOption,
  closeEditRecord: actions.closeEditRecord,
  submitEditRecord: actions.submitEditRecord,
  openEditPhotoPicker: actions.openEditPhotoPicker,
  handleEditPhotoSelected: actions.handleEditPhotoSelected,
  removeEditPhoto: actions.removeEditPhoto,
  openAvatarPickerForMember: actions.openAvatarPickerForMember,
  handleAvatarSelected: actions.handleAvatarSelected,
  setApiUrl: actions.setApiUrl,
  recordSettlement: actions.recordSettlement,
  recordTripSettlementOneAction: actions.recordTripSettlementOneAction,
  toggleCollapsible: actions.toggleCollapsible,
  setHomePaidBy: actions.setHomePaidBy,
  setHomeSplitMode: actions.setHomeSplitMode,
  submitDailyRecord: actions.submitDailyRecord,
  exportBackupCSV: actions.exportBackupCSV,
  exportTechnicalCSV: actions.exportTechnicalCSV,
  copyBackupText: actions.copyBackupText,
  showCreateTripForm: actions.showCreateTripForm,
  addNewTripMember: actions.addNewTripMember,
  hideCreateTripForm: actions.hideCreateTripForm,
  createTrip: actions.createTrip,
  addDetailMember: actions.addDetailMember,
  addPayerRow: actions.addPayerRow,
  setPayerRowMember: actions.setPayerRowMember,
  setDetailPaidBy: actions.setDetailPaidBy,
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
  focusAmountAfterHomeItem: actions.focusAmountAfterHomeItem,
  focusNextInBothPayHome: actions.focusNextInBothPayHome,
  focusAmountAfterTripItem: actions.focusAmountAfterTripItem,
  startTripLotteryDraw,
  setTripLotteryKeepInPool,
  resetTripLotteryPool,
  toggleTripLotteryPanel,
  removeFromTripLotteryPool,
  addToTripLotteryPoolFromInput,
  addToTripLotteryPoolFromSelect,
});
