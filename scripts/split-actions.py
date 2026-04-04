#!/usr/bin/env python3
"""One-off: split js/actions.js into js/actions/*.js (run from repo root)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "js" / "actions.js"
lines = SRC.read_text().splitlines(keepends=True)

# Shared import block (same as original top, minus trip-stats render — modules add own needs)
IMPORT_CORE = '''import { USER_A, USER_B } from '../config.js';
import { appState } from '../state.js';
import { todayStr } from '../time.js';
import {
  uid,
  toast,
  esc,
  jqAttr,
  jq,
  randomUniformIndex,
  memberToneClass,
  memberToneVars,
  prefersReducedMotion,
  bindScrollReveal,
} from '../utils.js';
import { postRow, formatPostError } from '../api.js';
import {
  getDailyRecords,
  getTripById,
  getTripExpenses,
  getTripSettlementAdjustmentsFromRows,
  getKnownMemberNames,
  getAvatarUrlByMemberName,
  getMemberColor,
  getMemberColorId,
  isHiddenMemberColorId,
  getHiddenMemberStyleKey,
  MEMBER_COLORS,
  HIDDEN_MEMBER_COLORS,
  TRIP_COLORS,
  pickRandomTripColorId,
} from '../data.js';
import { computeBalance, computeSettlements } from '../finance.js';
import { showConfirm, showAlert } from '../dialog.js';
import { guessCategoryFromItem, GAMBLING_CATEGORY } from '../category.js';
import { navigate } from '../navigation.js';
import { pauseSyncBriefly } from '../sync-pause.js';
import { renderHome, cancelHomeBalanceAnim } from '../views-home.js';
import { renderTrips } from '../views-trips.js';
import {
  renderTripDetail,
  renderSplitChips,
  renderSplitCustomList,
  updatePerPerson,
  updateMultiPayTotal,
  resetTripDetailAmountDraft,
  syncDetailTripFormLabels,
} from '../views-trip-detail.js';
import { buildTripSettlementSummaryText } from '../trip-stats.js';
import { toggleCollapsible } from '../ui-collapsible.js';
'''

IMPORT_SHARED = '''import { undoOptimisticPush, parseMoneyLike, snapshotPendingHomeBalanceFromAbs, fileToJpegDataUrl } from './shared.js';
'''

def slice_lines(a: int, b: int) -> str:
    return "".join(lines[a - 1 : b])


def write(name: str, header: str, body: str) -> None:
    out = ROOT / "js" / "actions" / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(header + "\n" + body + "\n")
    print("wrote", out.relative_to(ROOT))


# --- shared.js: helpers + fileToJpeg (lines 53-67, 1652-1683) ---
shared_body = slice_lines(53, 67) + "\n" + slice_lines(1652, 1683)
write(
    "shared.js",
    """import { appState } from '../state.js';
import { getDailyRecords } from '../data.js';
import { computeBalance } from '../finance.js';

""",
    shared_body.strip() + "\n",
)

# --- home-daily.js: 70-85, 498-673 ---
home_daily = slice_lines(70, 85) + slice_lines(498, 673)
write("home-daily.js", IMPORT_CORE + IMPORT_SHARED, home_daily)

# --- trip-form.js: 87-496 ---
trip_form = slice_lines(87, 496)
write("trip-form.js", IMPORT_CORE + IMPORT_SHARED, trip_form)

# --- trips-members.js: 676-1353 ---
trips_mem = slice_lines(676, 1353)
write("trips-members.js", IMPORT_CORE + IMPORT_SHARED, trips_mem)

# --- trip-expense.js: 1355-1594 ---
trip_exp = slice_lines(1355, 1594)
write("trip-expense.js", IMPORT_CORE + IMPORT_SHARED, trip_exp)

# --- edit.js: 1596-1651 + 1684-1975 (exclude fileToJpeg block) ---
edit_body = slice_lines(1596, 1651) + slice_lines(1684, 1975)
write("edit.js", IMPORT_CORE + IMPORT_SHARED, edit_body)

# --- misc.js: 1977-2073 + 2085-2091 ---
misc_body = slice_lines(1977, 2073) + slice_lines(2085, 2091)
write("misc.js", IMPORT_CORE + IMPORT_SHARED, misc_body)

print("Done. Replace js/actions.js with barrel manually.")
