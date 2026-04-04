# 記帳本（Ledger App）

兩人**日常帳**與多人**出遊分帳**的 Web 應用：純靜態前端（ES Modules），資料經 **Google Apps Script (GAS)** 讀寫 **Google 試算表**，瀏覽器端以 **localStorage** 快取並支援**離線 POST 佇列**，弱網或斷線時仍可操作、連線後自動補送。

---

## 目錄

- [技術棧與架構](#技術棧與架構)
- [功能總覽](#功能總覽)
- [專案結構](#專案結構)
- [本機開發](#本機開發)
- [設定與覆寫](#設定與覆寫)
- [資料模型與同步](#資料模型與同步)
- [後端（GAS）與試算表](#後端gas與試算表)
- [PWA 與 Service Worker](#pwa-與-service-worker)
- [部署](#部署)
- [測試](#測試)
- [效能與擴充規劃](#效能與擴充規劃)
- [疑難排解](#疑難排解)
- [維運與文件索引](#維運與文件索引)

---

## 技術棧與架構

| 層級 | 技術 |
|------|------|
| 前端 | HTML / CSS / 原生 JavaScript（ES Modules），無打包器 |
| 資料持久化 | Google 試算表（經 GAS Web App） |
| 本機快取 | `localStorage`（日常／出遊分鍵儲存） |
| 離線 | POST 佇列（FIFO）、Service Worker 靜態快取 |
| 測試 | [Vitest](https://vitest.dev/) |
| PWA | `manifest.json` + `sw.js` |

```mermaid
flowchart TB
  subgraph client [瀏覽器]
    UI[index.html + views]
    State[state.js allRows]
    Cache[localStorage]
    Outbox[POST outbox]
    UI --> State
    State --> Cache
    Outbox --> State
  end
  subgraph gas [Google Apps Script]
    doGet[doGet 讀三表]
    doPost[doPost appendRow]
    Drive[Drive 圖片]
    doGet --> Sheets
    doPost --> Sheets
    doPost --> Drive
  end
  Sheets[(試算表 日常/出遊/人物)]
  client <-->|GET JSON / POST JSON| gas
```

---

## 功能總覽

### 日常記帳

- 新增消費：均分、僅單方、兩人各付等分攤模式。
- 歷史紀錄：編輯分類、備註、照片、日期；支援作廢。
- **還款**：結算型紀錄，便於帳目歸零。
- 分類：可搭配 GAS 端 **Gemini** 自動建議類別（見 [docs/gas程式碼.md](docs/gas程式碼.md)）。

### 出遊分帳

- 建立行程、管理成員（多人）、行程色彩等。
- 消費紀錄：單人付款、多人出款、自訂分攤；可附註、照片、分類。
- **賭博模式**：表單與統計／分析頁可區分一般支出與賭博類別（圓餅與排行邏輯另有規則）。
- 行程統計：先付排行、分類圓餅、淨額與建議轉帳、收合式區塊等。
- **出遊詳情「歷史紀錄」**（`js/views-trip-detail.js`）：標題列可顯示行程日期區間；週曆列左右切週、點選單日篩選（再點同日取消＝**查看全部**）。**查看全部**時列表上方為「全部 · N 筆」與消費小計加總，**不依日期分組**；單日篩選時仍依該日顯示筆數與小計。收合區塊時不顯示標題列上的日期區間文案。
- 行程結束／重新開啟、成員改名／刪除、頭像與配色。
- 其他互動：例如抽籤、小遊戲等（見 `js/trip-lottery.js`、`js/trip-play-number-bomb.js`）。

### 分析頁

- 週期：本週／本月／本年（台北時區，見 `js/time.js`）。
- 兩人付出統計、分類圓餅（可切換顯示分類／比例／金額）。
- 含賭博時之輸贏／合計呈現與說明文案。

### 同步、備份與無障礙

- 同步狀態列：同步中／已同步／僅快取；背景輪詢發現資料變更可提示「資料已更新」。
- **備份與匯出**：CSV／文字備份（`js/backup.js`）；可清除本機快取（不刪試算表）。
- 對話框焦點陷阱、深色模式（`js/theme.js`）等。

---

## 專案結構

根目錄主要檔案：

| 路徑 | 說明 |
|------|------|
| [index.html](index.html) | 唯一 HTML 入口；含 `<base>` 修正（GitHub Pages 子路徑）、PWA meta |
| [css/](css/) | 全站樣式（依用途分多檔，載入順序見 `index.html`） |
| [manifest.json](manifest.json) | PWA 名稱、圖示、`start_url` |
| [sw.js](sw.js) | Service Worker；**`CACHE_NAME` 版本號**變更可強制更新快取資源 |
| [.nojekyll](.nojekyll) | GitHub Pages 不使用 Jekyll |

`js/` 模組職責精簡對照：

| 區塊 | 代表檔案 |
|------|----------|
| 啟動／路由 | `main.js`、`bootstrap.js`、`router.js`、`navigation.js` |
| 狀態 | `state.js`、`render-registry.js` |
| API／快取／離線 | `api.js`、`offline-queue.js`、`config.js` |
| 資料與模型 | `data.js`、`model.js` |
| 商業邏輯 | `finance.js`、`trip-stats.js`、`category.js`、`time.js` |
| 畫面 | `views-home.js`、`views-trips.js`、`views-trip-detail.js`、`views-analysis.js`、`views-shared.js` |
| 互動 | `actions.js`、`dialog.js`、`globals.js`（掛載 `window` 供 inline 呼叫） |
| 其他 | `pie-chart.js`、`sync-ui.js`、`sync-pause.js`、`session-ui.js`、`device-info.js`、`utils.js` |

**更細的檔案地圖**請見 [docs/project-structure.md](docs/project-structure.md)。

---

## 本機開發

### 需求

- **Node.js**（建議 LTS）：僅用於安裝 dev 依賴與執行測試。
- 可提供**靜態檔案**的本機伺服器（勿用 `file://` 開 `index.html`，ES Modules 會失敗）。

### 安裝

```bash
npm install
```

### 常用指令

| 指令 | 說明 |
|------|------|
| `npm test` | 執行 Vitest（`test/*.test.js`） |
| `npm run icons:flatten` | 圖示處理（見 `scripts/flatten-app-icons.mjs`） |
| `npm run icons:prepare` | 圖示處理（見 `scripts/prepare-app-icons.mjs`） |

### 啟動靜態伺服器（擇一）

```bash
python3 -m http.server 8080
# 或
npx serve
```

瀏覽器開啟對應網址（例如 `http://localhost:8080/`），勿省略子路徑規則時的尾隨 `/`（與線上 GitHub Pages 行為一致時較穩）。

---

## 設定與覆寫

### GAS Web App URL

- **預設**：`js/config.js` 內 `DEFAULT_API`。
- **覆寫方式 A**：在載入 `js/main.js` **之前**設定  
  `window.__LEDGER_API_URL__ = 'https://script.google.com/macros/s/.../exec'`
- **覆寫方式 B**：應用內呼叫 `setApiUrl(url)`（`js/actions.js`，並透過 `globals.js` 掛到介面）寫入 `localStorage` 鍵 `ledger_api_url_v1`。

重新部署 GAS 後，**部署 URL 可能變更**，務必同步更新前端。

### 日常帳兩位使用者名稱

`js/config.js`：

- `USER_A`、`USER_B`：影響結算顯示、分攤按鈕文案、分析頁標籤等。

### 時區

- `TIMEZONE`（預設 `Asia/Taipei`）：與分析週期、POST 附帶時刻等一致。

### 選用：`window` 旗標（載入 main 前設定）

| 旗標 | 效果 |
|------|------|
| `__LEDGER_APPEND_DEVICE__ = false` | POST 不附帶 `_clientDevice` |
| `__LEDGER_APPEND_POSTED_AT__ = false` | POST 不附帶 `_clientPostedAt`（僅時分秒，不含日期） |

詳見 [js/config.js](js/config.js) 註解。

---

## 資料模型與同步

### 事件列（Event log）

試算表儲存的是**事件**（`type` + `action`），例如 `add`／`edit`／`delete`／`void`。前端將多列事件**折疊**成畫面上的一筆筆紀錄（見 `js/data.js`、`js/model.js`）。  
同一 `id` 可能有多筆 `add`（重試造成），顯示與結算會**去重**。

### GET（全量拉取）

- `loadData()` 向 GAS 取得 **JSON 陣列**，正規化後寫入 `appState.allRows`，並 `saveCache()`。
- 具 timeout、重試、指數退避與 jitter（`GET_TIMEOUT_MS`、`GET_MAX_RETRIES` 等）。

### POST 與離線佇列

- 可重試的失敗會進入 **outbox**（`POST_OUTBOX_KEY`），連線恢復後自動依序送出。
- 與伺服端資料合併時，會處理**尚未上傳成功的 pending 列**（`mergeFreshWithOutboxBackedPending`）。

### 背景輪詢

- 間隔見 `POLL_MS`（預設 5 分鐘）；分頁隱藏、使用者正在表單輸入時會暫停或延後（`sync-pause.js`）。
- 若拉取結果與本地相同，可避免不必要重繪；有變更時可顯示更新提示。

### localStorage 鍵一覽

| 鍵 | 用途 |
|----|------|
| `gasRows_daily_v2` | 日常相關列快取 |
| `gasRows_trip_v2` | 出遊相關列快取 |
| `ledger_sync_last_at_v1` | 上次成功自 GAS 拉取並寫入的時間（ms） |
| `ledger_api_url_v1` | 覆寫 API URL |
| `ledger_post_outbox_v1` | POST 離線佇列 |
| `theme` | 深色模式偏好 |
| 其他 | 工作階段還原等（見 `session-ui.js`） |

舊版快取鍵在成功同步時會一併清除（`CACHE_LEGACY_KEYS`）。

---

## 後端（GAS）與試算表

專案內 **GAS 範例與說明**見 [docs/gas程式碼.md](docs/gas程式碼.md)（需自行建立 Apps Script 專案並綁定試算表）。

重點摘要：

- 工作表：**日常**、**出遊**、**人物**（若不存在會由程式建立）。
- **doGet**：讀取上述工作表 `getDataRange()`，合併為單一 JSON 陣列回傳。
- **doPost**：依 payload `appendRow`；可選 **Gemini** 推測分類（需 Script Properties 設定 API Key）。
- **圖片**：上傳至 Drive 指定資料夾子路徑（日常／出遊照片、頭像等），大小上限見該文件。

部署為「網路應用程式」時：

1. 執行身分通常為「我」。
2. 存取權需依實際使用者範圍設定（例如「任何人」或機構內）。
3. 每次新版本部署後確認 **URL 是否變更** 並更新前端。

---

## PWA 與 Service Worker

- 安裝至主畫面後以 `standalone` 顯示（見 `manifest.json`）。
- `sw.js` 快取靜態資源清單；**變更 `CACHE_NAME`**（例如 `ledger-v49` → `ledger-v50`）可讓既有使用者取得新 JS/CSS。
- 新增 `js/` 檔案且需離線可用時，記得把路徑加入 `STATIC_ASSETS`。

---

## 部署

### GitHub Pages

- 來源通常為 **`main` 分支根目錄**。
- 網址形如：`https://<帳號>.github.io/<repo>/`
- **務必使用結尾 `/` 的網址**（例如 `.../repo/`），避免相對路徑錯誤；`index.html` 內已用 `<base>` 輔助修正。
- 根目錄保留 `.nojekyll`。

### 發布後建議驗收

見 [docs/operations-checklist.md](docs/operations-checklist.md)。

---

## 測試

```bash
npm test
```

| 檔案 | 涵蓋方向 |
|------|----------|
| `test/finance.test.js` | 結餘、分攤、賭博情境等 |
| `test/data.test.js` | 事件列轉顯示資料 |
| `test/offline-queue.test.js` | 離線佇列與合併 |
| `test/trip-stats.test.js` | 行程統計摘要 |
| `test/utils.test.js` | 工具函式 |

設定檔：[vitest.config.js](vitest.config.js)。

---

## 效能與擴充規劃

試算表列數持續增加時，全量 GET 與前端重複掃描可能變慢。規劃稿（待體感需要再實作）：

- [docs/大量資料效能改善.md](docs/大量資料效能改善.md)

---

## 疑難排解

| 現象 | 建議 |
|------|------|
| 線上版仍是舊 UI | 強制重新整理（`Cmd+Shift+R` / `Ctrl+Shift+R`）；或關閉分頁重開；檢查 `sw.js` 快取版本是否已更新 |
| 長期「僅快取」或同步失敗 | 確認 `API_URL`、GAS 部署權限、試算表連結是否正常 |
| 新增後對方看不到 | 確認對方也完成同步；背景輪詢或手動重新整理 |
| 儲存空間／Quota | 快取含大量資料或照片 metadata 時可能觸頂；備份後使用「清除本地快取」再同步 |
| ES Module 載入失敗 | 勿用 `file://`；改用本機 HTTP 伺服器 |

---

## 維運與文件索引

| 文件 | 內容 |
|------|------|
| [docs/project-structure.md](docs/project-structure.md) | 檔案地圖（依職責分類） |
| [docs/workflow.md](docs/workflow.md) | 開發順序與同步重點 |
| [docs/operations-checklist.md](docs/operations-checklist.md) | 部署、驗收、排錯 |
| [docs/gas程式碼.md](docs/gas程式碼.md) | GAS 與試算表邏輯參考 |
| [docs/大量資料效能改善.md](docs/大量資料效能改善.md) | 大量資料時效能改善規劃 |

修改建議對照：

- 同步流程：`js/bootstrap.js`、`js/api.js`、`js/offline-queue.js`
- 畫面：`js/views-*.js` → `js/actions.js`（`js/actions/` 子模組）、`css/*.css`
- 結算與規則：`js/finance.js`、`js/data.js`、`js/model.js`
- PWA／離線資源：`sw.js`、`manifest.json`

---

## 授權與免責

本專案為私用記帳工具範本，可依需求自行修改延伸。正式多人共用時，建議補強：權限控管、稽核、錯誤追蹤、備份還原演練與端到端測試等。
