/**
 * PTE 題庫批量生成器
 * 使用 Gemini API 批量生成各種 PTE 題型
 */

const fs = require('fs');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDiMIKPMiP8kfij9DVTqfIMjTMPuZcKs-s';
const BANK_FILE = './question-bank.json';

// ============ 題庫載入/儲存 ============
function loadBank() {
    if (fs.existsSync(BANK_FILE)) return JSON.parse(fs.readFileSync(BANK_FILE, 'utf-8'));
    return { FIB: [], MCSA: [], MCMA: [], RO: [], RWFIB: [], SWT: [], WFD: [], HCS: [], HIW: [], VOCAB: [] };
}
function saveBank(bank) { fs.writeFileSync(BANK_FILE, JSON.stringify(bank)); }

// ============ Gemini API ============
async function callGemini(prompt) {
    const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.85, maxOutputTokens: 8192 }
            })
        }
    );
    const result = await r.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

// ============ 各題型生成 Prompt ============

const TOPICS = [
    'global economics and trade', 'climate change and environment', 'artificial intelligence and technology',
    'healthcare and medicine', 'education reform', 'political systems and democracy',
    'urbanization and city planning', 'renewable energy', 'social media impact',
    'globalization', 'financial markets', 'space exploration', 'biotechnology',
    'income inequality', 'immigration policy', 'food security', 'cybersecurity',
    'mental health', 'automation and employment', 'cultural diversity',
    'sustainable development', 'international relations', 'public transportation',
    'water scarcity', 'digital privacy', 'aging population', 'startup ecosystems',
    'supply chain management', 'cryptocurrency', 'ocean conservation'
];

function getPrompt(type, count, topicBatch) {
    const topics = topicBatch.join(', ');

    const prompts = {
        FIB: `Generate ${count} PTE "Reading: Fill in the Blanks" questions about these topics: ${topics}.

Each question: a sentence with one blank (______), 4 options (1 correct, 3 plausible distractors).
Sentences should be academic/formal English, like The Economist.

Return ONLY a JSON array:
[{"type":"FIB","question":"sentence with ______","options":["a","b","c","d"],"answer":"correct","explanation":"繁體中文解釋","difficulty":"easy|medium|hard","topic":"topic"}]`,

        MCSA: `Generate ${count} PTE "Multiple Choice Single Answer" reading comprehension questions about: ${topics}.

Each: a short passage (2-3 sentences), a question, 4 options (1 correct).
Passages should sound like The Economist articles.

Return ONLY JSON array:
[{"type":"MCSA","passage":"short passage","question":"question?","options":["a","b","c","d"],"answer":"correct","explanation":"繁體中文解釋","difficulty":"easy|medium|hard","topic":"topic"}]`,

        MCMA: `Generate ${count} PTE "Multiple Choice Multiple Answers" questions about: ${topics}.

Each: a short passage, question, 5 options (2-3 correct).

Return ONLY JSON array:
[{"type":"MCMA","passage":"passage","question":"question? (select all that apply)","options":["a","b","c","d","e"],"answers":["correct1","correct2"],"explanation":"繁體中文解釋","difficulty":"medium|hard","topic":"topic"}]`,

        RO: `Generate ${count} PTE "Re-order Paragraphs" questions about: ${topics}.

Each: 4 sentences that form a logical paragraph, given in CORRECT order.

Return ONLY JSON array:
[{"type":"RO","sentences":["1st","2nd","3rd","4th"],"answer":"correct","explanation":"繁體中文解釋排序邏輯","difficulty":"medium|hard","topic":"topic"}]`,

        RWFIB: `Generate ${count} PTE "Reading & Writing Fill in the Blanks" questions about: ${topics}.

Each: a paragraph with exactly 3 blanks (___1___, ___2___, ___3___). Each blank has 4 options.

Return ONLY JSON array:
[{"type":"RWFIB","question":"text ___1___ more ___2___ end ___3___","blanks":[{"options":["a","b","c","d"],"answer":"correct"},{"options":["a","b","c","d"],"answer":"correct"},{"options":["a","b","c","d"],"answer":"correct"}],"explanation":"繁體中文解釋","difficulty":"medium|hard","topic":"topic"}]`,

        SWT: `Generate ${count} PTE "Summarize Written Text" questions about: ${topics}.

Each: a passage (80-120 words) + a model one-sentence summary (5-75 words).

Return ONLY JSON array:
[{"type":"SWT","question":"Summarize the following text in one sentence (5-75 words):","passage":"passage text","modelAnswer":"one sentence summary","explanation":"繁體中文解釋重點","difficulty":"medium|hard","topic":"topic"}]`,

        WFD: `Generate ${count} PTE "Write from Dictation" sentences about: ${topics}.

Each: an academic English sentence (8-16 words). Should sound like something from a university lecture.

Return ONLY JSON array:
[{"type":"WFD","question":"Type this sentence from memory:","answer":"the exact sentence","explanation":"繁體中文翻譯","difficulty":"easy|medium|hard","topic":"topic"}]`,

        HCS: `Generate ${count} PTE "Highlight Correct Summary" questions about: ${topics}.

Each: a short passage + 4 summary options (1 correct, 3 wrong but plausible).

Return ONLY JSON array:
[{"type":"HCS","passage":"passage","question":"Which is the best summary?","options":["summary1","summary2","summary3","summary4"],"answer":"correct summary","explanation":"繁體中文解釋","difficulty":"medium|hard","topic":"topic"}]`,

        HIW: `Generate ${count} PTE "Highlight Incorrect Words" questions about: ${topics}.

Each: an original correct sentence AND a modified version with 2-3 words changed to similar but wrong words.

Return ONLY JSON array:
[{"type":"HIW","question":"Find the incorrect words:","original":"correct sentence","modified":"sentence with wrong words","wrongWords":["wrong1","wrong2"],"explanation":"繁體中文解釋哪些字被換了","difficulty":"medium|hard","topic":"topic"}]`,

        VOCAB: `Generate ${count} PTE vocabulary-in-context questions about: ${topics}.

Each: a sentence using an advanced word, ask what it means. 4 options (1 correct synonym, 3 distractors).

Return ONLY JSON array:
[{"type":"VOCAB","question":"In this sentence, what does 'word' mean? 'Full sentence with the word.'","word":"target word","options":["synonym","distractor1","distractor2","distractor3"],"answer":"synonym","explanation":"繁體中文解釋","difficulty":"easy|medium|hard","topic":"topic"}]`
    };

    return prompts[type] || '';
}

// ============ 批量生成 ============
async function generateBatch(type, batchSize, topicBatch) {
    const prompt = getPrompt(type, batchSize, topicBatch);
    if (!prompt) return [];

    try {
        const text = await callGemini(prompt);
        const questions = JSON.parse(text);
        console.log(`  ✅ ${type}: generated ${questions.length} questions`);
        return questions;
    } catch (e) {
        console.error(`  ❌ ${type}: failed - ${e.message}`);
        return [];
    }
}

async function generateAll() {
    const bank = loadBank();
    const types = ['FIB', 'MCSA', 'MCMA', 'RO', 'RWFIB', 'SWT', 'WFD', 'HCS', 'HIW', 'VOCAB'];
    const TARGET = 350; // target per type
    const BATCH = 25;   // questions per API call
    const TOPIC_BATCH = 5; // topics per batch

    for (const type of types) {
        const existing = (bank[type] || []).length;
        const needed = TARGET - existing;
        if (needed <= 0) {
            console.log(`⏭️  ${type}: already has ${existing} questions, skipping`);
            continue;
        }

        console.log(`\n🔄 ${type}: has ${existing}, need ${needed} more`);
        const batches = Math.ceil(needed / BATCH);

        for (let i = 0; i < batches; i++) {
            const batchSize = Math.min(BATCH, needed - i * BATCH);
            // Pick random topics for this batch
            const shuffled = [...TOPICS].sort(() => Math.random() - 0.5);
            const topicBatch = shuffled.slice(0, TOPIC_BATCH);

            console.log(`  Batch ${i + 1}/${batches} (${batchSize} questions, topics: ${topicBatch.join(', ')})`);
            const questions = await generateBatch(type, batchSize, topicBatch);

            if (questions.length > 0) {
                if (!bank[type]) bank[type] = [];
                bank[type].push(...questions);
                saveBank(bank);
                console.log(`  💾 Saved. Total ${type}: ${bank[type].length}`);
            }

            // Rate limit: wait 2s between calls
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // Print summary
    console.log('\n' + '='.repeat(40));
    console.log('📊 題庫統計:');
    for (const type of types) {
        console.log(`  ${type}: ${(bank[type] || []).length} 題`);
    }
    const total = types.reduce((sum, t) => sum + (bank[t] || []).length, 0);
    console.log(`  Total: ${total} 題`);
}

generateAll().then(() => console.log('\n✅ Done!')).catch(e => console.error('Fatal:', e));
