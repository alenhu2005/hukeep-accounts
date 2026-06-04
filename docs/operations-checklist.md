# 維運操作清單

## A. 部署前

- [ ] `js/config.js` 的 API URL 指向正確 GAS Web App。
- [ ] 若要用建置時 API 設定，確認 `.env.local` 的 `VITE_LEDGER_API_URL` 指向正確 GAS Web App。
- [ ] `npm run deploy:check` 通過（包含設定檢查、lint、Vitest、Vite build 與 Playwright smoke）。
- [ ] 必要時用 `npm run preview` 預覽 `dist/`，並開啟 `/hukeep-accounts/` 路徑。
- [ ] 若有改動離線資源：確認 `npm run build` 產生的 `dist/sw.js` 已包含新產物。
- [ ] 若有改動 PWA 更新流程：確認 `dist/version.json` 已產生，且 `dist/sw.js` 包含 `SKIP_WAITING`。
- [ ] README 與 docs 已同步更新（避免文件與行為不一致）。

## B. GitHub Pages 發布後

- [ ] 開啟正式網址確認首頁可載入。
- [ ] 切換三個分頁（日常/出遊/分析）確認無白屏。
- [ ] DevTools Network 確認 JS/CSS 從 `/hukeep-accounts/assets/` 載入，且沒有 404。
- [ ] DevTools Application 確認 Service Worker 作用範圍在 `/hukeep-accounts/`。
- [ ] 新增一筆資料，確認同步狀態列可回到「已同步」。
- [ ] 開啟「備份與匯出」，確認資料健康檢查、診斷面板、最近操作與匯出按鈕可正常顯示。
- [ ] 點「複製診斷報告」，確認內容包含 build id、API 來源、同步狀態、outbox 筆數與 Service Worker 狀態。
- [ ] 強制重新整理（Cmd+Shift+R / Ctrl+Shift+R）確認新版本生效。

## C. 常見問題排查

### 1) 前端可開但資料同步失敗

- 確認 GAS 部署權限（是否允許目標使用者）。
- 確認前端 `API_URL` 是否為最新部署 URL。
- 看同步狀態列是否長期停留「僅快取」。
- 複製診斷報告，確認 API 來源是 `build`、`window`、`localStorage` 或 `default` 中的預期來源。

### 2) 手機看到舊版

- 關閉分頁後重開。
- 強制重整。
- 若畫面出現「有新版本」，按「更新」讓 waiting Service Worker 立即接手。
- 必要時清除網站資料與快取。

### 3) 離線後資料不同步

- 回到連線環境後等待自動重送。
- 觀察是否有 toast 錯誤訊息。
- 若持續失敗，檢查 GAS 日誌與回應格式。

## D. 資料安全

- 本專案快取在 `localStorage`，清除瀏覽資料會移除本機快取。
- 正式資料來源仍以 GAS + 試算表為準。
- 建議定期使用「備份與匯出」功能匯出 CSV，並複製資料健康報告留存。
