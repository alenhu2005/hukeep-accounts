/**
 * Comprehensive client device & environment summary for security logging.
 * Collects device type, OS, browser, screen, timezone, language,
 * hardware hints, connection, touch capability, and canvas fingerprint.
 */

function browserLabel(ua) {
  if (/Edg\//i.test(ua)) {
    const m = ua.match(/Edg\/([\d.]+)/);
    return m ? `Edge ${m[1]}` : 'Edge';
  }
  if (/CriOS\/([\d.]+)/i.test(ua)) {
    const m = ua.match(/CriOS\/([\d.]+)/i);
    return m ? `Chrome ${m[1]}` : 'Chrome';
  }
  if (/Chrome\/([\d.]+)/i.test(ua) && !/Edg\//i.test(ua)) {
    const m = ua.match(/Chrome\/([\d.]+)/i);
    return m ? `Chrome ${m[1]}` : 'Chrome';
  }
  if (/Firefox\/([\d.]+)/i.test(ua)) {
    const m = ua.match(/Firefox\/([\d.]+)/i);
    return m ? `Firefox ${m[1]}` : 'Firefox';
  }
  if (/Safari/i.test(ua) && !/Chrome|CriOS|Edg/i.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/i);
    return m ? `Safari ${m[1]}` : 'Safari';
  }
  return '瀏覽器';
}

function osLabel(ua) {
  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/OS ([\d_]+)/i);
    return m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS';
  }
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/i);
    return m ? `Android ${m[1]}` : 'Android';
  }
  if (/Win64|Windows NT/i.test(ua)) {
    const m = ua.match(/Windows NT ([\d.]+)/i);
    if (m) {
      const v = m[1];
      if (v === '10.0') return 'Windows 10/11';
      return `Windows ${v}`;
    }
    return 'Windows';
  }
  if (/Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/i);
    return m ? `macOS ${m[1].replace(/_/g, '.')}` : 'macOS';
  }
  if (/Linux/i.test(ua)) return 'Linux';
  return '系統';
}

function kindLabel(ua) {
  if (/iPad/i.test(ua)) return '平板';
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return '手機';
  return '電腦';
}

function screenInfo() {
  try {
    const w = screen.width || 0;
    const h = screen.height || 0;
    const dpr = window.devicePixelRatio || 1;
    return `${w}×${h}@${Math.round(dpr * 10) / 10}x`;
  } catch {
    return '';
  }
}

function viewportInfo() {
  try {
    return `vp${window.innerWidth || 0}×${window.innerHeight || 0}`;
  } catch {
    return '';
  }
}

function timezoneInfo() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function languageInfo() {
  try {
    const lang = navigator.language || '';
    const langs = navigator.languages;
    if (langs && langs.length > 1) return `${lang}[${langs.join(',')}]`;
    return lang;
  } catch {
    return '';
  }
}

function hardwareInfo() {
  const parts = [];
  try {
    if (navigator.hardwareConcurrency) parts.push(`${navigator.hardwareConcurrency}c`);
  } catch { /* ignore */ }
  try {
    if (navigator.deviceMemory) parts.push(`${navigator.deviceMemory}g`);
  } catch { /* ignore */ }
  return parts.join(',');
}

function connectionInfo() {
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return '';
    const parts = [];
    if (c.effectiveType) parts.push(c.effectiveType);
    if (typeof c.downlink === 'number') parts.push(`${c.downlink}Mbps`);
    if (typeof c.rtt === 'number') parts.push(`rtt${c.rtt}`);
    if (c.saveData) parts.push('saveData');
    return parts.join(',');
  } catch {
    return '';
  }
}

function touchInfo() {
  try {
    const tp = navigator.maxTouchPoints;
    if (typeof tp === 'number' && tp > 0) return `tp${tp}`;
    return 'notp';
  } catch {
    return '';
  }
}

function platformInfo() {
  try {
    return navigator.platform || '';
  } catch {
    return '';
  }
}

function cookieInfo() {
  try {
    return navigator.cookieEnabled ? 'cookie:1' : 'cookie:0';
  } catch {
    return '';
  }
}

function storageInfo() {
  try {
    const ls = typeof localStorage !== 'undefined';
    const ss = typeof sessionStorage !== 'undefined';
    return `ls:${ls ? 1 : 0},ss:${ss ? 1 : 0}`;
  } catch {
    return '';
  }
}

/**
 * Canvas-based browser fingerprint: renders text + shapes, hashes the pixel data.
 * Different browsers/GPUs produce subtly different results.
 */
function canvasFingerprint() {
  try {
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 60;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('LedgerFP_🎯✓', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillRect(75, 1, 100, 20);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(255,0,255)';
    ctx.beginPath();
    ctx.arc(50, 30, 25, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgb(0,255,255)';
    ctx.beginPath();
    ctx.arc(90, 30, 25, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
    const data = c.toDataURL();
    let h = 0;
    for (let i = 0; i < data.length; i++) {
      h = ((h << 5) - h + data.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  } catch {
    return '';
  }
}

function webglInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return '';
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '';
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
    const label = [vendor, renderer].filter(Boolean).join('/');
    return label.length > 80 ? label.slice(0, 80) : label;
  } catch {
    return '';
  }
}

function installedPluginsHash() {
  try {
    if (!navigator.plugins || navigator.plugins.length === 0) return '';
    const names = Array.from(navigator.plugins)
      .map(p => p.name)
      .sort()
      .join(',');
    let h = 0;
    for (let i = 0; i < names.length; i++) {
      h = ((h << 5) - h + names.charCodeAt(i)) | 0;
    }
    return 'pl:' + (h >>> 0).toString(16).padStart(8, '0');
  } catch {
    return '';
  }
}

function mediaDevicesHash() {
  return new Promise(resolve => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        resolve('');
        return;
      }
      navigator.mediaDevices
        .enumerateDevices()
        .then(devices => {
          const kinds = devices.map(d => d.kind).sort().join(',');
          resolve(`md:${devices.length}(${kinds})`);
        })
        .catch(() => resolve(''));
    } catch {
      resolve('');
    }
  });
}

/**
 * @returns {Promise<string>} compact summary for the _clientDevice POST field
 */
export async function getClientDeviceSummary() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const basic = [kindLabel(ua), osLabel(ua), browserLabel(ua)];

  try {
    const uad = navigator.userAgentData;
    if (uad?.getHighEntropyValues) {
      const h = await uad.getHighEntropyValues([
        'model',
        'platformVersion',
        'architecture',
        'bitness',
        'fullVersionList',
      ]);
      if (h.model && String(h.model).trim()) {
        basic.splice(2, 0, String(h.model).trim());
      }
      if (h.platformVersion) basic[1] += '/' + h.platformVersion;
      if (h.architecture) basic.push(`arch:${h.architecture}${h.bitness ? '_' + h.bitness : ''}`);
    }
  } catch {
    /* ignore */
  }

  const extra = [
    screenInfo(),
    viewportInfo(),
    languageInfo(),
    timezoneInfo(),
    platformInfo(),
    hardwareInfo(),
    connectionInfo(),
    touchInfo(),
    cookieInfo(),
    storageInfo(),
  ].filter(Boolean);

  const fp = canvasFingerprint();
  if (fp) extra.push('fp:' + fp);

  const gl = webglInfo();
  if (gl) extra.push('gl:' + gl);

  const ph = installedPluginsHash();
  if (ph) extra.push(ph);

  let md = '';
  try {
    md = await Promise.race([mediaDevicesHash(), new Promise(r => setTimeout(() => r(''), 500))]);
  } catch {
    /* ignore */
  }
  if (md) extra.push(md);

  const ts = new Date().toISOString();
  extra.push('t:' + ts);

  return basic.join(' · ') + ' | ' + extra.join(' | ');
}
