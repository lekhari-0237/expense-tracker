'use strict';

/**
 * Shared test harness.
 *
 * Isolation rules (this suite must never touch production data):
 *   - The DB name is forced to TEST_DB_NAME before the app boots; mongoose
 *     connections created by server.js inherit it.
 *   - Every collection is emptied in `resetData()` before each suite.
 *   - Only users created by these tests exist in that database.
 */

const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });
dotenv.config({ path: path.resolve(ROOT, '..', '.env') });

const TEST_DB_NAME = process.env.TEST_MONGO_DB || 'expense_tracker_test';
const BASE_URI = process.env.MONGO_URI;

if (!BASE_URI) {
    throw new Error('MONGO_URI is not configured — refusing to run tests.');
}

const TEST_URI = BASE_URI.replace(/\/([^/?]*)(\?.*)?$/, `/${TEST_DB_NAME}$2`);
process.env.MONGO_URI = TEST_URI;
process.env.PORT = process.env.TEST_PORT || '5099';
if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured — refusing to run tests.');
}
process.env.NODE_ENV = 'test';
// Deterministic runs: ExpenseBot answers from the database, so the suites never
// depend on (or bill) a live Gemini call. Unmatched input must fall back locally.
process.env.GEMINI_API_KEY = '';
// Same for receipt OCR: no test may reach (or bill) a live provider. The suites
// assert the documented "not configured" behaviour instead.
process.env.OCR_SPACE_API_KEY = '';

const mongoose = require('mongoose');

const BASE_URL = `http://127.0.0.1:${process.env.PORT}/api`;

let server = null;

function dbOf(uri) {
    const m = String(uri).match(/\/([^/?]*)(\?|$)/);
    return m ? m[1] : '';
}

async function startServer() {
    if (server) return server;
    const prodDb = dbOf(BASE_URI);
    if (prodDb === TEST_DB_NAME) {
        throw new Error(`Refusing to run: test database name "${TEST_DB_NAME}" is the production database.`);
    }
    server = require(path.join(ROOT, 'server.js'));

    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve, reject) => {
            const ok = () => { cleanup(); resolve(); };
            const fail = (e) => { cleanup(); reject(e); };
            const cleanup = () => {
                mongoose.connection.removeListener('connected', ok);
                mongoose.connection.removeListener('error', fail);
                mongoose.connection.removeListener('disconnected', fail);
            };
            mongoose.connection.once('connected', ok);
            mongoose.connection.once('error', fail);
            setTimeout(() => { cleanup(); reject(new Error('MongoDB connection timed out')); }, 25000);
        });
    }
    if (mongoose.connection.name !== TEST_DB_NAME) {
        throw new Error(`Connected to "${mongoose.connection.name}" instead of the test database "${TEST_DB_NAME}". Aborting.`);
    }

    // Wait until HTTP actually answers, so no test runs against a half-booted server.
    for (let i = 0; i < 40; i++) {
        try {
            const res = await fetch(`${BASE_URL}/chat`);
            if (res.status === 401 || res.status === 404 || res.status === 200) break;
        } catch (e) { /* not listening yet */ }
        await new Promise(r => setTimeout(r, 250));
    }
    return server;
}

async function resetData() {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map(c => c.deleteMany({})));
}

async function createUser({ username, password = 'Test#12345', email } = {}) {
    const hash = await bcrypt.hash(password, 10);
    const User = require('../models/User');
    const user = await User.create({ username, email: email || `${username}@test.local`, passwordHash: hash });
    return { user, password };
}

async function login(username, password) {
    const res = await request('POST', '/auth/login', { body: { username, password } });
    return res;
}

async function registerAndLogin(username, password = 'Test#12345') {
    const reg = await request('POST', '/auth/register', { body: { username, password, email: `${username}@test.local` } });
    if (!reg.body?.data?.token) {
        throw new Error(`Could not register test user "${username}": ${JSON.stringify(reg.body)}`);
    }
    return { token: reg.body.data.token, userId: reg.body.data.userId, username };
}

async function request(method, route, { token, body, raw } = {}) {
    const headers = {};
    if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${route}`, {
        method,
        headers,
        body: raw !== undefined ? raw : (body !== undefined ? JSON.stringify(body) : undefined)
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { parsed = text; }
    return { status: res.status, body: parsed, headers: res.headers, contentType: res.headers.get('content-type') };
}

/** POST /api/chat as an authenticated user. */
async function chat(token, message) {
    const res = await request('POST', '/chat', { token, body: { message } });
    const b = res.body || {};
    return {
        status: res.status,
        reply: b.reply || b.message || b.data?.reply || b.data?.answer || '',
        refreshData: b.refreshData === true || b.data?.refreshData === true,
        downloadFormat: b.downloadFormat || b.data?.downloadFormat || null,
        pendingAction: b.pendingAction || b.data?.pendingAction || null,
        intent: b.intent || null,
        raw: b
    }
    ;
}

function inr(n) {
    return Number(n).toLocaleString('en-IN');
}

async function stopAll() {
    try { await mongoose.disconnect(); } catch (e) { /* already closed */ }
    if (server && typeof server.close === 'function') {
        await new Promise(resolve => server.close(resolve));
    }
}

module.exports = {
    TEST_DB_NAME,
    BASE_URL,
    mongoose,
    startServer,
    resetData,
    createUser,
    registerAndLogin,
    login,
    request,
    chat,
    inr,
    stopAll
};
