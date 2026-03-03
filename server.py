#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
server.py - PTE Practice System (JSON File Version)
"""

import os
import json
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs

PORT = int(os.environ.get('PORT', 10000))

# Simple JSON-based data store
DATA_FILE = 'pte_data.json'

def load_data():
    """Load data from JSON file"""
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'users': [], 'articles': [], 'questions': [], 'results': []}

def save_data(data):
    """Save data to JSON file"""
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# Initialize data
data = load_data()

# Create default admin user if not exists
admin_users = [u for u in data.get('users', []) if u.get('username') == 'admin']
if not admin_users:
    if 'users' not in data:
        data['users'] = []
    data['users'].append({
        'id': 1,
        'username': 'admin',
        'password': '$2a$10$dummy',  # Pre-hashed (simple check)
        'created_at': datetime.now().isoformat()
    })
    save_data(data)

# HTML Templates
LOGIN_HTML = '''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PTE 練習系統 - 登入</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-container { background: white; border-radius: 20px; padding: 40px; width: 90%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        h1 { color: #667eea; text-align: center; margin-bottom: 10px; }
        .subtitle { text-align: center; color: #888; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: 500; }
        input { width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 16px; }
        input:focus { outline: none; border-color: #667eea; }
        .btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(102,126,234,0.4); }
        .error { background: #fee; color: #c00; padding: 10px; border-radius: 8px; margin-bottom: 15px; display: none; }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>📚 PTE 練習系統</h1>
        <p class="subtitle">登入</p>
        <div class="error" id="error"></div>
        <form id="loginForm">
            <div class="form-group">
                <label>用戶名</label>
                <input type="text" name="username" required>
            </div>
            <div class="form-group">
                <label>密碼</label>
                <input type="password" name="password" required>
            </div>
            <button type="submit" class="btn">登 入</button>
        </form>
    </div>
    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const resp = await fetch('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(formData)), headers: {'Content-Type': 'application/json'} });
            const data = await resp.json();
            if (data.success) window.location.href = '/dashboard.html';
            else { document.getElementById('error').textContent = data.message || '登入失敗'; document.getElementById('error').style.display = 'block'; }
        });
    </script>
</body>
</html>'''

DASHBOARD_HTML = '''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PTE 練習系統 - 儀表板</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #f5f7fa; min-height: 100vh; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; border-radius: 15px; padding: 20px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .stat-card .number { font-size: 36px; font-weight: bold; color: #667eea; }
        .stat-card .label { color: #6b7280; font-size: 14px; margin-top: 5px; }
        .practice-section { background: white; border-radius: 15px; padding: 30px; margin-bottom: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .practice-section h2 { margin-bottom: 20px; }
        .question-types { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
        .question-type-card { border: 2px solid #e5e7eb; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.3s; }
        .question-type-card:hover { border-color: #667eea; transform: translateY(-3px); box-shadow: 0 5px 20px rgba(102,126,234,0.2); }
        .question-type-card .icon { font-size: 32px; margin-bottom: 10px; }
        .question-type-card .name { font-weight: 600; color: #333; }
        .question-type-card .desc { font-size: 12px; color: #6b7280; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📚 PTE 練習系統</h1>
        <a href="/" style="color: white; text-decoration: none;">登出</a>
    </div>
    <div class="container">
        <div class="stats-grid">
            <div class="stat-card"><div class="number">0</div><div class="label">總答題數</div></div>
            <div class="stat-card"><div class="number">0%</div><div class="label">正確率</div></div>
            <div class="stat-card"><div class="number">0</div><div class="label">連續天數</div></div>
            <div class="stat-card"><div class="number">0</div><div class="label">今日答題</div></div>
        </div>
        <div class="practice-section">
            <h2>🎯 選擇題型開始練習</h2>
            <div class="question-types">
                <div class="question-type-card"><div class="icon">📖</div><div class="name">Read Aloud</div><div class="desc">朗讀句子</div></div>
                <div class="question-type-card"><div class="icon">🔊</div><div class="name">Repeat Sentence</div><div class="desc">複誦句子</div></div>
                <div class="question-type-card"><div class="icon">✏️</div><div class="name">Fill in Blanks</div><div class="desc">填空題</div></div>
                <div class="question-type-card"><div class="icon">🔢</div><div class="name">Re-order</div><div class="desc">排序題</div></div>
                <div class="question-type-card"><div class="icon">✅</div><div class="name">Multiple Choice</div><div class="desc">選擇題</div></div>
                <div class="question-type-card"><div class="icon">⌨️</div><div class="name">Write from Dictation</div><div class="desc">聽寫題</div></div>
            </div>
        </div>
    </div>
</body>
</html>'''

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(LOGIN_HTML.encode())
        elif self.path == '/dashboard' or self.path == '/dashboard.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(DASHBOARD_HTML.encode())
        elif self.path == '/api/login':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        if self.path == '/api/login':
            length = int(self.headers.get('content-length', 0))
            body = self.rfile.read(length).decode()
            data = parse_qs(body)
            username = data.get('username', [''])[0]
            password = data.get('password', [''])[0]
            
            if username == 'admin' and password == 'PTE2026':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Set-Cookie', 'loggedin=true')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode())
            else:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'message': '登入失敗'}).encode())
        else:
            self.send_response(404)
            self.end_headers()

print(f'PTE Practice System running on http://localhost:{PORT}')
server = HTTPServer(('0.0.0.0', PORT), Handler)
server.serve_forever()
