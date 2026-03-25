#!/bin/bash
# PTE 文章上傳腳本

ARTICLE_DIR="$HOME/.openclaw/workspace/economist-articles"

echo "📁 經濟學人文章列表："
ls -1 "$ARTICLE_DIR"/*.md 2>/dev/null | nl

echo ""
echo "選擇要上傳的文章編號："
read num

ARTICLE_FILE=$(ls -1 "$ARTICLE_DIR"/*.md 2>/dev/null | sed -n "${num}p")

if [ -z "$ARTICLE_FILE" ]; then
    echo "❌ 無效的編號"
    exit 1
fi

# 提取標題（去掉日期前綴）
TITLE=$(basename "$ARTICLE_FILE" .md | sed 's/^[0-9-]*-//' | sed 's/-/ /g')

# 讀取內容（跳過標題行）
CONTENT=$(tail -n +15 "$ARTICLE_FILE" | head -50)

echo "📤 上傳中：$TITLE"
echo "$CONTENT" | head -5
echo "..."

# 這裡需要先登入才能上傳
# 請在瀏覽器手動登入：https://pte-practice-system.onrender.com/
# 登入後再執行這個腳本

echo ""
echo "⚠️ 請先在瀏覽器登入：https://pte-practice-system.onrender.com/"
echo "   用戶名: admin"
echo "   密碼: PTE2026"
echo ""
echo "登入完成後告訴我，我會幫你上傳"