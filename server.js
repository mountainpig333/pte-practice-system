const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const PASSWORD = process.env.PASSWORD || 'PTE2026';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

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
        date: new Date().toISOString().split('T')[0],
        questions: []
    };

    if (GEMINI_API_KEY) {
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

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
            })
        }
    );

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const questions = JSON.parse(cleaned);
    
    // Normalize: convert old MC type to MCSA
    return questions.map(q => {
        if (q.type === 'MC') q.type = 'MCSA';
        return q;
    });
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

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
    console.log(`PTE Practice System running on port ${PORT}`);
    console.log(`Gemini API: ${GEMINI_API_KEY ? 'configured' : 'not set'}`);
});
