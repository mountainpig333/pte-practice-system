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

// Upload article
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

    // Generate questions using Gemini
    if (GEMINI_API_KEY) {
        try {
            const questions = await generateQuestions(content);
            article.questions = questions;
        } catch (err) {
            console.error('AI 出題失敗:', err.message);
        }
    }

    // If no AI or AI failed, generate basic questions
    if (article.questions.length === 0) {
        article.questions = generateBasicQuestions(content, title);
    }

    data.articles.push(article);
    saveData(data);
    res.json({ success: true, article });
});

// Get all articles
app.get('/api/articles', requireAuth, (req, res) => {
    const data = loadData();
    res.json(data.articles || []);
});

// Get article by id
app.get('/api/articles/:id', requireAuth, (req, res) => {
    const data = loadData();
    const article = data.articles.find(a => a.id == req.params.id);
    if (!article) return res.json({ error: 'Not found' });
    res.json(article);
});

// Delete article
app.delete('/api/articles/:id', requireAuth, (req, res) => {
    const data = loadData();
    data.articles = data.articles.filter(a => a.id != req.params.id);
    saveData(data);
    res.json({ success: true });
});

// ============ SUBMIT ANSWER ============
app.post('/api/submit', requireAuth, (req, res) => {
    const data = loadData();
    if (!data.results) data.results = [];
    data.results.push({ ...req.body, timestamp: new Date().toISOString() });
    saveData(data);
    res.json({ success: true });
});

// ============ STATS ============
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

// ============ AI QUESTION GENERATION ============

async function generateQuestions(articleContent) {
    const prompt = `You are a PTE Academic exam question generator. Based on the following article, generate exactly 8 questions in these PTE formats:

1. TWO "Reading: Fill in the Blanks" (FIB) - Remove a key word from a sentence, provide 4 options
2. TWO "Multiple Choice, Single Answer" (MC) - Comprehension question with 4 options  
3. TWO "Re-order Paragraphs" (RO) - Take 4 consecutive sentences, shuffle them
4. ONE "Reading & Writing: Fill in the Blanks" (RWFIB) - A paragraph with 3 blanks, each with 4 options
5. ONE "Write from Dictation" (WFD) - Pick a key sentence from the article

IMPORTANT: Return ONLY valid JSON array. No markdown, no code blocks, no explanation.

Each question object must have:
- "type": "FIB" | "MC" | "RO" | "RWFIB" | "WFD"
- "question": the question text
- "options": array of options (for FIB/MC/RWFIB)
- "answer": correct answer string
- "explanation": brief explanation in Traditional Chinese

For RO type:
- "sentences": array of 4 sentences in CORRECT order
- "answer": "correct" (frontend will shuffle them)

For RWFIB type:
- "question": paragraph with ___1___, ___2___, ___3___ as blanks
- "blanks": [{"options": [...], "answer": "..."}, ...]

Article:
${articleContent.substring(0, 3000)}`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7 }
            })
        }
    );

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Clean up response
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
}

function generateBasicQuestions(content, title) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const questions = [];

    // FIB questions
    for (let i = 0; i < Math.min(2, sentences.length); i++) {
        const s = sentences[i].trim();
        const words = s.split(' ').filter(w => w.length > 4);
        if (words.length > 0) {
            const target = words[Math.floor(Math.random() * words.length)];
            const distractors = generateDistractors(target);
            questions.push({
                type: 'FIB',
                question: s.replace(target, '______'),
                options: shuffle([target, ...distractors]),
                answer: target,
                explanation: `正確答案是 "${target}"，原句為：${s}`
            });
        }
    }

    // MC questions
    questions.push({
        type: 'MC',
        question: `What is the main topic of "${title}"?`,
        options: [title, 'Sports News', 'Weather Report', 'Celebrity Gossip'],
        answer: title,
        explanation: `文章主題是 "${title}"`
    });

    // WFD
    if (sentences.length > 2) {
        const wfdSentence = sentences[2].trim();
        questions.push({
            type: 'WFD',
            question: 'Type the following sentence:',
            answer: wfdSentence,
            explanation: '請仔細聽並完整打出句子'
        });
    }

    return questions;
}

function generateDistractors(word) {
    const similar = [
        word.substring(0, word.length - 1) + 'ed',
        word.substring(0, word.length - 1) + 'ing',
        word.substring(0, word.length - 2) + 'tion'
    ];
    return similar.slice(0, 3);
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
