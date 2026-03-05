/**
 * 補充 MCMA 題目
 * 目標: 20 題
 */

const fs = require('fs');
const MINIMAX_KEY = 'sk-cp-hAhpYJEvRwEIVIf9s5LXX_T5a-gF92UzaxOKTV8AYyGByM--m0N1VpW8YrrVdhT4sXI7DY399dLmutEVjKO-8ZDumntlks4v_uU09hM3GOblH9nJyTXDf34';

const BANK_FILE = './question-bank.json';

const TOPICS = [
    'climate change', 'artificial intelligence', 'renewable energy',
    'healthcare', 'education', 'global trade', 'urban planning',
    'social media', 'economic inequality', 'biodiversity'
];

function randomTopic() {
    return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

async function callAPI(prompt, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const r = await fetch('https://api.minimax.io/anthropic/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': MINIMAX_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'MiniMax-M2.5',
                    max_tokens: 1500,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await r.json();
            const text = data.content?.[0]?.text || '';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                // 確保是英文
                const jsonStr = JSON.stringify(parsed);
                if (/[\u4e00-\u9fff]/.test(jsonStr)) {
                    console.log(`  ⚠️ Generated Chinese, retrying...`);
                    throw new Error('Chinese detected');
                }
                return parsed;
            }
            throw new Error('No JSON found');
        } catch (e) {
            console.log(`  ⚠️ Attempt ${i+1} failed: ${e.message}`);
            if (i < retries - 1) await new Promise(r => setTimeout(r, 3000));
        }
    }
    return null;
}

async function generateMCMA() {
    const topic = randomTopic();
    const prompt = `Generate 1 PTE MCMA (Multiple Choice Multiple Answer) question about ${topic}.
    
Return ONLY valid JSON with this exact structure:
{
  "type": "MCMA",
  "passage": "A 80-120 word English paragraph about ${topic}",
  "question": "A question ending with '(select all that apply)'",
  "options": ["Option A", "Option B", "Option C", "Option D", "Option E"],
  "answer": ["a", "b", "d"],
  "explanation": "English explanation of why these answers are correct.",
  "difficulty": "medium",
  "topic": "${topic}"
}

IMPORTANT: Use ONLY English. No Chinese characters allowed.`;

    return await callAPI(prompt);
}

async function main() {
    const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf-8'));
    
    const needed = 20;
    console.log(`生成 ${needed} 題 MCMA...\n`);
    
    for (let i = 0; i < needed; i++) {
        console.log(`  ${i+1}/${needed}: Generating...`);
        const q = await generateMCMA();
        if (q) {
            bank.MCMA = bank.MCMA || [];
            bank.MCMA.push(q);
            console.log(`  ✅ Done: ${q.topic}`);
        } else {
            console.log(`  ❌ Failed`);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    
    // Save
    fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2));
    
    console.log(`\n✅ 完成！MCMA 總數: ${bank.MCMA?.length || 0}`);
}

main().catch(console.error);
