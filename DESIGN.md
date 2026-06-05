# Hukeep Accounts Design Direction

靈感來源：

- [`voltagent/awesome-design-md`](https://github.com/voltagent/awesome-design-md)
- [`getdesign.md / binance / design-md`](https://getdesign.md/binance/design-md)

這個專案不是展示頁，而是會被反覆打開的記帳工具，所以設計方向不是「做得花」，而是讓人更快看懂帳、快速記帳、在深色模式下也能長時間使用。

## Product Shape

- 產品角色：雙人與多人共用的記帳工作台
- 核心任務：快速輸入、即時對帳、旅遊共同支出整理、期間分析
- 使用情境：手機直向為主，短時間高頻操作，常在移動中使用

## Visual Direction

### Light mode

- 像整理過的財務工作台，不是行銷 landing page
- 正常模式走「精緻紙面 + 清楚資料層級」：乾淨白色主面板、細緻 hairline、溫和陰影
- 保留空氣感，但資訊分區要明確，避免整頁只剩藍色霧面
- 主色用在狀態、行動和焦點，輔以中性灰與少量琥珀色形成財務工具的辨識度
- 正常模式避免藍綠漸層，主要行動使用單一主色或同色系淡底
- 卡片要像工作台上的資訊片，不像漂浮玻璃物件

### Dark mode

- 採 Binance 風格：深炭黑底、低反光面板、暖黃重點色
- 強調密度、掃描效率、狀態清晰度
- 主要 CTA、目前頁籤、焦點 ring 都以金黃色系呈現
- 背景比淺色模式更克制，避免過多藍紫光暈
- 參考 token：
  - canvas `#0b0e11`
  - card `#1e2329`
  - hairline `#2b3139`
  - text `#eaecef`
  - muted `#707a8a`
  - primary `#fcd535`
  - primary-active `#f0b90b`

## Interface Rules

- Header 要像工作台工具列，精簡但有狀態感
- 重要卡片分成 hero、workspace、history 三類，不混用語氣
- 所有數字資訊使用 tabular numerals
- 搜尋列、表單、分攤 chips、切換 tabs 都要共用同一套圓角與邊框邏輯
- 旅遊頁與分析頁的資訊密度可以高，但必須維持明確對齊
- 手機寬度下，四欄切換按鈕可降成兩排，避免字被擠壞

## Reusable Patterns

- `card-kicker + card-title`：建立卡片層級
- `header-meta`：短狀態、數量、期間
- `analysis-tab`：分段切換，不再用 inline style
- `record-search`：所有列表的同一種搜尋入口
- `workspace card`：輸入、設定、成員管理都用同一種表面語言
- `binance dark tokens`：只套用在深色模式，淺色模式維持本專案工作台調性

## Do Not

- 不要把每個區塊都做成不同風格
- 不要讓深色模式只是把背景變黑
- 不要讓主要操作靠顏色之外的弱訊號辨識
- 不要讓按鈕、chips、搜尋列出現各自不同的圓角和陰影規則
