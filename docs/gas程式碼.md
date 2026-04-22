# GAS 程式碼

目前文件版 GAS 已改成和實作版相同的 `current-state + archive` 架構。

實際要部署到 Google Apps Script 的來源檔，請以：

- [gas/current-state.gs](/Users/alen/Documents/Codex/2026-04-22-github-plugin-github-openai-curated-gthub/hukeep-accounts/gas/current-state.gs)

為主。這份文件主要說明工作表結構、行為規則與部署流程，避免文件和實作再次分岐。

## 架構

### Active 工作表

- `日常消費`
- `日常還款`
- `行程`
- `出遊消費`
- `出遊還款`
- `成員`
- `頭像`

這些工作表只保留目前有效的 current state。

其中會進入歷史紀錄的帳務資料，若被使用者「撤回」，不會真的刪列，而是直接把 active 列標成 `voided=true`：

- `日常消費`
- `日常還款`
- `出遊消費`
- `出遊還款`

### Archive 工作表

- `封存_日常事件`
- `封存_出遊事件`
- `封存_人物事件`

這些工作表保留完整事件歷程。

## 行為規則

### 新增

- `add`：寫入 active 表
- 同時 append 一筆相同 payload 到 archive 表

### 編輯

- `edit`：直接覆寫 active 表對應列
- 同時 append 一筆 `edit` 事件到 archive

規則：

- 金額變更要保留歷史，所以 `tripExpense.amount` 的編輯仍會寫入 archive，供前端查修訂紀錄
- 備註與分類在 active 內直接覆蓋即可；archive 仍會保留這次 edit 事件，但顯示層目前只取金額歷程

### 撤回

以下資料只允許撤回，不允許真刪除：

- `daily`
- `settlement`
- `tripExpense`
- `tripSettlement`

行為：

- active 列保留
- 將 `voided` 設為 `true`
- append 一筆 `void` 或 `delete` 事件到 archive

### 真刪除

以下資料可以真刪除：

- `trip`：刪除整個行程，並級聯刪除 active 中關聯的出遊消費與出遊還款
- `memberProfile`：以 `deleted=true` 標記成員已移除

## 歷史查詢

`doGet` 預設只回 active current state。

若要查單筆歷史，使用：

```text
GET ?mode=history&type=tripExpense&id=<id>
```

若只帶 `type`（不帶 `id`），會回該 type 的完整 archive 歷史。

目前前端用它來顯示出遊消費的金額修訂紀錄。

## 試算表遷移

如果舊試算表還是 append-only 的：

1. 保留舊工作表 `日常`、`出遊`、`人物`
2. 將 [gas/current-state.gs](/Users/alen/Documents/Codex/2026-04-22-github-plugin-github-openai-curated-gthub/hukeep-accounts/gas/current-state.gs) 貼到 Apps Script
3. 執行 `migrateLegacyEventsToCurrentState()`

結果：

- 舊事件會先複製到 archive 工作表
- active 工作表會重建成 current-state
- 舊的撤回資料會保留在 active 並標成 `voided=true`
- 若 legacy 分頁沒有資料，`migrateLegacyEventsToCurrentState()` 會直接結束，不會清空 active

## 圖片與頭像

GAS 仍支援把 `photoDataUrl` / `avatarDataUrl` 上傳到 Google Drive，再把：

- `photoUrl`
- `photoFileId`
- `avatarUrl`
- `avatarFileId`

回填到 active 與 archive。

## 部署方式

1. 建立或打開綁定試算表的 Apps Script 專案
2. 將 [gas/current-state.gs](/Users/alen/Documents/Codex/2026-04-22-github-plugin-github-openai-curated-gthub/hukeep-accounts/gas/current-state.gs) 內容貼上
3. 視需要設定 Script Properties：
   - `GEMINI_API_KEY`
   - `PHOTO_FOLDER_ID`
4. 部署為 Web App
5. 把新 URL 更新到 [js/config.js](/Users/alen/Documents/Codex/2026-04-22-github-plugin-github-openai-curated-gthub/hukeep-accounts/js/config.js)

## 維護原則

- 文件與實作若有差異，以 [gas/current-state.gs](/Users/alen/Documents/Codex/2026-04-22-github-plugin-github-openai-curated-gthub/hukeep-accounts/gas/current-state.gs) 為準
- 後續若再改 GAS，記得同步更新這份文件與 README 的後端摘要
