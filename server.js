const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const PASSWORD = process.env.PASSWORD || 'PTE2026';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || process.env.MINIMAX_KEY || '';
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || '';

// MiniMax API call
const DEFAULT_MINIMAX_KEY = 'sk-cp-hAhpYJEvRwEIVIf9s5LXX_T5a-gF92UzaxOKTV8AYyGByM--m0N1VpW8YrrVdhT4sXI7DY399dLmutEVjKO-8ZDumntlks4v_uU09hM3GOblH9nJyTXDf34';
async function callMiniMax(prompt, maxTokens = 8192) {
    const apiKey = MINIMAX_API_KEY || DEFAULT_MINIMAX_KEY;
    const response = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'MiniMax-M2',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.3
        })
    });
    const result = await response.json();
    if (result.choices?.[0]?.message?.content) {
        return result.choices[0].message.content;
    }
    throw new Error(result.base_resp?.status_msg || 'MiniMax API error');
}

// JSON file storage
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
    return { articles: [], results: [] };
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'pte-practice-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
    if (req.session && req.session.loggedIn) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// ============ AUTH ============
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === PASSWORD) {
        req.session.loggedIn = true;
        return res.json({ success: true });
    }
    res.json({ success: false, message: '密碼錯誤' });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ============ PAGES ============
app.get('/dashboard', (req, res) => {
    if (!req.session.loggedIn) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/practice', (req, res) => {
    if (!req.session.loggedIn) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'practice.html'));
});

// ============ ARTICLES ============
app.post('/api/articles', requireAuth, async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.json({ error: '請填寫標題和內容' });

    const data = loadData();
    const article = {
        id: Date.now(),
        title,
        content,
        translation: null,  // 中英對照翻譯
        date: new Date().toISOString().split('T')[0],
        questions: []
    };

    // 生成中英對照翻譯
    if (GEMINI_API_KEY) {
        try {
            const translation = await generateTranslation(content, title);
            article.translation = translation;
        } catch (err) {
            console.error('AI 翻譯失敗:', err.message);
        }

        // 生成題目
        try {
            const questions = await generateQuestions(content, title);
            article.questions = questions;
        } catch (err) {
            console.error('AI 出題失敗:', err.message);
        }
    }

    if (article.questions.length === 0) {
        article.questions = generateBasicQuestions(content, title);
    }

    data.articles.push(article);
    saveData(data);
    res.json({ success: true, article });
});

// ============ AI TRANSLATION ============
async function generateTranslation(articleContent, title) {
    const prompt = `You are a professional translator. Translate the following English article into Traditional Chinese (繁體中文).

Create a bilingual format where:
- Keep the original English paragraph
- Follow with the Chinese translation
- Use "===原文===" and "===譯文===" as separators

Title: ${title}

Article:
${articleContent.substring(0, 6000)}

Return ONLY the bilingual content in this exact format (no JSON, no code blocks):
===原文===
[English paragraph 1]
===譯文===
[Chinese translation 1]
===原文===
[English paragraph 2]
===譯文===
[Chinese translation 2]
...`;

    return await callMiniMax(prompt);
}

function generateTranslation(articleContent, title) {
    return Promise.resolve('翻譯功能需要設定 Gemini API Key');
}

// ============ BBC ARTICLE FETCHER ============
function fetchBBCArticles() {
    return Promise.resolve([]);
}

// API: Fetch BBC articles
app.post('/api/bbc/fetch', (req, res) => {
    const { password } = req.body;
    if (password !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ success: true, message: 'BBC 功能需要升級新版代碼' });
});

// API: Auto-cleanup
app.post('/api/cleanup', (req, res) => {
    const { password } = req.body;
    if (password !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ success: true, message: '需要升級新版代碼' });
});

app.get('/api/articles', requireAuth, (req, res) => {
    const data = loadData();
    res.json(data.articles || []);
});

app.get('/api/articles/:id', requireAuth, (req, res) => {
    const data = loadData();
    const article = data.articles.find(a => a.id == req.params.id);
    if (!article) return res.json({ error: 'Not found' });
    res.json(article);
});

app.delete('/api/articles/:id', requireAuth, (req, res) => {
    const data = loadData();
    data.articles = data.articles.filter(a => a.id != req.params.id);
    saveData(data);
    res.json({ success: true });
});

// ============ SUBMIT / STATS ============
app.post('/api/submit', requireAuth, (req, res) => {
    const data = loadData();
    if (!data.results) data.results = [];
    data.results.push({ ...req.body, timestamp: new Date().toISOString() });
    saveData(data);
    res.json({ success: true });
});

app.get('/api/stats', requireAuth, (req, res) => {
    const data = loadData();
    const results = data.results || [];
    const total = results.length;
    const correct = results.filter(r => r.correct).length;
    const today = new Date().toISOString().split('T')[0];
    const todayResults = results.filter(r => r.timestamp && r.timestamp.startsWith(today));
    res.json({
        total, correct,
        rate: total ? Math.round(correct / total * 100) : 0,
        todayTotal: todayResults.length,
        todayCorrect: todayResults.filter(r => r.correct).length,
        articleCount: (data.articles || []).length
    });
});

// ============ AI QUESTION GENERATION (Enhanced) ============

async function generateQuestions(articleContent, title) {
    const prompt = `You are a PTE Academic exam question generator. Based on the following article, generate exactly 18 questions covering ALL major PTE question types.

Generate these question types (in order):

=== READING ===
1. THREE "Reading: Fill in the Blanks" (FIB) - Remove a key word from a sentence in the article, provide 4 plausible options. The blank should test vocabulary or grammar understanding.

2. TWO "Multiple Choice, Single Answer" (MCSA) - Ask a comprehension question about the article. Provide 4 options, only 1 is correct. Questions should test understanding of main idea, details, inference, or author's purpose.

3. ONE "Multiple Choice, Multiple Answers" (MCMA) - Ask a question where 2-3 out of 5 options are correct. Test deeper comprehension.

4. TWO "Re-order Paragraphs" (RO) - Take 4 sentences from or inspired by the article. Provide them in CORRECT order. The frontend will shuffle them.

5. TWO "Reading & Writing: Fill in the Blanks" (RWFIB) - A paragraph from the article with 3 blanks. Each blank has 4 options (dropdown).

=== WRITING ===
6. ONE "Summarize Written Text" (SWT) - Ask the student to write a one-sentence summary (between 5-75 words) of the article or a paragraph. Provide a model answer.

=== LISTENING (simulated as reading) ===
7. TWO "Write from Dictation" (WFD) - Pick 2 important sentences from the article. Student must type the exact sentence from memory.

8. ONE "Highlight Correct Summary" (HCS) - Provide 4 short summaries of the article. Only 1 is correct. Test overall comprehension.

9. TWO "Highlight Incorrect Words" (HIW) - Take a sentence from the article and change 2-3 words to incorrect ones. Student must identify the wrong words. Provide the original correct sentence and the modified version.

10. TWO vocabulary questions (VOCAB) - Test key vocabulary from the article. Give a word in context and ask for the closest meaning. Provide 4 options.

=== RULES ===
- Return ONLY a valid JSON array. No markdown, no code blocks.
- All explanations must be in Traditional Chinese (繁體中文).
- Questions should progress from easier to harder.
- Use actual content from the article, not made-up content.

=== JSON FORMAT FOR EACH TYPE ===

FIB: {"type":"FIB","question":"sentence with ______","options":["a","b","c","d"],"answer":"correct","explanation":"繁體中文說明"}

MCSA: {"type":"MCSA","question":"question?","options":["a","b","c","d"],"answer":"correct option text","explanation":"繁體中文說明"}

MCMA: {"type":"MCMA","question":"question? (select all that apply)","options":["a","b","c","d","e"],"answers":["correct1","correct2"],"explanation":"繁體中文說明"}

RO: {"type":"RO","sentences":["1st","2nd","3rd","4th"],"answer":"correct","explanation":"繁體中文說明"}

RWFIB: {"type":"RWFIB","question":"text with ___1___ and ___2___ and ___3___","blanks":[{"options":["a","b","c","d"],"answer":"correct"},...],"explanation":"繁體中文說明"}

SWT: {"type":"SWT","question":"Summarize the following text in one sentence (5-75 words):","passage":"paragraph from article","modelAnswer":"one sentence summary","explanation":"繁體中文說明"}

WFD: {"type":"WFD","question":"Type the sentence you see, then it will be hidden:","answer":"exact sentence","explanation":"繁體中文說明"}

HCS: {"type":"HCS","question":"Which summary best describes the article?","options":["summary1","summary2","summary3","summary4"],"answer":"correct summary","explanation":"繁體中文說明"}

HIW: {"type":"HIW","question":"Find the incorrect words in this sentence:","modified":"sentence with wrong words","original":"original correct sentence","wrongWords":["word1","word2"],"explanation":"繁體中文說明"}

VOCAB: {"type":"VOCAB","question":"In the context of the article, what does 'word' most closely mean?","options":["a","b","c","d"],"answer":"correct","explanation":"繁體中文說明"}

Article Title: ${title}
Article Content:
${articleContent.substring(0, 4000)}`;

    return await callMiniMax(prompt, 8192);
}

// ============ BASIC QUESTION GENERATOR (Fallback) ============

function generateBasicQuestions(content, title) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const words = content.split(/\s+/);
    const questions = [];

    // FIB x3
    for (let i = 0; i < Math.min(3, sentences.length); i++) {
        const s = sentences[i].trim();
        const longWords = s.split(' ').filter(w => w.length > 4 && /^[a-zA-Z]+$/.test(w));
        if (longWords.length > 0) {
            const target = longWords[Math.floor(Math.random() * longWords.length)];
            questions.push({
                type: 'FIB',
                question: s.replace(new RegExp(`\\b${target}\\b`, 'i'), '______'),
                options: shuffle([target, ...generateDistractors(target)]),
                answer: target,
                explanation: `正確答案是 "${target}"。原句：${s.substring(0, 80)}...`
            });
        }
    }

    // MCSA x2
    questions.push({
        type: 'MCSA',
        question: `What is the main topic of this article?`,
        options: shuffle([title, 'Global sports events', 'Celebrity lifestyle news', 'Weather forecast updates']),
        answer: title,
        explanation: `文章主題是「${title}」`
    });

    if (sentences.length > 3) {
        questions.push({
            type: 'MCSA',
            question: `Which of the following best describes the author's tone?`,
            options: shuffle(['Analytical and informative', 'Angry and confrontational', 'Humorous and sarcastic', 'Romantic and poetic']),
            answer: 'Analytical and informative',
            explanation: `經濟學人的文章風格通常是分析性和資訊性的`
        });
    }

    // RO x1
    if (sentences.length >= 4) {
        questions.push({
            type: 'RO',
            sentences: sentences.slice(0, 4).map(s => s.trim()),
            answer: 'correct',
            explanation: '按照文章原始順序排列'
        });
    }

    // WFD x2
    for (let i = 1; i < Math.min(3, sentences.length); i++) {
        questions.push({
            type: 'WFD',
            question: 'Type the following sentence:',
            answer: sentences[i].trim(),
            explanation: '請仔細閱讀並完整打出句子'
        });
    }

    // VOCAB x2
    const vocabWords = words.filter(w => w.length > 6 && /^[a-zA-Z]+$/.test(w));
    for (let i = 0; i < Math.min(2, vocabWords.length); i++) {
        const word = vocabWords[Math.floor(Math.random() * vocabWords.length)];
        questions.push({
            type: 'VOCAB',
            question: `In the context of this article, what does "${word}" most closely mean?`,
            options: shuffle([word, word + 'ly', 'un' + word, word.substring(0, 3) + 'ment']),
            answer: word,
            explanation: `這個字在文章中的意思需要根據上下文理解`
        });
    }

    // HCS x1
    questions.push({
        type: 'HCS',
        question: 'Which summary best describes this article?',
        options: shuffle([
            `This article discusses ${title.toLowerCase()}.`,
            'This article is about cooking recipes from around the world.',
            'This article reviews the latest Hollywood movies.',
            'This article covers professional sports statistics.'
        ]),
        answer: `This article discusses ${title.toLowerCase()}.`,
        explanation: `文章是關於「${title}」的討論`
    });

    // SWT x1
    if (sentences.length > 2) {
        questions.push({
            type: 'SWT',
            question: 'Summarize the following text in one sentence (5-75 words):',
            passage: sentences.slice(0, 3).join('. ').trim() + '.',
            modelAnswer: `The article discusses ${title.toLowerCase()} and its implications.`,
            explanation: '摘要應包含文章的主要論點'
        });
    }

    return questions;
}

function generateDistractors(word) {
    const base = word.toLowerCase();
    const options = new Set();
    if (base.endsWith('e')) {
        options.add(base.slice(0, -1) + 'ing');
        options.add(base + 'd');
        options.add(base + 'ly');
    } else if (base.endsWith('ed')) {
        options.add(base.slice(0, -2) + 'ing');
        options.add(base.slice(0, -2) + 'tion');
        options.add(base.slice(0, -2) + 'ment');
    } else {
        options.add(base + 'ed');
        options.add(base + 'ing');
        options.add(base + 'ness');
    }
    return [...options].slice(0, 3);
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ============ QUESTION BANK ============
const BANK_FILE = path.join(__dirname, 'question-bank.json');

function loadBank() {
    if (fs.existsSync(BANK_FILE)) {
        try { return JSON.parse(fs.readFileSync(BANK_FILE, 'utf-8')); } catch(e) {}
    }
    return {};
}

// Get random questions from bank
app.get('/api/bank/practice', requireAuth, (req, res) => {
    const bank = loadBank();
    const type = req.query.type;
    const count = parseInt(req.query.count) || 10;
    
    if (type && bank[type]) {
        const shuffled = [...bank[type]].sort(() => Math.random() - 0.5);
        return res.json({ questions: shuffled.slice(0, count), type, total: bank[type].length });
    }
    
    // Mixed practice: pick from all types
    const allQ = [];
    for (const [t, qs] of Object.entries(bank)) {
        if (Array.isArray(qs) && qs.length > 0) {
            const shuffled = [...qs].sort(() => Math.random() - 0.5);
            allQ.push(...shuffled.slice(0, Math.ceil(count / Object.keys(bank).length)));
        }
    }
    const mixed = allQ.sort(() => Math.random() - 0.5).slice(0, count);
    res.json({ questions: mixed, type: 'mixed', total: mixed.length });
});

// Get bank stats
app.get('/api/bank/stats', requireAuth, (req, res) => {
    const bank = loadBank();
    const stats = {};
    let total = 0;
    for (const [type, qs] of Object.entries(bank)) {
        if (Array.isArray(qs)) {
            stats[type] = qs.length;
            total += qs.length;
        }
    }
    res.json({ stats, total });
});

// ============ BANK GENERATOR (runs on server) ============
app.post('/api/bank/generate', requireAuth, async (req, res) => {
    if (!GEMINI_API_KEY) return res.json({ error: 'No Gemini API key configured' });

    const { type, count } = req.body;
    const batchCount = Math.min(count || 10, 15);
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
    const shuffled = [...TOPICS].sort(() => Math.random() - 0.5);
    const topicStr = shuffled.slice(0, 3).join(', ');

    const prompts = {
        FIB: `Generate ${batchCount} PTE "Fill in the Blanks" questions about ${topicStr}. Each: academic sentence with one blank (______), 4 options. Return ONLY JSON array: [{"type":"FIB","question":"...______...","options":["a","b","c","d"],"answer":"correct","explanation":"繁體中文"}]`,
        MCSA: `Generate ${batchCount} PTE reading comprehension questions about ${topicStr}. Each: short passage (2-3 sentences) + question + 4 options. Return ONLY JSON array: [{"type":"MCSA","passage":"...","question":"?","options":["a","b","c","d"],"answer":"correct","explanation":"繁體中文"}]`,
        MCMA: `Generate ${batchCount} PTE multiple-select questions about ${topicStr}. Each: passage + question + 5 options (2-3 correct). Return ONLY JSON array: [{"type":"MCMA","passage":"...","question":"?","options":["a","b","c","d","e"],"answers":["c1","c2"],"explanation":"繁體中文"}]`,
        RO: `Generate ${batchCount} PTE re-order paragraph questions about ${topicStr}. Each: 4 sentences in CORRECT order. Return ONLY JSON array: [{"type":"RO","sentences":["1","2","3","4"],"answer":"correct","explanation":"繁體中文"}]`,
        RWFIB: `Generate ${batchCount} PTE reading-writing fill-in-blanks about ${topicStr}. Each: paragraph with ___1___, ___2___, ___3___, each blank has 4 options. Return ONLY JSON array: [{"type":"RWFIB","question":"...___1___...___2___...___3___","blanks":[{"options":["a","b","c","d"],"answer":"x"},{"options":["a","b","c","d"],"answer":"x"},{"options":["a","b","c","d"],"answer":"x"}],"explanation":"繁體中文"}]`,
        SWT: `Generate ${batchCount} PTE summarize-written-text questions about ${topicStr}. Each: 80-120 word passage + model 1-sentence summary. Return ONLY JSON array: [{"type":"SWT","question":"Summarize in one sentence:","passage":"...","modelAnswer":"...","explanation":"繁體中文"}]`,
        WFD: `Generate ${batchCount} PTE write-from-dictation sentences about ${topicStr}. Each: academic sentence 8-16 words. Return ONLY JSON array: [{"type":"WFD","question":"Type from memory:","answer":"sentence","explanation":"繁體中文翻譯"}]`,
        HCS: `Generate ${batchCount} PTE highlight-correct-summary questions about ${topicStr}. Each: passage + 4 summaries (1 correct). Return ONLY JSON array: [{"type":"HCS","passage":"...","question":"Best summary?","options":["s1","s2","s3","s4"],"answer":"correct","explanation":"繁體中文"}]`,
        HIW: `Generate ${batchCount} PTE highlight-incorrect-words questions about ${topicStr}. Each: original sentence + modified version with 2-3 wrong words. Return ONLY JSON array: [{"type":"HIW","question":"Find wrong words:","original":"correct","modified":"with errors","wrongWords":["w1","w2"],"explanation":"繁體中文"}]`,
        VOCAB: `Generate ${batchCount} PTE vocabulary questions about ${topicStr}. Each: sentence with advanced word, ask meaning, 4 options. Return ONLY JSON array: [{"type":"VOCAB","question":"What does 'X' mean in: '...'","options":["a","b","c","d"],"answer":"correct","explanation":"繁體中文"}]`
    };

    const prompt = prompts[type];
    if (!prompt) return res.json({ error: 'Invalid type' });

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.85, maxOutputTokens: 4096 }
                })
            }
        );
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const questions = JSON.parse(cleaned);

        // Save to bank
        const bank = loadBank();
        if (!bank[type]) bank[type] = [];
        bank[type].push(...questions);
        fs.writeFileSync(BANK_FILE, JSON.stringify(bank));

        res.json({ success: true, generated: questions.length, total: bank[type].length });
    } catch (e) {
        res.json({ error: e.message });
    }
});

// Bulk generate endpoint
app.post('/api/bank/bulk-generate', requireAuth, async (req, res) => {
    if (!GEMINI_API_KEY) return res.json({ error: 'No Gemini API key' });
    
    res.json({ success: true, message: 'Generation started in background' });

    // Run in background
    const types = ['FIB','MCSA','MCMA','RO','RWFIB','SWT','WFD','HCS','HIW','VOCAB'];
    const bank = loadBank();
    
    for (const type of types) {
        const existing = (bank[type] || []).length;
        if (existing >= 300) continue;
        
        const rounds = Math.ceil((300 - existing) / 10);
        for (let i = 0; i < rounds; i++) {
            try {
                // Call our own generate endpoint logic
                const TOPICS = ['economics','technology','environment','healthcare','education','politics','energy','social media','globalization','finance'];
                const topic = TOPICS.sort(() => Math.random() - 0.5).slice(0,3).join(', ');
                
                const prompts = {
                    FIB: `Generate 10 PTE "Fill in the Blanks" about ${topic}. Return ONLY JSON: [{"type":"FIB","question":"...______...","options":["a","b","c","d"],"answer":"x","explanation":"繁體中文"}]`,
                    MCSA: `Generate 10 PTE reading comprehension about ${topic}. Return ONLY JSON: [{"type":"MCSA","passage":"...","question":"?","options":["a","b","c","d"],"answer":"x","explanation":"繁體中文"}]`,
                    MCMA: `Generate 10 PTE multi-select about ${topic}. Return ONLY JSON: [{"type":"MCMA","passage":"...","question":"?","options":["a","b","c","d","e"],"answers":["x","y"],"explanation":"繁體中文"}]`,
                    RO: `Generate 10 PTE reorder about ${topic}. Return ONLY JSON: [{"type":"RO","sentences":["1","2","3","4"],"answer":"correct","explanation":"繁體中文"}]`,
                    RWFIB: `Generate 10 PTE R&W FIB about ${topic}. Return ONLY JSON: [{"type":"RWFIB","question":"...___1___...___2___...___3___","blanks":[{"options":["a","b","c","d"],"answer":"x"},{"options":["a","b","c","d"],"answer":"x"},{"options":["a","b","c","d"],"answer":"x"}],"explanation":"繁體中文"}]`,
                    SWT: `Generate 10 PTE summarize about ${topic}. Return ONLY JSON: [{"type":"SWT","question":"Summarize:","passage":"...","modelAnswer":"...","explanation":"繁體中文"}]`,
                    WFD: `Generate 10 PTE dictation sentences about ${topic}. Return ONLY JSON: [{"type":"WFD","question":"Type:","answer":"sentence","explanation":"繁體中文"}]`,
                    HCS: `Generate 10 PTE correct-summary about ${topic}. Return ONLY JSON: [{"type":"HCS","passage":"...","question":"Best summary?","options":["a","b","c","d"],"answer":"x","explanation":"繁體中文"}]`,
                    HIW: `Generate 10 PTE incorrect-words about ${topic}. Return ONLY JSON: [{"type":"HIW","question":"Find:","original":"correct","modified":"errors","wrongWords":["w1","w2"],"explanation":"繁體中文"}]`,
                    VOCAB: `Generate 10 PTE vocab about ${topic}. Return ONLY JSON: [{"type":"VOCAB","question":"meaning?","options":["a","b","c","d"],"answer":"x","explanation":"繁體中文"}]`
                };

                const resp = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
                    { method:'POST', headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ contents:[{parts:[{text:prompts[type]}]}], generationConfig:{temperature:0.85,maxOutputTokens:4096} }) }
                );
                const result = await resp.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const cleaned = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
                const qs = JSON.parse(cleaned);
                if (!bank[type]) bank[type] = [];
                bank[type].push(...qs);
                fs.writeFileSync(BANK_FILE, JSON.stringify(bank));
                console.log(`✅ ${type}: +${qs.length} = ${bank[type].length}`);
            } catch(e) {
                console.error(`❌ ${type} batch ${i}: ${e.message}`);
            }
            // Rate limit
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    console.log('🎉 Bulk generation complete!');
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
    console.log(`PTE Practice System running on port ${PORT}`);
    console.log(`Gemini API: ${GEMINI_API_KEY ? 'configured' : 'not set'}`);
});
