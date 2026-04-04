/**
 * 行為入口：匯出拆在 `js/actions/` 下的模組，維持與重構前相同的公開 API（globals / inline onclick 不變）。
 */
export * from './actions/shared.js';
export * from './actions/home-daily.js';
export * from './actions/trip-form.js';
export * from './actions/trips-members.js';
export * from './actions/trip-expense.js';
export * from './actions/edit.js';
export * from './actions/misc.js';

export { toggleCollapsible } from './ui-collapsible.js';
export {
  toggleTripStatsPieCollapse,
  toggleTripStatsPieCollapseModal,
  openTripStatsModal,
  closeTripStatsModal,
} from './trip-stats-modal.js';
export { exportBackupCSV, copyBackupText, exportTechnicalCSV } from './backup.js';
export { updateMultiPayTotal, updatePerPerson } from './views-trip-detail.js';
