# 記帳本

兩人日常帳與多人出遊分帳的前端，資料經 **Google Apps Script (GAS)** 寫入試算表；本機以 `localStorage` 快取，啟動時先顯示快取，再與伺服端同步。

## 本機開發與測試

| 指令 | 說明 |
|------|------|
| `npm install` | 安裝開發依賴（Vitest） |
| `npm test` | 執行單元測試（`test/*.test.js`） |

專案為**純靜態前端**（無打包步驟）。請以**靜態伺服器**開啟專案根目錄（`index.html` 與 `js/` 同層）。ES modules 在部分瀏覽器以 `file://` 開啟會無法載入，建議使用本機伺服器（例如 `python3 -m http.server` 或 `npx serve`）。

## 專案檔案

### 入口與設定

| 路徑 | 說明 |
|------|------|
| `index.html` | 頁面結構、動態 `<base>`（修正 GitHub Pages 無結尾 `/` 時資源路徑）、主題預先套用 |
| `.nojekyll` | 關閉 Jekyll，避免 Pages 處理時略過部分靜態檔 |
| `styles.css` | 樣式 |
| `package.json` | 專案中繼資料；`npm test` 執行 Vitest |
| `vitest.config.js` | 測試設定（`test/**/*.test.js`） |
| `js/main.js` | 入口（載入 router、globals、`bootstrap` 初始化） |
| `js/config.js` | `API_URL`、逾時與快取鍵（可選：`window.__LEDGER_API_URL__` 覆寫網址） |
| `js/state.js` | 執行時狀態（目前分頁、分析區間、圓餅標籤選項等） |
| `js/model.js` | 資料結構／型別註解（JSDoc） |

### 資料、同步與計算

| 路徑 | 說明 |
|------|------|
| `js/api.js` | GAS `fetch`、快取讀寫、背景輪詢 |
| `js/data.js` | 事件列衍生日常紀錄、行程與支出 |
| `js/finance.js` | 結餘與分攤計算 |
| `js/time.js` | 台北時區日期、`todayStr`、分析頁日期區間 |
| `js/backup.js` | 備份匯出（CSV／文字） |

### 畫面與互動

| 路徑 | 說明 |
|------|------|
| `js/router.js` | 記憶體內路由分派與 `render` 觸發 |
| `js/navigation.js` | 分頁切換 |
| `js/render-registry.js` | `render` 委派（避免 navigation ↔ views 循環依賴） |
| `js/views-home.js` | 日常首頁 |
| `js/views-trips.js` | 出遊列表 |
| `js/views-trip-detail.js` | 出遊明細、抽籤入口 |
| `js/views-analysis.js` | 分析（週期、圓餅圖、圖例） |
| `js/views-shared.js` | 共用片段 |
| `js/trip-stats.js` | 出遊統計區塊 |
| `js/trip-lottery.js` | 行程內抽籤（籤筒編輯、`localStorage` 持久化） |
| `js/pie-chart.js` | 分析頁圓餅圖 SVG |
| `js/category.js` | 分類標籤樣式 |
| `js/theme.js` | 明暗主題 |
| `js/dialog.js` / `js/dialog-a11y.js` | 確認／編輯對話框與焦點陷阱、Esc |
| `js/amount-input.js` | 金額輸入行為 |
| `js/actions.js` | 表單與按鈕動作 |
| `js/globals.js` | 將 `onclick` 等所需函式掛到 `window` |

### 同步 UI、工作階段與工具

| 路徑 | 說明 |
|------|------|
| `js/bootstrap.js` | 啟動載入、輪詢、對話框註冊、金額欄位初始化 |
| `js/sync-ui.js` | 底部同步狀態列、「資料已更新」提示 |
| `js/sync-pause.js` | 使用者輸入時暫停背景同步，避免打斷 |
| `js/session-ui.js` | 還原上次路由／分析區間等工作階段 |
| `js/device-info.js` | 裝置／瀏覽器資訊（依需求使用） |
| `js/utils.js` | 跳脫字元、`toast`、均勻隨機整數、`prefersReducedMotion` 等 |

## GitHub Pages

若已開啟 Pages 且來源為 `main` 根目錄，網址通常為：

**https://alenhu2005.github.io/code/**

（實際網址以 GitHub 專案 **Settings → Pages** 顯示為準。）

**若線上版空白／樣式全掛：** 常見原因是開成 `…/code` 而沒有結尾斜線，瀏覽器會把 `js/main.js` 解析到錯誤路徑。`index.html` 已內建修正；部署後請**強制重新整理**或清快取再試。

部署後請在 `js/config.js` 確認 `API_URL` 指向你已部署的 GAS Web App，或在載入 `js/main.js` **之前**於頁面設定 `window.__LEDGER_API_URL__ = '你的 GAS URL'`。

## Google Apps Script 部署注意

1. **新增部署** → 類型選 **網路應用程式**。  
2. **執行身分**：一般選「我」即可讓試算表寫入用你的權限。  
3. **具有存取權的使用者**：  
   - 僅自己用：可選「只有我自己」。  
   - 公開給他人開同一個前端 URL：需選 **「所有人」**（或組織內），否則匿名 `fetch` / POST 會失敗。  
4. 重新發布程式後 **部署 ID / URL 會變**，請同步更新前端 `js/config.js` 的 `API_URL`（或 `__LEDGER_API_URL__`）。

試算表需配合你的 GAS 讀寫邏輯（欄位與事件列格式依你的後端實作）。

## 功能摘要

- **日常**：記帳、分類、結餘；標題列可開備份選單（可讀版 CSV、文字備份、原始技術 CSV）。  
- **出遊**：行程、多人分攤、歷史依日期分組、「誰先付最多」統計；行程結束後可複製結算摘要；行程頁可開 **抽籤**（籤筒可增刪名稱，含非行程成員）。  
- **分析**：本週／本月／本年、依分類圓餅圖與圖例（可切換環上顯示：分類／比例／金額）。  
- **同步**：寫入 GAS 含逾時與 HTTP 狀態提示（toast）；背景輪詢更新時可顯示「資料已更新」。  
- **其他**：明暗主題、編輯／確認對話框無障礙（焦點與 Esc）、偏好減少動畫時略過部分動效。
