# PTE 練習系統

從經濟學人文章生成 PTE 考試練習題目。

## 功能

- 📖 **Read Aloud (RA)** - 朗讀句子
- 🔊 **Repeat Sentence (RS)** - 複誦句子  
- ✏️ **Fill in the Blanks (FIB)** - 填空題
- 🔢 **Re-order Paragraphs (RO)** - 排序題
- ✅ **Multiple Choice (MC)** - 選擇題
- ⌨️ **Write from Dictation (WFD)** - 聽寫題

## 安裝

```bash
cd pte-practice-system
npm install
```

## 執行

```bash
npm start
```

## 登入

- 用戶名: `admin`
- 密碼: `PTE2026`

## 部署到 Render

1. 推送到 GitHub
2. 在 Render 上創建新的 Web Service
3. Build Command: `npm install`
4. Start Command: `node server.js`

## 環境變數

- `PORT`: 伺服器端口 (預設 3000)
- `GEMINI_API_KEY`: Gemini API Key (用於生成題目)
