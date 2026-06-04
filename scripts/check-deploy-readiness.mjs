import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'index.html',
  'js/config.js',
  'sw.js',
  'vite.config.js',
  'scripts/prepare-dist.mjs',
  '.github/workflows/deploy.yml',
  'gas/current-state.gs',
  'docs/gas程式碼.md',
  'docs/operations-checklist.md',
  'README.md',
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

  const vite = read('vite.config.js');
  if (!/base:\s*['"]\/hukeep-accounts\/['"]/.test(vite)) {
    errors.push('vite.config.js 的 base 應為 /hukeep-accounts/，否則 GitHub Pages 子路徑資源會載入失敗。');
  }

  const pkg = read('package.json');
  for (const script of ['"build"', '"preview"', '"deploy:check"']) {
    if (!pkg.includes(script)) errors.push(`package.json 缺少 ${script} script。`);
  }

  const distPrep = read('scripts/prepare-dist.mjs');
  for (const marker of ['manifest.json', 'icons', 'CACHE_NAME', 'STATIC_ASSETS', 'dist']) {
    if (!distPrep.includes(marker)) errors.push(`scripts/prepare-dist.mjs 缺少 ${marker} 處理。`);
  }

  const workflow = read('.github/workflows/deploy.yml');
  for (const marker of ['actions/configure-pages', 'actions/upload-pages-artifact', 'actions/deploy-pages', 'npm run deploy:check']) {
    if (!workflow.includes(marker)) errors.push(`GitHub Pages workflow 缺少 ${marker}。`);
  }

  const readme = read('README.md');
  if (!readme.includes('npm run deploy:check')) {
    warnings.push('README 尚未提到 npm run deploy:check。');
  }
  if (!readme.includes('npm run build')) {
    warnings.push('README 尚未提到 npm run build。');
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
