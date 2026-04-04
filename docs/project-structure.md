# 專案檔案地圖（分類版）

本文件提供「看檔案就知道去哪改」的快速索引。

## 1) 入口與資源（Root）

- `index.html`：唯一 HTML 入口，包含頁面骨架、對話框容器、底部導覽、PWA 載入點。
- `css/*.css`：全站樣式（依用途分檔：`base`、`layout`、`home`、`trip-lottery`、`forms-controls`、`records-history`、`analysis`、`trip-cards`、`members-rare`、`trip-forms-collapsible`、`shell-nav`、`overlays-feedback`、`sheets-directory`、`dark-a11y`；`index.html` 中 `<link>` 順序須與相依關係一致）。
- `sw.js`：Service Worker（快取與離線策略）。
- `manifest.json`：PWA 描述檔。
- `.nojekyll`：GitHub Pages 靜態部署設定。

## 2) 應用核心（`js/`）

### A. 啟動、路由、狀態

- `main.js`：應用程式入口。
- `bootstrap.js`：初始化、載入快取、首次同步、背景輪詢、事件註冊。
- `router.js`：路由分派。
- `navigation.js`：頁面切換（含導覽按鈕）。
- `state.js`：執行期狀態。
- `render-registry.js`：集中 render 委派，避免循環依賴。

### B. 資料層與同步

- `api.js`：GAS 通訊、重試、快取、同步狀態。
- `offline-queue.js`：離線 outbox 佇列與合併邏輯。
- `data.js`：事件列轉 UI 資料模型。
- `model.js`：列結構與 normalize。
- `config.js`：環境參數、快取鍵、逾時與重試設定。

### C. 商業邏輯

- `finance.js`：結餘與結算計算。
- `trip-stats.js`：行程統計與摘要文案。
- `category.js`：分類推測與樣式輔助。
- `time.js`：日期、台北時區、分析週期。

### D. UI / View 層

- `views-home.js`：日常頁渲染。
- `views-trips.js`：行程列表頁渲染。
- `views-trip-detail.js`：行程明細頁渲染。
- `views-analysis.js`：分析頁渲染。
- `views-shared.js`：共用 UI 片段。
- `pie-chart.js`：圓餅圖 SVG。
- `theme.js`：主題切換。
- `dialog.js`、`dialog-a11y.js`：對話框與焦點管理。
- `amount-input.js`：金額輸入控制。
- `trip-lottery.js`：抽籤功能。

### E. 行為與工具

- `actions.js`：行為匯總（re-export）；實作在 `actions/`（`shared`、`home-daily`、`trip-form`、`trips-members`、`trip-expense`、`edit`、`misc`）。
- `ui-collapsible.js`：共用收合區塊（`toggleCollapsible`），供 HTML／views／actions 使用。
- `trip-stats-modal.js`：出遊統計頂欄彈窗與圓餅收合狀態。
- `sync-ui.js`：同步狀態列與更新提示。
- `sync-pause.js`：使用者輸入時暫停同步。
- `session-ui.js`：工作階段還原與保存。
- `device-info.js`：裝置資訊。
- `backup.js`：匯出 CSV、文字備份。
- `globals.js`：對 `window` 掛載需要的全域函式。
- `utils.js`：通用工具（toast、escape、亂數、AbortSignal 等）。

## 3) 測試（`test/`）

- `finance.test.js`：金流計算測試。
- `data.test.js`：資料轉換與推導測試。
- `offline-queue.test.js`：離線佇列與 pending 合併測試。
- `trip-stats.test.js`：統計摘要測試。
- `utils.test.js`：工具函式測試。

## 4) 文件（`docs/`）

- `project-structure.md`：本檔，檔案分類地圖。
- `workflow.md`：開發與維護流程。
- `operations-checklist.md`：部署/同步/排錯操作清單。

## 5) 依賴與工具

- `package.json`：npm scripts 與 devDependencies。
- `vitest.config.js`：測試設定。

## 快速定位建議

- 想改「同步流程」：先看 `js/bootstrap.js` + `js/api.js` + `js/offline-queue.js`
- 想改「某頁 UI」：先看對應 `views-*.js`，再回頭查 `actions.js`
- 想改「結算邏輯」：`js/finance.js`
- 想改「PWA/快取」：`sw.js` + `manifest.json`
