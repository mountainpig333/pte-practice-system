/**
 * MCMA 答案修復 script
 * 使用 MiniMax 分析每題並給出正確答案
 */

const fs = require('fs');
const MINIMAX_KEY = 'sk-cp-hAhpYJEvRwEIVIf9s5LXX_T5a-gF92UzaxOKTV8AYyGByM--m0N1VpW8YrrVdhT4sXI7DY399dLmutEVjKO-8ZDumntlks4v_uU09hM3GOblH9nJyTXDf34';

const BANK_FILE = './question-bank.json';

async function callAPI(prompt) {
    const r = await fetch('https://api.minimax.io/anthropic/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': MINIMAX_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'MiniMax-M2.5',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }]
        })
    });
    const data = await r.json();
    return data.content?.[0]?.text || '';
}

async function fixMCMA() {
    const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf-8'));
    const mcma = bank.MCMA || [];
    
    let fixed = 0;
    let skipped = 0;
    
    console.log(`開始修復 ${mcma.length} 題 MCMA...\n`);
    
    for (let i = 0; i < mcma.length; i++) {
        const q = mcma[i];
        
        // 如果已有答案，跳過
        if (q.answer && q.answer.length > 0) {
            skipped++;
            continue;
        }
        
        const prompt = `Based on the following PTE question, determine the correct answer(s). 
Return ONLY a JSON array of option letters (e.g., ["a", "b", "d"]):

Question: ${q.question}
Options: ${q.options.map((o, i) => `${String.fromCharCode(97+i)}. ${o}`).join(', ')}

Analysis guide:
- Choose 2-3 most correct answers
- Each option should be factually supported by the question context
- Return just the letters in order like ["a", "b", "c"]`;

        try {
            const resp = await callAPI(prompt);
            const match = resp.match(/\[[\["'\w,\s]+\]/);
            if (match) {
                const answers = JSON.parse(match[0].replace(/'/g, '"'));
                mcma[i].answer = answers;
                fixed++;
                console.log(`  ✅ ${i+1}: ${answers.join(', ')}`);
            } else {
                console.log(`  ⚠️ ${i+1}: 無法解析`);
            }
        } catch (e) {
            console.log(`  ❌ ${i+1}: ${e.message}`);
        }
        
        // API 間隔
        await new Promise(r => setTimeout(r, 1500));
        
        // 每 10 題儲存一次
        if (fixed % 10 === 0 && fixed > 0) {
            fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2));
            console.log(`  💾 已儲存進度\n`);
        }
    }
    
    // 最終儲存
    fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2));
    
    console.log(`\n完成！`);
    console.log(`  修復: ${fixed}`);
    console.log(`  跳過: ${skipped}`);
}

fixMCMA().catch(console.error);
