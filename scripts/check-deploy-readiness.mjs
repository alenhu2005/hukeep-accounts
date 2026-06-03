import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'index.html',
  'js/config.js',
  'sw.js',
  'gas/current-state.gs',
  'docs/gas程式碼.md',
  'docs/operations-checklist.md',
  'README.md',
];

const requiredStaticAssets = [
  './index.html',
  './css/dark-a11y.css',
  './js/main.js',
  './js/search-records.js',
  './js/ledger-health.js',
  './js/backup.js',
  './js/actions.js',
  './js/globals.js',
];

const errors = [];
const warnings = [];

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) errors.push(`缺少必要檔案：${file}`);
}

if (errors.length === 0) {
  const config = read('js/config.js');
  if (!/const DEFAULT_API\s*=\s*['"]https:\/\/script\.google\.com\/macros\/s\/.+\/exec['"]/.test(config)) {
    errors.push('js/config.js 的 DEFAULT_API 看起來不是 GAS Web App URL。');
  }

  const sw = read('sw.js');
  if (!/const CACHE_NAME\s*=\s*['"]ledger-v\d+['"]/.test(sw)) {
    errors.push('sw.js 缺少 ledger-v* CACHE_NAME。');
  }
  for (const asset of requiredStaticAssets) {
    if (!sw.includes(asset)) errors.push(`sw.js STATIC_ASSETS 缺少 ${asset}`);
  }

  const readme = read('README.md');
  if (!readme.includes('npm run deploy:check')) {
    warnings.push('README 尚未提到 npm run deploy:check。');
  }
  if (!readme.includes('資料健康檢查')) {
    warnings.push('README 尚未提到資料健康檢查。');
  }

  const ops = read('docs/operations-checklist.md');
  if (!ops.includes('npm run deploy:check')) {
    warnings.push('operations-checklist 尚未加入部署檢查指令。');
  }
}

if (errors.length > 0) {
  console.error('部署檢查未通過：');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('部署檢查通過。');
if (warnings.length > 0) {
  console.warn('提醒：');
  for (const warning of warnings) console.warn(`- ${warning}`);
}
