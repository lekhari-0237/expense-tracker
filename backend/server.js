const path = require('path');
const dotenv = require('dotenv');

// Load environment variables: backend/.env first, then root .env
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const pkg = require('./package.json');

// Identity string the frontend and the Vite dev proxy check for, so a request that
// lands on another service listening on the same port (the legacy Spring Boot jar
// answers /api/auth/login too) is detected instead of silently mis-serving data.
const SERVICE_ID = 'expense-tracker-node-api';

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Incoming Request Logger Middleware
app.use((req, res, next) => {
    console.log(`[Incoming Request] ${req.method} ${req.originalUrl || req.url}`);
    next();
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat')); // Chatbot endpoint for ExpenseBot
app.use('/api/ai', require('./routes/chat'));   // Alias for backwards-compatibility (/api/ai and /api/ai/chat)
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/income', require('./routes/income'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/bank', require('./routes/bank'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/export', require('./routes/export'));
app.use('/api/notifications', require('./routes/notifications'));

// Public identity/config probe. Reports only booleans about which integrations are
// configured — never a key, token or connection string.
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: SERVICE_ID,
        runtime: 'node-express',
        version: pkg.version,
        env: process.env.NODE_ENV || 'development',
        uptimeSeconds: Math.round(process.uptime()),
        database: {
            connected: mongoose.connection.readyState === 1
        },
        capabilities: {
            receiptOcr: Boolean(process.env.OCR_SPACE_API_KEY),
            gemini: Boolean(process.env.GEMINI_API_KEY)
        }
    });
});

// 404 Handler for undefined routes
app.use((req, res) => {
    const missingRoute = `${req.method} ${req.originalUrl || req.url}`;
    console.warn(`[404 Not Found] ${missingRoute}`);
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route not found: ${missingRoute}`,
        path: req.originalUrl || req.url,
        method: req.method
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(`[Server Error] ${req.method} ${req.originalUrl || req.url}:`, err.stack || err.message || err);
    res.status(err.status || 500).json({
        success: false,
        error: err.name || 'InternalServerError',
        message: err.message || 'Internal Server Error',
        path: req.originalUrl || req.url
    });
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch((err) => console.error('MongoDB connection error:', err));

const PORT = Number(process.env.PORT) || 5000;
const server = app.listen(PORT, () => {
    console.log(`[${SERVICE_ID}] listening on http://localhost:${PORT}`);
    console.log(`[Chat Endpoint Ready] POST http://localhost:${PORT}/api/chat`);
    console.log(`[Identity Probe] GET http://localhost:${PORT}/api/health`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(
            `[Port conflict] Nothing else can bind :${PORT} — on this machine port 5000 is ` +
            `already held by the legacy Spring Boot service, which answers /api/auth/login with ` +
            `the same JSON envelope. Start Node on a free port and point the frontend at it:\n` +
            `    PORT=4000 npm start              (backend)\n` +
            `    VITE_DEV_API_URL=http://localhost:4000  (frontend dev server)`
        );
    }
    console.error('[Server listen error]', err.message || err);
    process.exit(1);
});

module.exports = server;
module.exports.SERVICE_ID = SERVICE_ID;
