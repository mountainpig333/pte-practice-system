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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45秒 timeout
    
    try {
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
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        const result = await response.json();
        if (result.choices?.[0]?.message?.content) {
            return result.choices[0].message.content;
        }
        throw new Error(result.base_resp?.status_msg || 'MiniMax API error');
    } catch (e) {
        clearTimeout(timeout);
        throw e;
    }
}

// JSON file storage (使用 Render disk mount)
const DATA_DIR = process.env.DISK_MOUNT_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DATA_FILE = path.join(DATA_DIR, 'data.json');

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
    cookie: { maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax', secure: false }
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
    req.session.destroy(err => {
        if (err) console.error('Session destroy error:', err);
    });
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

    // 生成中英對照翻譯 (使用 MiniMax)
    const translation = await generateTranslation(content, title);
    if (translation) {
        article.translation = translation;
    }

    // 生成題目 (使用 MiniMax)
    try {
        const questions = await generateQuestions(content, title);
        article.questions = questions;
    } catch (err) {
        console.error('AI 出題失敗:', err.message);
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

// ============ BBC ARTICLE FETCHER ============

// 使用 node fetch 抓取網頁
async function fetchUrl(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15秒 timeout
    
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);
        return await response.text();
    } catch (e) {
        clearTimeout(timeout);
        throw e;
    }
}

// 從 BBC RSS 抓取文章列表 (含描述)
async function fetchBBCWorldArticles() {
    const articles = [];
    const seenUrls = new Set();
    
    try {
        // 使用 RSS feed 獲取文章列表
        const xml = await fetchUrl('https://feeds.bbci.co.uk/news/world/rss.xml');
        
        // 解析 XML 獲取 item 標題、連結和描述
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match;
        
        while ((match = itemRegex.exec(xml)) !== null && articles.length < 10) {
            const item = match[1];
            
            const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/);
            const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
            const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
            
            if (titleMatch && linkMatch) {
                let title = titleMatch[1].trim();
                const url = linkMatch[1].trim();
                const description = descMatch ? descMatch[1].trim() : '';
                
                // 如果標題看起來像 slug (如 cp84kw1y337o)，嘗試從描述產生標題
                if (/^[a-z0-9]{10,}$/i.test(title)) {
                    if (description && description.length > 20) {
                        // 取描述的前 60 個字作為標題
                        title = description.substring(0, 60).replace(/[^\w\s]/g, '').trim();
                        if (description.length > 60) title += '...';
                    } else {
                        title = 'BBC World News';
                    }
                }
                
                if (url && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    articles.push({ url, title, description });
                }
            }
        }
    } catch (e) {
        console.error('抓取 BBC RSS 失敗:', e.message);
    }
    
    return articles;
}

// 抓取單篇文章內容 (強制抓網頁)
async function fetchArticleContent(url, description = '') {
    // 強制抓取網頁，不使用 RSS description (因為太短)
    // 2026-04-03 修復：原本用 RSS description 只有幾十字，現在直接抓網頁
    
    // 沒有描述才嘗試抓網頁
    try {
        const html = await fetchUrl(url);
        
        let title = '';
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
            title = titleMatch[1].replace(/ - BBC News/, '').trim();
        }
        
        let content = '';
        const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (articleMatch) {
            const articleBody = articleMatch[1];
            const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            let pMatch;
            const paragraphs = [];
            
            while ((pMatch = pRegex.exec(articleBody)) !== null) {
                const text = pMatch[1]
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .replace(/&#\d+;/g, '')
                    .trim();
                
                if (text.length > 50) {
                    paragraphs.push(text);
                }
            }
            content = paragraphs.join('\n\n');
        }
        
        return { title, content };
    } catch (e) {
        console.error('抓取文章失敗:', e.message);
        return { title: '', content: '' };
    }
}

// 主函數: 抓取 BBC 文章並生成翻譯和題目
async function fetchAndProcessBBCArticles(count = 5) {
    const results = [];
    
    // 1. 抓取文章列表
    const articleList = await fetchBBCWorldArticles();
    console.log(`找到 ${articleList.length} 篇 BBC 文章`);
    
    // 2. 抓取每篇文章內容
    for (const article of articleList.slice(0, count)) {
        console.log(`抓取: ${article.title}`);
        const content = await fetchArticleContent(article.url, article.description);
        
        if (content.content && content.content.length > 100) {
            const title = content.title || article.title;
            
            // 生成文章物件
            const articleData = {
                id: Date.now() + Math.random(),
                title: title,
                content: content.content,
                url: article.url,
                translation: null,
                date: new Date().toISOString().split('T')[0],
                questions: [],
                source: 'BBC News'
            };
            
            // 3. 產生中英對照翻譯
            try {
                console.log(`產生翻譯: ${title}`);
                const translation = await generateTranslation(content.content, title);
                if (translation) {
                    articleData.translation = translation;
                }
            } catch (e) {
                console.error('翻譯失敗:', e.message);
            }
            
            // 4. 產生 PTE 題目
            try {
                console.log(`產生題目: ${title}`);
                const questions = await generateQuestions(content.content, title);
                articleData.questions = questions;
            } catch (e) {
                console.error('出題失敗:', e.message);
                articleData.questions = generateBasicQuestions(content.content, title);
            }
            
            results.push(articleData);
            console.log(`✅ 完成: ${title}`);
        }
    }
    
    return results;
}

// API: Fetch BBC articles
app.post('/api/bbc/fetch', async (req, res) => {
    const { password, count } = req.body;
    if (password !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    
    const articleCount = Math.min(count || 5, 10);
    
    try {
        console.log(`開始抓取 ${articleCount} 篇 BBC 文章...`);
        const articles = await fetchAndProcessBBCArticles(articleCount);
        
        // 儲存到 data.json
        const data = loadData();
        data.articles.push(...articles);
        saveData(data);
        
        console.log(`✅ 已儲存 ${articles.length} 篇 BBC 文章到 data.json`);
        
        res.json({ 
            success: true, 
            articles: articles,
            count: articles.length
        });
    } catch (e) {
        console.error('BBC fetch error:', e);
        res.json({ success: false, error: e.message });
    }
});

// API: Auto-cleanup
app.post('/api/cleanup', (req, res) => {
    const { password, action } = req.body;
    if (password !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

    const data = loadData();
    let result = { deleted: 0 };

    switch(action) {
        case 'articles':
            // 刪除 30 天前的文章
            const cutoff = new Date(Date.now() - 30*24*60*60*1000);
            const before = data.articles.length;
            data.articles = data.articles.filter(a => new Date(a.date) > cutoff);
            result.deleted = before - data.articles.length;
            result.message = `刪除了 ${result.deleted} 篇過期文章`;
            break;

        case 'stats':
            // 清除練習統計（results陣列）
            const statsCount = (data.results || []).length;
            data.results = [];
            result.deleted = statsCount;
            result.message = `清除了 ${result.deleted} 筆練習記錄`;
            break;

        case 'cache':
            // 清除快取（如果有的話）
            result.message = '快取清除完成（無需清除）';
            break;

        case 'all':
            // 全部清除
            const articleCount = data.articles.length;
            const statsCnt = (data.results || []).length;
            data.articles = [];
            data.results = [];
            result.deleted = articleCount + statsCnt;
            result.message = `已清除全部：${articleCount} 篇文章 + ${statsCnt} 筆記錄`;
            break;

        default:
            return res.json({
                success: true,
                actions: ['articles', 'stats', 'cache', 'all'],
                description: {
                    articles: '刪除 30 天前的文章',
                    stats: '清除所有練習記錄',
                    cache: '清除快取',
                    all: '清除全部（文章+記錄）'
                }
            });
    }

    saveData(data);
    res.json({ success: true, ...result });
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
    const prompt = `You are a PTE Academic exam question generator. Based on the following article, generate exactly 10 questions focusing on READING question types ONLY.

Generate these question types (in order):

=== READING ===
1. TWO "Reading: Fill in the Blanks" (FIB) - Remove a key word from a sentence in the article, provide 4 plausible options. The blank should test vocabulary or grammar understanding.

2. TWO "Multiple Choice, Single Answer" (MCSA) - Ask a comprehension question about the article. Provide 4 options, only 1 is correct. Questions should test understanding of main idea, details, inference, or author's purpose.

3. ONE "Multiple Choice, Multiple Answers" (MCMA) - Ask a question where 2-3 out of 5 options are correct. Test deeper comprehension.

4. ONE "Re-order Paragraphs" (RO) - Take 4 sentences from or inspired by the article. Provide them in CORRECT order. The frontend will shuffle them.

5. ONE "Reading & Writing: Fill in the Blanks" (RWFIB) - A paragraph from the article with 2 blanks. Each blank has 4 options (dropdown).

6. ONE "Summarize Written Text" (SWT) - Ask the student to write a one-sentence summary (between 5-75 words) of the article or a paragraph. Provide a model answer.

=== RULES ===
- Return ONLY a valid JSON array. No markdown, no code blocks.
- All explanations must be in Traditional Chinese (繁體中文).
- Questions should progress from easier to harder.
- Use actual content from the article, not made-up content.
- DO NOT generate WFD, HCS, HIW, or VOCAB - only reading types above.

=== JSON FORMAT FOR EACH TYPE ===

FIB: {"type":"FIB","question":"sentence with ______","options":["a","b","c","d"],"answer":"correct","explanation":"繁體中文說明"}

MCSA: {"type":"MCSA","question":"question?","options":["a","b","c","d"],"answer":"correct option text","explanation":"繁體中文說明"}

MCMA: {"type":"MCMA","question":"question? (select all that apply)","options":["a","b","c","d","e"],"answers":["correct1","correct2"],"explanation":"繁體中文說明"}

RO: {"type":"RO","sentences":["1st","2nd","3rd","4th"],"answer":"correct","explanation":"繁體中文說明"}

RWFIB: {"type":"RWFIB","question":"text with ___1___ and ___2___ and ___3___","blanks":[{"options":["a","b","c","d"],"answer":"correct"},...],"explanation":"繁體中文說明"}

SWT: {"type":"SWT","question":"Summarize the following text in one sentence (5-75 words):","passage":"paragraph from article","modelAnswer":"one sentence summary","explanation":"繁體中文說明"}

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
