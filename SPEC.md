# PTE 英文學習系統 - 規格說明書

## 1. 專案概述

- **專案名稱**：PTE 練習系統 (PTE Practice Hub)
- **目的**：幫助使用者準備 PTE 考試，從經濟學人文章中生成練習題目
- **目標使用者**：準備 PTE 學術英語考試的學習者

## 2. 功能需求

### 2.1 文章管理
- 每日新增 2-3 篇經濟學人文章
- 每篇文章包含：標題、原文內容、日期
- 自動從文章中提取關鍵字和句子

### 2.2 題目生成（仿照 PTE 题型）

#### Read Aloud (RA)
- 從文章中隨機選擇句子
- 要求使用者朗讀並錄音
- 評估發音、流暢度

#### Repeat Sentence (RS)
- 播放句子後要求使用者複誦
- 評估記憶與發音

#### Fill in the Blanks (FIB)
- 從文章中移除關鍵單字
- 選擇正確答案

#### Re-order Paragraphs (RO)
- 將文章段落打亂
- 需要正確排序

#### Multiple Choice (MC)
- 選擇正確答案
- 單選/多選

#### Write from Dictation (WFD)
- 播放句子後拼寫出來
- 評估聽力與拼寫

### 2.3 學習進度
- 每日答題統計
- 正確率追蹤
- 歷史紀錄

### 2.4 認證
- 密碼登入保護
- 個人化學習數據

## 3. 技術架構

### 前端
- HTML/CSS/JavaScript
- 響應式設計

### 後端
- Node.js + Express
- SQLite 資料庫

### API
- Gemini Vision API（OCR/文章分析）

## 4. 頁面結構

```
/                   - 登入頁面
/dashboard          - 儀表板（每日練習入口）
/practice/ra        - Read Aloud 練習
/practice/fib      - Fill in the Blanks 練習
/practice/ro       - Re-order Paragraphs 練習
/practice/mc       - Multiple Choice 練習
/practice/wfd      - Write from Dictation 練習
/history           - 學習歷史
/articles          - 文章管理
```

## 5. PTE 題型詳細說明

### Read Aloud (RA)
- 顯示文章句子
- 計時器（40秒準備+40秒朗讀）
- 錄音功能

### Repeat Sentence (RS)
- 播放音頻
- 顯示評估結果

### Fill in the Blanks (FIB)
- 顯示有空格的句子
- 4個選項
- 計時

### Re-order Paragraphs (RO)
- 顯示打亂的句子
- 拖曳排序
- 提交後顯示正確答案

### Write from Dictation (WFD)
- 播放音頻
- 文字輸入
- 顯示正確答案
