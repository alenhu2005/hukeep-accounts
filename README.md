# 記帳本

兩人日常帳與多人出遊分帳的前端，資料經 **Google Apps Script (GAS)** 寫入試算表；本機以 `localStorage` 快取，啟動時先顯示快取，再與伺服端同步。

## 專案檔案

| 路徑 | 說明 |
|------|------|
| `index.html` | 頁面結構、主題切換（避免深色模式閃爍的內嵌 script） |
| `styles.css` | 樣式 |
| `js/main.js` | 入口（ES module） |
| `js/config.js` | `API_URL`、逾時與快取鍵（可選：`window.__LEDGER_API_URL__` 覆寫網址） |
| `js/time.js` | 台北時區日期、`todayStr`、分析頁區間 |
| `js/api.js` / `js/data.js` / `js/finance.js` | GAS 同步、事件列衍生、結算計算 |
| `js/views-*.js` / `js/trip-stats.js` | 畫面渲染 |
| `js/actions.js` | 表單與按鈕動作 |
| `js/navigation.js` + `js/render-registry.js` | 分頁導覽（避免模組循環依賴） |
| `js/globals.js` | 將 `onclick` 所需函式掛到 `window` |

請以**靜態伺服器**開啟專案根目錄（`index.html` 與 `js/` 同層）。ES modules 在部分瀏覽器以 `file://` 開啟會無法載入，建議使用本機伺服器（例如 `python3 -m http.server`）。

## GitHub Pages

若已開啟 Pages 且來源為 `main` 根目錄，網址通常為：

**https://alenhu2005.github.io/code/**

（實際網址以 GitHub 專案 **Settings → Pages** 顯示為準。）

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

- **備份**：日常頁底部可下載 CSV、複製文字備份（來自目前記憶體中的事件列）。  
- **出遊**：行程內顯示「誰先付最多」、歷史依日期分組；行程**結束**後可一鍵複製結算懶人包。  
- **同步錯誤**：寫入 GAS 含逾時與 HTTP 狀態提示（請見畫面 toast）。
