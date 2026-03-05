/**
 * 補充缺失題目 script
 * 目標: MCMA + MCSA = 170 題
 */

const fs = require('fs');
const MINIMAX_KEY = 'sk-cp-hAhpYJEvRwEIVIf9s5LXX_T5a-gF92UzaxOKTV8AYyGByM--m0N1VpW8YrrVdhT4sXI7DY399dLmutEVjKO-8ZDumntlks4v_uU09hM3GOblH9nJyTXDf34';

const BANK_FILE = './question-bank.json';

const TOPICS = [
    'climate change and environment', 'technology and innovation', 'health and medicine',
    'education and learning', 'business and economy', 'science and research',
    'social issues and society', 'history and culture', 'politics and governance',
    'urban planning and development'
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
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
            throw new Error('No JSON found');
        } catch (e) {
            console.log(`  ⚠️ Attempt ${i+1} failed: ${e.message}`);
            if (i < retries - 1) await new Promise(r => setTimeout(r, 3000));
        }
    }
    return null;
}

async function generateMCSA() {
    const topic = randomTopic();
    const prompt = `Generate 1 PTE MCSA (Multiple Choice Single Answer) question about ${topic}.
    
Return ONLY valid JSON with this exact structure:
{
  "type": "MCSA",
  "passage": "A 60-100 word paragraph about ${topic}",
  "question": "A clear question about the passage",
  "options": ["Option A (full sentence)", "Option B", "Option C", "Option D"],
  "answer": "a",
  "explanation": "Why the answer is correct"
}

Requirements:
- Passage must be 60-100 words
- All options must be full sentences (not just letters)
- Answer must be a single letter (a, b, c, or d)
- Use only English`;

    return await callAPI(prompt);
}

async function generateMCMA() {
    const topic = randomTopic();
    const prompt = `Generate 1 PTE MCMA (Multiple Choice Multiple Answer) question about ${topic}.
    
Return ONLY valid JSON with this exact structure:
{
  "type": "MCMA",
  "passage": "A 80-120 word paragraph about ${topic}",
  "question": "A question asking 'Which of the following...'",
  "options": ["Option A", "Option B", "Option C", "Option D", "Option E"],
  "answer": ["a", "b", "d"],
  "explanation": "Why these answers are correct"
}

Requirements:
- 5 options (a-e)
- 2-3 correct answers
- All options must be meaningful phrases/sentances
- Use only English`;

    return await callAPI(prompt);
}

async function main() {
    const bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf-8'));
    
    const mcsaNeeded = Math.max(0, 350 - (bank.MCSA?.length || 0));
    const mcmaNeeded = Math.max(0, 350 - (bank.MCMA?.length || 0));
    
    console.log(`需要生成:`);
    console.log(`  MCSA: ${mcsaNeeded}`);
    console.log(`  MCMA: ${mcmaNeeded}`);
    console.log();
    
    // Generate MCSA
    if (mcsaNeeded > 0) {
        console.log(`生成 ${mcsaNeeded} 題 MCSA...`);
        for (let i = 0; i < mcsaNeeded; i++) {
            const q = await generateMCSA();
            if (q) {
                bank.MCSA = bank.MCSA || [];
                bank.MCSA.push(q);
                console.log(`  ✅ ${i+1}/${mcsaNeeded}`);
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    // Generate MCMA
    if (mcmaNeeded > 0) {
        console.log(`\n生成 ${mcmaNeeded} 題 MCMA...`);
        for (let i = 0; i < mcmaNeeded; i++) {
            const q = await generateMCMA();
            if (q) {
                bank.MCMA = bank.MCMA || [];
                bank.MCMA.push(q);
                console.log(`  ✅ ${i+1}/${mcmaNeeded}`);
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    // Save
    fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2));
    
    const total = Object.values(bank).flat().length;
    console.log(`\n✅ 完成！總題數: ${total}`);
}

main().catch(console.error);
