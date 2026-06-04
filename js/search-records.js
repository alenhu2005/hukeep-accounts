function normalizeSearchText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('zh-TW')
    .replace(/\s+/g, ' ');
}

function searchTokens(query) {
  const q = normalizeSearchText(query);
  return q ? q.split(' ').filter(Boolean) : [];
}

function moneyTerms(value) {
  const n = Math.round(parseFloat(value) || 0);
  if (!n) return ['0', 'nt$0'];
  const plain = String(n);
  return [plain, `nt$${plain}`, n.toLocaleString(), `nt$${n.toLocaleString()}`];
}

function collectBaseTerms(row) {
  return [
    row?.id,
    row?.date,
    row?._voided ? '已撤回 撤回' : '',
    row?.voidReason,
    ...moneyTerms(row?.amount),
  ];
}

function matchTerms(terms, query) {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const haystack = normalizeSearchText(terms.filter(v => v != null && v !== '').join(' '));
  return tokens.every(token => haystack.includes(token));
}

export function dailyRecordSearchTerms(row) {
  if (row?.type === 'settlement') {
    return [
      ...collectBaseTerms(row),
      '日常 還款 還款紀錄',
      row.paidBy,
    ];
  }
  const splitLabel =
    row?.splitMode === '均分'
      ? '各付一半 均分'
      : row?.splitMode === '只有胡'
        ? '只算胡的 只有胡'
        : row?.splitMode === '只有詹'
          ? '只算詹的 只有詹'
          : row?.splitMode === '兩人付'
            ? '兩人都付 各自出資 多人出款'
            : row?.splitMode;
  return [
    ...collectBaseTerms(row),
    '日常 消費',
    row?.item,
    row?.note,
    row?.category,
    row?.paidBy,
    splitLabel,
    ...moneyTerms(row?.paidHu),
    ...moneyTerms(row?.paidZhan),
  ];
}

export function tripRecordSearchTerms(item) {
  const row = item?.data ?? item;
  if (item?.kind === 'settlement' || row?.type === 'tripSettlement') {
    return [
      ...collectBaseTerms(row),
      '出遊 還款 出遊還款',
      row?.from,
      row?.to,
    ];
  }
  const splitAmong = Array.isArray(row?.splitAmong) ? row.splitAmong : [];
  const payers = Array.isArray(row?.payers)
    ? row.payers.flatMap(p => [p?.name, ...moneyTerms(p?.amount)])
    : [];
  const splitDetails = Array.isArray(row?.splitDetails)
    ? row.splitDetails.flatMap(s => [s?.name, ...moneyTerms(s?.amount)])
    : [];
  return [
    ...collectBaseTerms(row),
    '出遊 消費',
    row?.item,
    row?.note,
    row?.category,
    row?.paidBy,
    splitAmong.join(' '),
    payers.join(' '),
    splitDetails.join(' '),
    ...moneyTerms(row?.amountCny),
    ...moneyTerms(row?.fxFeeNtd),
  ];
}

export function matchesDailyRecord(row, query) {
  return matchTerms(dailyRecordSearchTerms(row), query);
}

export function matchesTripRecord(itemOrRow, query) {
  return matchTerms(tripRecordSearchTerms(itemOrRow), query);
}

export function filterDailyRecords(records, query) {
  const q = normalizeSearchText(query);
  return q ? records.filter(row => matchesDailyRecord(row, q)) : records;
}

export function filterTripRecords(items, query) {
  const q = normalizeSearchText(query);
  return q ? items.filter(item => matchesTripRecord(item, q)) : items;
}

export function hasRecordSearchQuery(query) {
  return searchTokens(query).length > 0;
}
