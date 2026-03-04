/**
 * PTE 題庫自動審核與修正
 * 使用 Claude Sonnet 檢查並自動修正題目錯誤
 */

const fs = require('fs');
const ANTHROPIC_API_KEY = 'sk-ant-api03-oZRxn1JTxjFV6nHSuR1X9L74MJRxPw2-J8Lp72hqhCVVgb_FS9gXh4V-4_j3T3Ai6_JRbSUq2CbMr2CgR6zJ0lHQAA';
const BANK_FILE = './question-bank.json';
const LOG_FILE = './review-log.json';

// ============ Claude API ============
async function callClaude(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }]
        })
    });
    
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    return result.content[0].text;
}

// ============ 審核單一題目 ============
async function reviewQuestion(question, type) {
    const prompt = `You are a PTE Academic exam quality checker. Review this ${type} question and check for:

1. Language errors (must be English only, no Chinese/other languages)
2. Format errors (missing content, wrong structure)
3. Answer correctness
4. Logical consistency

Question:
${JSON.stringify(question, null, 2)}

Rules for each type:
- FIB: Question must have blank (______), 4 options, 1 correct answer
- MCSA: Passage + question + 4 options (a/b/c/d) + 1 answer
- MCMA: Passage + question + 5 options + 2-3 answers array
- RO: 4 sentences in SCRAMBLED order + correct order as answer (e.g., "2,4,1,3")
- RWFIB: Paragraph with 3 blanks + each blank has 4 options + answers

Return ONLY JSON:
{
  "valid": true/false,
  "errors": ["error1", "error2"] or [],
  "fixed": <corrected question object> or null
}

If valid=true, return the original question in "fixed".
If valid=false, provide corrected version in "fixed" (fix all errors).
If unfixable, set fixed=null.`;

    const responseText = await callClaude(prompt);
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
}

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
                console.log(`  ${i + 1}/${bank[type].length} - Checking...`);
                const result = await reviewQuestion(q, type);
                log.reviewed++;
                
                if (result.valid) {
                    fixedQuestions.push(result.fixed || q);
                } else if (result.fixed) {
                    console.log(`  ⚠️ Fixed: ${result.errors.join(', ')}`);
                    fixedQuestions.push(result.fixed);
                    log.fixed++;
                    if (!log.errors[type]) log.errors[type] = [];
                    log.errors[type].push({ index: i, errors: result.errors });
                } else {
                    console.log(`  ❌ Removed: ${result.errors.join(', ')}`);
                    log.removed++;
                    if (!log.errors[type]) log.errors[type] = [];
                    log.errors[type].push({ index: i, errors: result.errors, removed: true });
                }
                
                // Rate limit: 每次 API 呼叫間隔 1 秒
                await new Promise(r => setTimeout(r, 1000));
                
            } catch (e) {
                console.error(`  ❌ Error reviewing question ${i}: ${e.message}`);
                // 保留原題目（寧可有錯也不要遺失）
                fixedQuestions.push(q);
            }
        }
        
        bank[type] = fixedQuestions;
        console.log(`  ✅ ${type}: ${fixedQuestions.length} questions (fixed: ${log.fixed}, removed: ${log.removed})`);
    }
    
    // 儲存修正後的題庫
    fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2));
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
    
    // 統計
    console.log('\n' + '='.repeat(50));
    console.log('📊 審核完成：');
    console.log(`  總題數: ${log.total}`);
    console.log(`  已審核: ${log.reviewed}`);
    console.log(`  已修正: ${log.fixed}`);
    console.log(`  已移除: ${log.removed}`);
    console.log(`\n詳細日誌: ${LOG_FILE}`);
}

reviewAll().then(() => console.log('\n✅ Done!')).catch(e => console.error('Fatal:', e));
