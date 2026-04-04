# 開發流程（Workflow）

## 本機啟動

1. 安裝依賴：`npm install`
2. 啟動靜態伺服器（擇一）：
   - `python3 -m http.server`
   - `npx serve`
3. 瀏覽器開啟 `index.html` 所在目錄網址（不要用 `file://`）。

## 開發時建議順序

1. 先改資料/邏輯（`js/data.js`、`js/finance.js`、`js/api.js`）
2. 再改 view（`js/views-*.js`）
3. 最後改事件行為（`js/actions.js`／`js/actions/`）與樣式（`css/*.css`，順序見 `index.html`）
4. 補測試（`test/*.test.js`）

## 同步機制重點

- 先讀 localStorage 快取，後台再抓 GAS。
- POST 失敗會依條件進離線 outbox，待網路恢復重送。
- 背景輪詢若資料沒變，不重繪畫面以降低閃爍。

## PR / Commit 前檢查

- `npm test` 全部通過。
- 新功能是否有至少 1 個測試覆蓋。
- 若改到 `sw.js` 靜態資源清單，確認是否需要更新快取版本。
- README / docs 是否同步更新（若有行為或設定變更）。
