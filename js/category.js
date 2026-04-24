import { esc } from './utils.js';

/** 與統計「賭博代收付」拆項一致；出遊賭博模式會鎖定此分類。 */
export const GAMBLING_CATEGORY = '賭博';

/** Centralized category list — keep in sync with index.html <select#edit-category>. */
export const CATEGORIES = [
  { value: '餐飲', emoji: '🍽', label: '🍽 餐飲' },
  { value: '交通', emoji: '🚌', label: '🚌 交通' },
  { value: '住宿', emoji: '🛏', label: '🛏 住宿' },
  { value: '購物', emoji: '🛍', label: '🛍 購物' },
  { value: '娛樂', emoji: '🎉', label: '🎉 娛樂' },
  { value: '生活', emoji: '🏠', label: '🏠 生活' },
  { value: GAMBLING_CATEGORY, emoji: '🎰', label: '🎰 賭博' },
  { value: '其他', emoji: '📦', label: '📦 其他' },
];

const CATEGORY_STYLE_LIGHT = {
  餐飲: 'background:#fef3c7;color:#92400e',
  交通: 'background:#dbeafe;color:#1e40af',
  住宿: 'background:#ccfbf1;color:#115e59',
  購物: 'background:#ede9fe;color:#5b21b6',
  娛樂: 'background:#fce7f3;color:#9d174d',
  // Make "生活" clearly distinct from "餐飲" (both were warm before).
  生活: 'background:#dcfce7;color:#166534',
  // Distinct from "購物" (avoid same violet).
  賭博: 'background:#fae8ff;color:#86198f',
  其他: 'background:#f3f4f6;color:#4b5563',
};
const CATEGORY_STYLE_DARK = {
  餐飲: 'background:#78350f;color:#fcd34d',
  交通: 'background:#1e3a5f;color:#93c5fd',
  住宿: 'background:#134e4a;color:#5eead4',
  購物: 'background:#2e1065;color:#c4b5fd',
  娛樂: 'background:#831843;color:#f9a8d4',
  生活: 'background:#052e16;color:#86efac',
  賭博: 'background:#4a044e;color:#f5d0fe',
  其他: 'background:#334155;color:#94a3b8',
};
export const CATEGORY_STYLE = new Proxy({}, {
  get(_, key) {
    const dark = document.documentElement.classList.contains('dark');
    return (dark ? CATEGORY_STYLE_DARK : CATEGORY_STYLE_LIGHT)[key];
  }
});

function parseStylePair(styleStr) {
  const s = String(styleStr || '');
  const bg = (s.match(/background:\s*([^;]+)/i) || [])[1] || '';
  const fg = (s.match(/color:\s*([^;]+)/i) || [])[1] || '';
  return { bg: bg.trim(), fg: fg.trim() };
}

/** Returns current-theme badge colors for a category. */
export function getCategoryBadgeColors(cat) {
  const key = cat == null ? '' : String(cat).trim();
  if (!key) return { bg: '', fg: '' };
  const st = CATEGORY_STYLE[key] || '';
  return parseStylePair(st);
}

export const CATEGORY_KEYWORDS = {
  // 須在「餐飲」之前：避免「飯店」先被「飯」判成餐飲
  住宿: [
    '住宿',
    '飯店',
    '酒店',
    '民宿',
    '旅館',
    '旅店',
    '訂房',
    '青旅',
    '旅宿',
    '套房',
    'motel',
    'hostel',
    'hotel',
    'airbnb',
    'bnb',
    '訂飯店',
    '泡湯',
    '溫泉旅館',
  ],
  餐飲: [
    '餐',
    '飯',
    '食',
    '吃',
    '喝',
    '咖啡',
    '飲料',
    '早餐',
    '午餐',
    '晚餐',
    '宵夜',
    '麵',
    '粥',
    '鍋',
    '燒烤',
    '火鍋',
    '茶',
    '奶茶',
    '甜點',
    '蛋糕',
    '麵包',
    '便當',
    '小吃',
    '拉麵',
    '壽司',
    '漢堡',
    'pizza',
    '咖哩',
    '炒飯',
    '湯',
    '果汁',
    '牛奶',
    '豆漿',
    '河粉',
    '牛排',
    '炸雞',
    '滷肉',
    '燙',
    '沙拉',
    '三明治',
    '點心',
  ],
  交通: [
    '車',
    '捷運',
    '公車',
    '計程車',
    'uber',
    'taxi',
    '高鐵',
    '火車',
    '飛機',
    '機票',
    '油費',
    '加油',
    '停車',
    '過路費',
    '腳踏車',
    '機車',
    '租車',
    '轉運',
    '船',
    '渡輪',
  ],
  購物: [
    '購物',
    '超市',
    '賣場',
    '百貨',
    'costco',
    '全聯',
    '家樂福',
    '衣服',
    '鞋',
    '包',
    '3c',
    '電器',
    '書',
    '文具',
    '玩具',
    '禮物',
    '藥',
    '藥妝',
    '化妝',
    '保養',
    '日用',
    '雜貨',
    '家用',
    '清潔用',
  ],
  娛樂: [
    '電影',
    'ktv',
    '唱歌',
    '遊樂',
    '門票',
    '展覽',
    '表演',
    '音樂會',
    '景點',
    '遊樂園',
    '遊戲',
    '娛樂',
    '酒吧',
    'live',
    '演唱會',
  ],
  生活: [
    '水費',
    '電費',
    '瓦斯',
    '房租',
    '房貸',
    '管理費',
    '清潔',
    '打掃',
    '衛生紙',
    '洗衣',
    '家具',
    '沙發',
    '床',
    '燈',
    '鎖',
    '網路',
    '電話費',
    '保險',
    '醫療',
    '看診',
    '健身',
    '剪髮',
    '美容',
  ],
  賭博: [
    '撲克',
    '麻將',
    '德州',
    '百家',
    '賭博',
    '博弈',
    '籌碼',
    '21點',
    '廿一點',
    '骰子',
    '押注',
    '下注',
    'casino',
    'poker',
  ],
};

/**
 * @param {Record<string, number>} catTotals
 * @param {number} grandTotal 含賭博的總額（與分析頁 total 一致）
 */
export function gamblingSplitFromCatTotals(catTotals, grandTotal) {
  const gamble = catTotals[GAMBLING_CATEGORY] || 0;
  const nonGamblingTotal = Math.max(0, grandTotal - gamble);
  const nonGamblingSlices = Object.entries(catTotals)
    .filter(([c]) => c !== GAMBLING_CATEGORY)
    .sort((a, b) => b[1] - a[1]);
  return { gambleTotal: gamble, nonGamblingTotal, nonGamblingSlices };
}

export function guessCategoryFromItem(item) {
  if (!item) return '';
  const s = item.toLowerCase();
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some(k => s.includes(k.toLowerCase()))) return cat;
  }
  return '';
}

export function categoryBadgeHTML(cat) {
  if (!cat) return '';
  const st = CATEGORY_STYLE[cat] || 'background:#f3f4f6;color:#4b5563';
  return `<span class="category-badge" style="${st};font-size:10px;font-weight:600;padding:1px 7px;border-radius:99px;margin-left:4px;vertical-align:middle;white-space:nowrap">${esc(cat)}</span>`;
}
