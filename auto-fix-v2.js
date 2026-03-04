/**
 * PTE 題庫自動修復 v2
 * 修復常見格式問題
 */

const fs = require('fs');
const BANK_FILE = './question-bank.json';
const FIXED_FILE = './question-bank-fixed.json';

const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf-8'));

let stats = {
    chineseFixed: 0,
    roFixed: 0,
    mcmaFixed: 0,
    mcsaFixed: 0,
    total: 0
};

// 移除中文
function removeChinese(str) {
    return str.replace(/[\u4e00-\u9fff]/g, '___');
}

// 修復 RO - 打亂句子順序
function fixRO(q) {
    const sentences = q.sentences || [];
    if (sentences.length < 2) return q;
    
    const original = [...sentences];
    let shuffled = [...sentences].sort(() => Math.random() - 0.5);
    
    // 確保真的打亂了
    const isSame = shuffled.every((s, i) => s === original[i]);
    if (isSame) [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    
    // 計算正確順序
    const correctOrder = shuffled.map(s => original.indexOf(s) + 1).join(',');
    
    return {
        ...q,
        sentences: shuffled,
        answer: correctOrder
    };
}

// 修復 MCSA 答案格式
function fixMCSA(q) {
    const answer = q.answer;
    if (!answer) return q;
    
    const options = q.options || [];
    
    // 如果答案是完整句子，找對應的選項字母
    if (answer.length > 5) {
        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            if (typeof opt === 'string' && answer.toLowerCase().includes(opt.toLowerCase().slice(0, 20))) {
                return { ...q, answer: String.fromCharCode(97 + i) }; // a, b, c, d
            }
        }
    }
    return q;
}

// 主流程
for (const type of Object.keys(bank)) {
    if (!Array.isArray(bank[type])) continue;
    
    const fixed = [];
    for (const q of bank[type]) {
        stats.total++;
        let fq = { ...q };
        let fixedThis = false;
        
        // 1. 移除中文
        if (q.question && /[\u4e00-\u9fff]/.test(q.question)) {
            fq.question = removeChinese(q.question);
            stats.chineseFixed++;
            fixedThis = true;
        }
        if (q.passage && /[\u4e00-\u9fff]/.test(q.passage)) {
            fq.passage = removeChinese(q.passage);
            stats.chineseFixed++;
            fixedThis = true;
        }
        
        // 2. 修復 RO
        if (type === 'RO') {
            const ans = String(q.answer || '');
            if (ans === 'correct' || ans === '1,2,3,4' || ans === '') {
                fq = fixRO(q);
                stats.roFixed++;
                fixedThis = true;
            }
        }
        
        // 3. 修復 MCMA
        if (type === 'MCMA') {
            const opts = q.options || [];
            if (opts.length > 0 && typeof opts[0] === 'string' && opts[0].length <= 2) {
                // 標記需要人工處理
                fq.needsReview = true;
                stats.mcmaFixed++;
            }
        }
        
        // 4. 修復 MCSA
        if (type === 'MCSA') {
            const ans = q.answer;
            if (ans && typeof ans === 'string' && ans.length > 5) {
                fq = fixMCSA(q);
                if (fq.answer !== ans) {
                    stats.mcsaFixed++;
                    fixedThis = true;
                }
            }
        }
        
        fixed.push(fq);
    }
    
    bank[type] = fixed;
}

// 儲存
fs.writeFileSync(FIXED_FILE, JSON.stringify(bank, null, 2));

console.log('📊 修復結果：');
console.log('='.repeat(40));
console.log(`  總題數: ${stats.total}`);
console.log(`  中文修復: ${stats.chineseFixed}`);
console.log(`  RO 修復: ${stats.roFixed}`);
console.log(`  MCMA 需複檢: ${stats.mcmaFixed}`);
console.log(`  MCSA 修復: ${stats.mcsaFixed}`);
console.log('='.repeat(40));
console.log(`\n✅ 已儲存至: ${FIXED_FILE}`);
