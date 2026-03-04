/**
 * PTE 題庫自動審核與修正 (使用 MiniMax)
 * 檢查並自動修正題目錯誤
 */

const fs = require('fs');
const MINIMAX_API_KEY = 'sk-cp-hAhpYJEvRwEIVIf9s5LXX_T5a-gF92UzaxOKTV8AYyGByM--m0N1VpW8YrrVdhT4sXI7DY399dLmutEVjKO-8ZDumntlks4v_uU09hM3GOblH9nJyTXDf34';
const BANK_FILE = './question-bank.json';
const LOG_FILE = './review-log.json';

// ============ MiniMax API ============
async function callLLM(prompt, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);
            
            const r = await fetch('https://api.minimax.io/anthropic/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': MINIMAX_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'MiniMax-M2.5',
                    max_tokens: 4096,
                    messages: [{ role: 'user', content: prompt }]
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            const result = await r.json();
            if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
            const textBlock = result.content?.find(b => b.type === 'text');
            return (textBlock?.text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        } catch (e) {
            if (attempt < retries) {
                console.log(`    ⚠️ Attempt ${attempt} failed: ${e.message}, retrying in 3s...`);
                await new Promise(r => setTimeout(r, 3000));
            } else {
                throw e;
            }
        }
    }
}

// ============ 審核 Prompt ============
const REVIEW_PROMPT = `你是 PTE Academic 考試題目品質檢查員。請審查以下題目並檢查：

1. 語言錯誤（必須只有英文，不能有中文或其他語言）
2. 格式錯誤（缺少內容、结构错误）
3. 答案正確性
4. 邏輯一致性

題目類型: {TYPE}

題目:
{Q}

規則:
- FIB: 題目要有空白(______), 4個選項, 1個正確答案
- MCSA: 短文 + 問題 + 4個選項(a/b/c/d) + 1個答案
- MCMA: 短文 + 問題 + 5個選項 + 2-3個答案陣列
- RO: 4個句子應該隨機排列(打亂順序) + 正確順序答案(如 "2,4,1,3")
- RWFIB: 段落有3個空白 + 每個空白4個選項 + 答案

只返回 JSON:
{{
  "valid": true/false,
  "errors": ["錯誤1", "錯誤2"],
  "fixed": <修正後的題目物件> 或 null,
  "remove": true/false
}}

如果 valid=true，fixed 返回原題目。
如果 valid=false 且可以修正，fixed 返回修正後的題目。
如果無法修正，fixed=null 且 remove=true。`;

// ============ 主流程 ============
async function reviewAll() {
    const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf-8'));
    const log = { total: 0, reviewed: 0, fixed: 0, removed: 0, errors: {} };
    
    const types = ['FIB', 'MCSA', 'MCMA', 'RO', 'RWFIB', 'SWT', 'WFD', 'HCS', 'HIW', 'VOCAB'];
    
    for (const type of types) {
        if (!bank[type] || bank[type].length === 0) continue;
        
        console.log(`\n🔍 Reviewing ${type}: ${bank[type].length} questions`);
        const fixedQuestions = [];
        
        for (let i = 0; i < bank[type].length; i++) {
            const q = bank[type][i];
            log.total++;
            
            try {
                const prompt = REVIEW_PROMPT
                    .replace('{TYPE}', type)
                    .replace('{Q}', JSON.stringify(q, null, 2));
                
                console.log(`  ${i + 1}/${bank[type].length} - Reviewing...`);
                const text = await callLLM(prompt);
                const result = JSON.parse(text);
                log.reviewed++;
                
                if (result.valid) {
                    fixedQuestions.push(result.fixed || q);
                } else if (result.fixed && !result.remove) {
                    console.log(`  ✅ Fixed: ${result.errors.join(', ')}`);
                    fixedQuestions.push(result.fixed);
                    log.fixed++;
                } else {
                    console.log(`  ❌ Removed: ${result.errors.join(', ')}`);
                    log.removed++;
                }
                
                if (!log.errors[type]) log.errors[type] = [];
                log.errors[type].push({ index: i, ...result });
                
                // Rate limit: 每次 API 呼叫間隔 2 秒
                await new Promise(r => setTimeout(r, 2000));
                
            } catch (e) {
                console.error(`  ⚠️ Error: ${e.message}, keeping original`);
                fixedQuestions.push(q);
            }
        }
        
        bank[type] = fixedQuestions;
        console.log(`  📊 ${type}: ${fixedQuestions.length} remaining`);
    }
    
    // 儲存修正後的題庫
    fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2));
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 審核完成：');
    console.log(`  總題數: ${log.total}`);
    console.log(`  已審核: ${log.reviewed}`);
    console.log(`  已修正: ${log.fixed}`);
    console.log(`  已移除: ${log.removed}`);
    console.log(`\n詳細日誌: ${LOG_FILE}`);
}

reviewAll().then(() => console.log('\n✅ Done!')).catch(e => console.error('Fatal:', e));
