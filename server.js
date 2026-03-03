const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const PASSWORD = process.env.PASSWORD || 'PTE2026';

// Simple JSON file storage
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'pte-practice-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.loggedIn) return next();
    res.redirect('/');
}

// Login
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === PASSWORD) {
        req.session.loggedIn = true;
        return res.json({ success: true });
    }
    res.json({ success: false, message: '密碼錯誤' });
});

// Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Dashboard (protected)
app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API: Submit answer
app.post('/api/submit', requireAuth, (req, res) => {
    const data = loadData();
    data.results.push({
        ...req.body,
        timestamp: new Date().toISOString()
    });
    saveData(data);
    res.json({ success: true });
});

// API: Get stats
app.get('/api/stats', requireAuth, (req, res) => {
    const data = loadData();
    const results = data.results || [];
    const total = results.length;
    const correct = results.filter(r => r.correct).length;
    res.json({ total, correct, rate: total ? Math.round(correct / total * 100) : 0 });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
    console.log(`PTE Practice System running on port ${PORT}`);
});
