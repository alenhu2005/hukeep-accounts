# 開發流程（Workflow）

## 本機啟動

1. 安裝依賴：`npm install`
2. 啟動靜態伺服器（擇一）：
   - `python3 -m http.server`
   - `npx serve`
3. 瀏覽器開啟 `index.html` 所在目錄網址（不要用 `file://`）。

## 開發時建議順序

1. 先改資料/邏輯（`js/data/`、`js/finance.js`、`js/api.js`、`js/sync/`）
2. 再改 view（`js/views-*.js`；若是行程明細再看 `js/views-trip-detail/`）
3. 最後改事件行為（`js/actions.js`／`js/actions/`）與樣式（`css/*.css`，順序見 `index.html`）
4. 補測試（`test/*.test.js`）

## 模組邊界規則

- `data.js`、`offline-queue.js`、`views-trip-detail.js` 是對外入口；新實作優先放進 `js/data/`、`js/sync/`、`js/views-trip-detail/`
- `api.js` 專注在 I/O 與同步流程；不要再把 outbox merge / schema migration / pending cleanup 堆回 `api.js`
- `gas/current-state.gs` 維持單檔部署，但檔內章節順序固定：sheet schema → row utils → active mutations → migration → media upload → HTTP handlers

## 重構 PR 原則

- 不混做新功能或視覺改版。
- 順序固定：先抽純函式，再拆模組，最後才改呼叫點。
- 若拆檔後行為應保持一致，請補 fixture / golden 回歸測試。

## 同步機制重點

- 先讀 localStorage 快取，後台再抓 GAS。
- POST 失敗會依條件進離線 outbox，待網路恢復重送。
- 背景輪詢若資料沒變，不重繪畫面以降低閃爍。

## PR / Commit 前檢查

- `npm test` 全部通過。
- 新功能是否有至少 1 個測試覆蓋。
- 若是重構：至少 1 個 fixture / golden 測試覆蓋主要輸出。
- 若改到 `sw.js` 靜態資源清單，確認是否需要更新快取版本。
- README / docs 是否同步更新（若有行為或設定變更）。
