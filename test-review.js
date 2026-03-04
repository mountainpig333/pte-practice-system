const fs = require('fs');
const data = JSON.parse(fs.readFileSync('question-bank.json', 'utf-8'));

// 找出之前發現的問題題目
const mcma = data.MCMA || [];
const ro = data.RO || [];

// 抽樣測試：中文題目 + 格式錯誤的 MCMA
const problematic = [];
for (const q of mcma) {
    if (q.passage && /[\u4e00-\u9fa5]/.test(q.passage)) {
        problematic.push({ type: 'MCMA', issue: 'Chinese text', question: q });
        break;
    }
    if (q.options && q.options.length > 0 && q.options[0].length === 1) {
        problematic.push({ type: 'MCMA', issue: 'Options are single letters', question: q });
        break;
    }
}

// RO 格式問題
for (const q of ro.slice(0, 3)) {
    if (q.answer === 'correct' || q.answer === '1,2,3,4') {
        problematic.push({ type: 'RO', issue: 'Wrong answer format', question: q });
        break;
    }
}

console.log(JSON.stringify(problematic, null, 2));
