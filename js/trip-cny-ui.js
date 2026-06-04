import { appState } from './state.js';
import { parseMoneyLike } from './actions/shared.js';
import { updatePerPerson } from './views-trip-detail/records.js';
import {
  fetchLiveCnyToTwdRate,
  getDetailAmountNt,
  isTripCnyModeEnabled,
  persistCnyTwdRate,
  setDetailAmountFromNt,
  updateCnyRateInlineDisplay,
} from './trip-cny-rate.js';

function refreshDetailAmountDisplayAfterRate() {
  const nt = getDetailAmountNt();
  setDetailAmountFromNt(nt);
}

/**
 * 人民幣模式下：依輸入幣別與匯率更新內部台幣分攤；選 ¥ 時不覆寫輸入框為台幣。
 */
export function applyTripCnyToTwd() {
  if (!isTripCnyModeEnabled(appState.currentTripId)) return;
  const rateEl = document.getElementById('d-cny-rate');
  const totalEl = document.getElementById('d-amount');
  if (!totalEl) return;
  const rate = parseMoneyLike(rateEl?.value);

  if (appState.detailSplitTotalDerived) {
    appState.detailSplitTotalDerived = false;
    totalEl.disabled = false;
    totalEl.classList.remove('split-custom-input--locked');
    totalEl.setAttribute('aria-disabled', 'false');
  }

  if (appState.detailMultiPay) {
    appState.detailMultiPayTotalTouched = true;
    appState.detailMultiPayLockedTarget = '';
  }
  if (appState.detailSplitMode === 'custom') {
    appState.detailSplitTotalTouched = true;
  }

  if (appState.detailAmountCurrency === 'CNY') {
    const cny = parseMoneyLike(totalEl.value);
    if (cny > 0 && rate > 0) persistCnyTwdRate(rate);
  } else if (rate > 0) {
    persistCnyTwdRate(rate);
  }

  updatePerPerson();
  updateCnyRateInlineDisplay();
}

/**
 * 向公開 API 取得 CNY→TWD，更新隱藏匯率欄、總金額列旁一句匯率，並觸發換算。
 * @param {{ force?: boolean }} [opts] force=true 時強制重抓（略過 45 分鐘快取）
 */
export async function refreshTripLiveCnyRateUi(opts = {}) {
  if (!isTripCnyModeEnabled(appState.currentTripId)) return;
  const force = !!(opts && opts.force);
  const rateEl = document.getElementById('d-cny-rate');
  if (!rateEl) return;

  const got = await fetchLiveCnyToTwdRate({ force });
  if (!got) {
    updateCnyRateInlineDisplay();
    return;
  }

  rateEl.value = String(got.rate);
  updateCnyRateInlineDisplay();

  applyTripCnyToTwd();
  refreshDetailAmountDisplayAfterRate();
}
