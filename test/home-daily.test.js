import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.window = {
    addEventListener: vi.fn(),
    innerHeight: 800,
  };
  globalThis.requestAnimationFrame = callback => callback();
});

const mocks = vi.hoisted(() => ({
  loadData: vi.fn(),
  postRow: vi.fn(),
  getDailyRecords: vi.fn(),
  showConfirm: vi.fn(),
  applyOptimisticPayload: vi.fn(),
  renderHome: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../js/api.js', () => ({
  loadData: mocks.loadData,
  postRow: mocks.postRow,
  formatPostError: vi.fn(() => '同步失敗'),
  saveCache: vi.fn(),
}));

vi.mock('../js/data.js', () => ({
  getDailyRecords: mocks.getDailyRecords,
  getTripById: vi.fn(),
  getTripExpenses: vi.fn(() => []),
  getTripSettlementAdjustmentsFromRows: vi.fn(() => []),
  getKnownMemberNames: vi.fn(() => []),
  getAvatarUrlByMemberName: vi.fn(),
  getMemberColor: vi.fn(() => ({ id: '', bg: '', fg: '' })),
  getMemberColorId: vi.fn(() => ''),
  isHiddenMemberColorId: vi.fn(() => false),
  getHiddenMemberStyleKey: vi.fn(() => ''),
  MEMBER_COLORS: [],
  HIDDEN_MEMBER_COLORS: [],
  TRIP_COLORS: [],
  pickRandomTripColorId: vi.fn(() => ''),
}));

vi.mock('../js/dialog.js', () => ({
  showConfirm: mocks.showConfirm,
  showAlert: vi.fn(),
  showVoidReasonPrompt: vi.fn(),
}));

vi.mock('../js/actions/shared.js', () => ({
  applyOptimisticPayload: mocks.applyOptimisticPayload,
  undoOptimisticPush: vi.fn(),
  parseMoneyLike: vi.fn(Number),
  snapshotPendingHomeBalanceFromAbs: vi.fn(),
  fileToJpegDataUrl: vi.fn(),
  snapshotRows: vi.fn(() => []),
  restoreRowsSnapshot: vi.fn(),
  hasQueuedAddForEntity: vi.fn(() => false),
  discardUnsyncedLocalEntity: vi.fn(),
}));

vi.mock('../js/views-home.js', () => ({
  renderHome: mocks.renderHome,
  cancelHomeBalanceAnim: vi.fn(),
}));

vi.mock('../js/utils.js', () => ({
  uid: vi.fn(() => 'settlement-test-id'),
  toast: mocks.toast,
  esc: vi.fn(value => String(value ?? '')),
  jqAttr: vi.fn(value => String(value ?? '')),
  jq: vi.fn(value => JSON.stringify(value)),
  randomUniformIndex: vi.fn(() => 0),
  memberToneClass: vi.fn(() => ''),
  memberToneVars: vi.fn(() => ''),
  prefersReducedMotion: vi.fn(() => true),
  bindScrollReveal: vi.fn(),
}));

vi.mock('../js/category.js', () => ({
  guessCategoryFromItem: vi.fn(() => ''),
  GAMBLING_CATEGORY: '賭博',
}));

vi.mock('../js/navigation.js', () => ({ navigate: vi.fn() }));
vi.mock('../js/sync-pause.js', () => ({ pauseSyncBriefly: vi.fn() }));
vi.mock('../js/views-trips.js', () => ({ renderTrips: vi.fn() }));
vi.mock('../js/views-trip-detail.js', () => ({
  renderTripDetail: vi.fn(),
  renderSplitChips: vi.fn(),
  renderSplitCustomList: vi.fn(),
  updatePerPerson: vi.fn(),
  updateMultiPayTotal: vi.fn(),
  resetTripDetailAmountDraft: vi.fn(),
  syncDetailTripFormLabels: vi.fn(),
}));
vi.mock('../js/trip-stats.js', () => ({ buildTripSettlementSummaryText: vi.fn(() => '') }));
vi.mock('../js/ui-collapsible.js', () => ({ toggleCollapsible: vi.fn() }));

import { recordSettlement } from '../js/actions/home-daily.js';
import { appState } from '../js/state.js';

describe('recordSettlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appState.allRows = [];
    appState.syncStatus = 'synced';
  });

  it('先同步 GAS 再使用最新欠款金額詢問還款', async () => {
    let refreshed = false;
    mocks.loadData.mockImplementation(async () => {
      refreshed = true;
      appState.syncStatus = 'synced';
      return false;
    });
    mocks.getDailyRecords.mockImplementation(() => [
      {
        type: 'daily',
        _voided: false,
        paidBy: '胡',
        splitMode: '均分',
        amount: refreshed ? 11794 : 11473,
      },
    ]);
    mocks.showConfirm.mockResolvedValue(false);

    await recordSettlement();

    expect(mocks.loadData).toHaveBeenCalledOnce();
    expect(mocks.showConfirm).toHaveBeenCalledWith(
      '記錄還款',
      expect.stringContaining('NT$5897'),
    );
    expect(mocks.postRow).not.toHaveBeenCalled();
  });

  it('無法同步最新帳本時阻止還款', async () => {
    mocks.loadData.mockImplementation(async () => {
      appState.syncStatus = 'cache_only';
      return false;
    });

    await recordSettlement();

    expect(mocks.getDailyRecords).not.toHaveBeenCalled();
    expect(mocks.showConfirm).not.toHaveBeenCalled();
    expect(mocks.postRow).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith('還款前無法取得最新帳本，請確認網路後再試');
  });
});
