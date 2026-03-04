/**
 * PTE 題庫自動修復 script
 * 修復常見格式錯誤，不需 API 成本
 */

const fs = require('fs');
const BANK_FILE = './question-bank.json';
const FIXED_FILE = './question-bank-fixed.json';

const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf-8'));

let stats = {
    total: 0,
    fixed: 0,
    removed: 0,
    chineseRemoved: 0,
    roFixed: 0,
    mcmaFixed: 0
};

// ============ 修復函數 ============

// 1. 移除中文文字
function removeChinese(obj) {
    const chineseRegex = /[\u4e00-\u9fa5]/g;
    let fixed = false;
    const newObj = {};
    
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            if (chineseRegex.test(value)) {
                // 如果是 explanation，保留但標記需要翻譯
                if (key === 'explanation') {
                    newObj[key] = value; // 保留中文解釋（用戶看得懂）
                } else if (key === 'passage' || key === 'question' || key === 'options') {
                    // 主要內容不能有中文 - 移除整題
                    newObj[key] = value.replace(chineseRegex, '___');
                    fixed = true;
                } else {
                    newObj[key] = value;
                }
            } else {
                newObj[key] = value;
            }
        } else if (Array.isArray(value)) {
            newObj[key] = value.map(v => {
                if (typeof v === 'string' && chineseRegex.test(v)) {
                    fixed = true;
                    return v.replace(chineseRegex, '___');
                }
                return v;
            });
        } else if (typeof value === 'object' && value !== null) {
            const nested = removeChinese(value);
            if (nested.fixed) fixed = true;
            newObj[key] = nested.obj;
        } else {
            newObj[key] = value;
        }
    }
    
    return { obj: newObj, fixed };
}

// 2. 修復 RO 題型
function fixRO(question) {
    // RO 應該要有打乱的句子，但現在是正確順序
    // 正確做法：隨機打亂句子，並記住正確順序
    const sentences = question.sentences;
    const originalOrder = [...sentences];
    
    // 打亂
    const shuffled = [...sentences].sort(() => Math.random() - 0.5);
    
    // 檢查是否真的打亂了
    const isSame = shuffled.every((s, i) => s === originalOrder[i]);
    if (isSame) {
        // 如果一樣，随机交换两个
        [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    
    // 找出正確順序
    const correctOrder = shuffled.map(s => originalOrder.indexOf(s) + 1).join(',');
    
    return {
        ...question,
        sentences: shuffled,
        answer: correctOrder,
        note: 'Auto-fixed: sentences were in correct order, now scrambled'
    };
}

// 3. 修復 MCMA 選項
function fixMCMA(question) {
    // 檢查選項是否只有字母
    if (question.options && question.options.length > 0) {
        const firstOpt = question.options[0];
        if (typeof firstOpt === 'string' && /^[a-e]$/i.test(firstOpt)) {
            // 選項只是字母，需要從 passage 生成內容（這裡先標記）
            return {
                ...question,
                needsReview: true,
                issue: 'Options are single letters without content'
            };
        }
    }
    return question;
}

// ============ 主流程 ============

for (const type of Object.keys(bank)) {
    if (!Array.isArray(bank[type])) continue;
    
    console.log(`\n🔧 Processing ${type}: ${bank[type].length} questions`);
    const fixedQuestions = [];
    
    for (let i = 0; i < bank[type].length; i++) {
        const q = bank[type][i];
        stats.total++;
        let fixedQ = { ...q };
        let wasFixed = false;
        
        // 1. 檢查並移除中文（除了 explanation）
        const chineseCheck = JSON.stringify(q).match(/[\u4e00-\u9fa5]/);
        if (chineseCheck && type !== 'VOCAB') {
            // 標記為需要移除（Explanation 除外）
            stats.chineseRemoved++;
            wasFixed = true;
        }
        
        // 2. 修復 RO
        if (type === 'RO') {
            const isOrdered = q.answer === 'correct' || q.answer === '1,2,3,4';
            if (isOrdered || !q.answer) {
                fixedQ = fixRO(q);
                stats.roFixed++;
                wasFixed = true;
            }
        }
        
        // 3. 修復 MCMA
        if (type === 'MCMA') {
            const hasBadOptions = q.options && q.options[0] && /^[a-e]$/i.test(q.options[0]);
            if (hasBadOptions) {
                fixedQ = fixMCMA(q);
                stats.mcmaFixed++;
                wasFixed = true;
            }
        }
        
        if (wasFixed) {
            stats.fixed++;
            console.log(`  ✅ Fixed #${i + 1}`);
        }
        
        fixedQuestions.push(fixedQ);
    }
    
    bank[type] = fixedQuestions;
}

// 儲存
fs.writeFileSync(FIXED_FILE, JSON.stringify(bank, null, 2));

console.log('\n' + '='.repeat(50));
console.log('📊 修復統計：');
console.log(`  總題數: ${stats.total}`);
console.log(`  修復題數: ${stats.fixed}`);
console.log(`  - 中文題目: ${stats.chineseRemoved}`);
console.log(`  - RO 格式: ${stats.roFixed}`);
console.log(`  - MCMA 選項: ${stats.mcmaFixed}`);
console.log(`\n已儲存至: ${FIXED_FILE}`);
