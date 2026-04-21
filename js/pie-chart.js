import { esc } from './utils.js';

export const CAT_PIE_COLORS = {
  餐飲: '#ea580c',
  交通: '#2563eb',
  住宿: '#0d9488',
  購物: '#7c3aed',
  娛樂: '#db2777',
  生活: '#059669',
  賭博: '#a855f7',
  其他: '#64748b',
  未分類: '#94a3b8',
};

let pieSvgSerial = 0;

/** 依顯示行數調整：扇形太窄不畫字 */
function labelMinFrac(nShow) {
  if (nShow <= 0) return 1;
  if (nShow === 1) return 0.022;
  if (nShow === 2) return 0.027;
  return 0.032;
}

function truncateCat(raw, maxLen) {
  const s = raw || '';
  if (s.length <= maxLen) return esc(s);
  return esc(s.slice(0, Math.max(0, maxLen - 1))) + '…';
}

function getMultiRingScale(n) {
  if (n >= 3) return { fs0: 8.5, fs1: 7.5, firstDy: '-0.6em', lineDy: '0.95em' };
  if (n === 2) return { fs0: 9.8, fs1: 8.6, firstDy: '-0.5em', lineDy: '1.08em' };
  return { fs0: 11.4, fs1: 11.4, firstDy: '0.38em', lineDy: '0' };
}

function catMaxLenForRing(nShow) {
  if (nShow >= 3) return 5;
  if (nShow === 2) return 7;
  return 9;
}

function buildMultiRingLabel(tx, ty, tspans, scale) {
  const { fs0, fs1, firstDy, lineDy } = scale;
  let inner = '';
  tspans.forEach((p, i) => {
    const dy = i === 0 ? firstDy : lineDy;
    const fs = i === 0 ? fs0 : fs1;
    const fill = i === 0 ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.9)';
    inner += `<tspan x="0" dy="${dy}" font-size="${fs}" font-weight="${i === 0 ? 700 : 600}" fill="${fill}">${p}</tspan>`;
  });
  return `<text class="pie-ring-label-t" text-anchor="middle" transform="translate(${tx},${ty})" font-size="${fs0}" font-weight="700">${inner}</text>`;
}

/**
 * @param {{ cat: string; amount: number; color: string }[]} slices
 * @param {number} total
 * @param {{ cat: boolean; pct: boolean; amt: boolean }} labelOpts
 */
export function makePieChartSVG(slices, total, labelOpts) {
  const fid = `ledgerPieLift${pieSvgSerial++}`;
  const { cat: showCat, pct: showPct, amt: showAmt } = labelOpts;
  const nShow = (showCat ? 1 : 0) + (showPct ? 1 : 0) + (showAmt ? 1 : 0);
  const anyRing = nShow > 0;

  const cx = 110;
  const cy = 110;
  const R = 86;
  const ri = 54;
  const isDark = document.documentElement.classList.contains('dark');
  const bgCard = isDark ? '#1a1b1f' : '#ffffff';
  const textColor = isDark ? '#f1f5f9' : '#0f172a';
  const mutedColor = isDark ? '#8b93a7' : '#64748b';
  const sliceGap = bgCard;
  const defs = `<defs>
    <filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="${isDark ? '0.22' : '0.06'}"/>
    </filter>
  </defs>`;

  if (slices.length === 1) {
    const s0 = slices[0];
    const R1 = 88;
    const ri1 = 48;
    const centerLines = [];
    if (showCat) centerLines.push({ text: esc(s0.cat), fs: 14, fw: 700, fill: textColor });
    if (showAmt) {
      centerLines.push({
        text: 'NT$' + Math.round(total).toLocaleString(),
        fs: 18,
        fw: 700,
        fill: textColor,
        tabular: true,
      });
    }
    if (showAmt) {
      centerLines.push({
        text: showPct ? '占本期 100% · 總支出' : '總支出',
        fs: 11,
        fw: 500,
        fill: mutedColor,
      });
    } else if (showPct) {
      centerLines.push({ text: '占本期 100%', fs: 11, fw: 500, fill: mutedColor });
    }
    let centerHtml = '';
    if (anyRing && centerLines.length) {
      const ys =
        centerLines.length === 1
          ? [cy + 5]
          : centerLines.length === 2
            ? [cy - 10, cy + 16]
            : [cy - 22, cy + 4, cy + 24];
      centerHtml = `<g class="pie-single-center" aria-hidden="true">${centerLines
        .map((ln, i) => {
          const tab = ln.tabular ? ' font-variant-numeric="tabular-nums" letter-spacing="-0.02em"' : '';
          return `<text x="${cx}" y="${ys[i]}" text-anchor="middle" fill="${ln.fill}" font-size="${ln.fs}" font-weight="${ln.fw}"${tab}>${ln.text}</text>`;
        })
        .join('')}</g>`;
    } else if (!anyRing) {
      centerHtml = `<text class="pie-center-main" x="${cx}" y="${cy - 5}" text-anchor="middle" fill="${textColor}" font-size="18" font-weight="700" font-variant-numeric="tabular-nums" letter-spacing="-0.02em">NT$${Math.round(total).toLocaleString()}</text>
      <text class="pie-center-sub" x="${cx}" y="${cy + 15}" text-anchor="middle" fill="${mutedColor}" font-size="11" font-weight="500" letter-spacing="0.04em">總支出</text>`;
    }
    return `<svg class="analysis-pie-svg analysis-pie-svg--single analysis-pie-svg--labels-${nShow}" width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
      ${defs}
      <g class="pie-single-wrap" filter="url(#${fid})">
        <circle cx="${cx}" cy="${cy}" r="${R1}" fill="${s0.color}" stroke="${sliceGap}" stroke-width="2.5" paint-order="stroke fill"/>
        <circle cx="${cx}" cy="${cy}" r="${ri1}" fill="${bgCard}"/>
      </g>
      ${centerHtml}
    </svg>`;
  }

  const paths = [];
  const ringLabelParts = [];
  let sliceIdx = 0;
  let a = -Math.PI / 2;
  const minDa = labelMinFrac(nShow) * 2 * Math.PI;
  const scale = getMultiRingScale(nShow);
  const maxCat = catMaxLenForRing(nShow);

  for (const s of slices) {
    const da = (s.amount / total) * 2 * Math.PI;
    if (da < 0.005) {
      a += da;
      continue;
    }
    const ea = a + da;
    const mid = a + da / 2;
    const lg = da > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(a);
    const y1 = cy + R * Math.sin(a);
    const x2 = cx + R * Math.cos(ea);
    const y2 = cy + R * Math.sin(ea);
    const ix1 = cx + ri * Math.cos(ea);
    const iy1 = cy + ri * Math.sin(ea);
    const ix2 = cx + ri * Math.cos(a);
    const iy2 = cy + ri * Math.sin(a);
    paths.push(
      `<path class="pie-slice" style="--slice-i:${sliceIdx}" d="M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${ix1},${iy1} A${ri},${ri} 0 ${lg},0 ${ix2},${iy2} Z" fill="${s.color}" stroke="${sliceGap}" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke fill"/>`,
    );

    if (anyRing && da >= minDa) {
      const pct = total > 0 ? Math.round((s.amount / total) * 100) : 0;
      const rLabel = (R + ri) / 2;
      const tx = cx + rLabel * Math.cos(mid);
      const ty = cy + rLabel * Math.sin(mid);
      const raw = s.cat || '';
      const tspans = [];
      if (showCat) tspans.push(truncateCat(raw, maxCat));
      if (showPct) tspans.push(`${pct}%`);
      if (showAmt) tspans.push(`NT$${Math.round(s.amount).toLocaleString()}`);
      if (tspans.length > 0) {
        ringLabelParts.push(buildMultiRingLabel(tx, ty, tspans, scale));
      }
    }
    sliceIdx += 1;
    a = ea;
  }

  const ringLabelsGroup =
    anyRing && ringLabelParts.length > 0
      ? `<g class="pie-ring-labels pie-ring-labels--multi pie-ring-labels--n${nShow}" aria-hidden="true">${ringLabelParts.join('')}</g>`
      : '';

  return `<svg class="analysis-pie-svg analysis-pie-svg--multi analysis-pie-svg--labels-${nShow}" width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
    ${defs}
    <g class="pie-slices-ring" filter="url(#${fid})">
      ${paths.join('')}
    </g>
    <circle class="pie-hole" cx="${cx}" cy="${cy}" r="${ri}" fill="${bgCard}"/>
    ${ringLabelsGroup}
    <text class="pie-center-main" x="${cx}" y="${cy - 5}" text-anchor="middle" fill="${textColor}" font-size="18" font-weight="700" font-variant-numeric="tabular-nums" letter-spacing="-0.02em">NT$${Math.round(total).toLocaleString()}</text>
    <text class="pie-center-sub" x="${cx}" y="${cy + 15}" text-anchor="middle" fill="${mutedColor}" font-size="11" font-weight="500" letter-spacing="0.04em">總支出</text>
  </svg>`;
}
