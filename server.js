const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD8C1Xc5R8T7vL9K2M4N6P0Q8R1S3T5U7V';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'pte-practice-secret-key-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Database
const db = new sqlite3.Database('./pte.db');

// Initialize Database
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Articles table
    db.run(`CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        source TEXT DEFAULT 'The Economist',
        date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Questions table
    db.run(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id INTEGER,
        type TEXT,
        content TEXT,
        options TEXT,
        answer TEXT,
        explanation TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (article_id) REFERENCES articles(id)
    )`);

    // Results table
    db.run(`CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        question_id INTEGER,
        user_answer TEXT,
        is_correct INTEGER,
        answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (question_id) REFERENCES questions(id)
    )`);

    // Create default admin user if not exists
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('PTE2026', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)`, ['admin', hash], (err) => {
        if (err) console.log('Admin user might exist:', err.message);
    });
});

// Auth middleware
function requireAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/');
    }
}

// ============ ROUTES ============

// Home - Login
app.get('/', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) {
            return res.json({ success: false, message: '用戶不存在' });
        }

        const bcrypt = require('bcryptjs');
        if (bcrypt.compareSync(password, user.password)) {
            req.session.userId = user.id;
            req.session.username = user.username;
            return res.json({ success: true });
        }
        
        res.json({ success: false, message: '密碼錯誤' });
    });
});

// Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Get today's articles and questions
app.get('/api/today', requireAuth, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    
    db.all(`SELECT * FROM articles WHERE date = ? ORDER BY created_at DESC`, [today], (err, articles) => {
        if (err) return res.json({ error: err.message });
        
        if (articles.length === 0) {
            // Return sample data if no articles
            return res.json({
                articles: [{
                    id: 1,
                    title: 'The Future of AI in Education',
                    content: 'Artificial intelligence is transforming how students learn. With personalized tutoring systems and adaptive learning platforms, education becomes more accessible than ever before.',
                    date: today
                }],
                questions: getSampleQuestions()
            });
        }
        
        // Get questions for today's articles
        const articleIds = articles.map(a => a.id);
        db.all(`SELECT * FROM questions WHERE article_id IN (${articleIds.join(',')})`, (err, questions) => {
            res.json({ articles, questions: questions.length > 0 ? questions : getSampleQuestions() });
        });
    });
});

// Generate questions from article (using AI)
app.post('/api/generate-questions', requireAuth, async (req, res) => {
    const { articleId, types } = req.body;
    
    db.get(`SELECT * FROM articles WHERE id = ?`, [articleId], async (err, article) => {
        if (err || !article) {
            return res.json({ error: 'Article not found' });
        }

        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            
            const prompt = `Based on the following article, generate PTE exam style questions. 
            
Article: ${article.content}

Generate questions for these types: ${types.join(', ')}

For each question, provide:
1. Question type
2. Question content
3. Options (for multiple choice)
4. Correct answer
5. Brief explanation

Return as JSON array.`;

            const result = await model.generateContent(prompt);
            const response = result.response.text();
            
            // Parse and save questions
            try {
                const questions = JSON.parse(response.replace(/```json|```/g, '').trim());
                
                questions.forEach(q => {
                    db.run(`INSERT INTO questions (article_id, type, content, options, answer, explanation) 
                            VALUES (?, ?, ?, ?, ?, ?)`,
                        [articleId, q.type, q.content, JSON.stringify(q.options), q.answer, q.explanation]);
                });
                
                res.json({ success: true, questions });
            } catch (parseErr) {
                res.json({ success: true, generated: true, raw: response });
            }
        } catch (aiErr) {
            res.json({ error: aiErr.message });
        }
    });
});

// Submit answer
app.post('/api/submit', requireAuth, (req, res) => {
    const { questionId, userAnswer } = req.body;
    
    db.get(`SELECT * FROM questions WHERE id = ?`, [questionId], (err, question) => {
        if (err || !question) {
            return res.json({ error: 'Question not found' });
        }

        const isCorrect = userAnswer.toLowerCase().trim() === question.answer.toLowerCase().trim();
        
        db.run(`INSERT INTO results (user_id, question_id, user_answer, is_correct) VALUES (?, ?, ?, ?)`,
            [req.session.userId, questionId, userAnswer, isCorrect ? 1 : 0],
            (err) => {
                res.json({ 
                    correct: isCorrect,
                    correctAnswer: question.answer,
                    explanation: question.explanation
                });
            });
    });
});

// Get statistics
app.get('/api/stats', requireAuth, (req, res) => {
    db.all(`SELECT 
                q.type,
                COUNT(*) as total,
                SUM(r.is_correct) as correct
            FROM results r
            JOIN questions q ON r.question_id = q.id
            WHERE r.user_id = ?
            GROUP BY q.type`, [req.session.userId], (err, stats) => {
        res.json(stats);
    });
});

// Get history
app.get('/api/history', requireAuth, (req, res) => {
    db.all(`SELECT 
                r.*,
                q.type,
                q.content as question_content,
                q.answer
            FROM results r
            JOIN questions q ON r.question_id = q.id
            WHERE r.user_id = ?
            ORDER BY r.answered_at DESC
            LIMIT 50`, [req.session.userId], (err, history) => {
        res.json(history);
    });
});

// API: Add article
app.post('/api/articles', requireAuth, (req, res) => {
    const { title, content, date } = req.body;
    const articleDate = date || new Date().toISOString().split('T')[0];
    
    db.run(`INSERT INTO articles (title, content, date) VALUES (?, ?, ?)`,
        [title, content, articleDate],
        function(err) {
            if (err) return res.json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

// Sample questions generator
function getSampleQuestions() {
    return [
        {
            id: 1,
            type: 'FIB',
            content: 'Artificial intelligence is transforming how students ____.',
            options: ['learn', 'learns', 'learning', 'learned'],
            answer: 'learn',
            explanation: 'The base form of verb is used after "students" in this context.'
        },
        {
            id: 2,
            type: 'MC',
            content: 'What is the main topic of the article?',
            options: ['Sports', 'AI in Education', 'Climate Change', 'Economics'],
            answer: 'AI in Education',
            explanation: 'The article discusses how AI is changing education.'
        },
        {
            id: 3,
            type: 'RO',
            content: 'Arrange the sentences in order:',
            sentences: [
                'Education becomes more accessible.',
                'With personalized tutoring systems.',
                'Artificial intelligence is transforming education.',
                'And adaptive learning platforms.'
            ],
            answer: '3,2,4,1',
            explanation: 'The logical flow starts with the main topic, then explains how, then adds more detail, then concludes.'
        },
        {
            id: 4,
            type: 'WFD',
            content: 'Listen and type the sentence:',
            audio: '/audio/sample.mp3',
            answer: 'Education becomes more accessible than ever before.',
            explanation: 'Listen carefully to the audio and type the exact sentence.'
        },
        {
            id: 5,
            type: 'RA',
            content: 'Read the following sentence aloud:',
            text: 'Artificial intelligence is transforming how students learn.',
            answer: 'recorded',
            explanation: 'Record yourself reading this sentence clearly and fluently.'
        }
    ];
}

// Start server
app.listen(PORT, () => {
    console.log(`PTE Practice System running on http://localhost:${PORT}`);
    console.log(`Default login: admin / PTE2026`);
});
