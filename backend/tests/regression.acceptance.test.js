'use strict';

/**
 * Regression suite (Phase 8): the existing product areas must keep working while
 * ExpenseBot and Shared Expenses are repaired. Runs over real HTTP against the
 * isolated MongoDB test database — no production records are touched.
 *
 * Run: node backend/tests/regression.acceptance.test.js
 */

const h = require('./helpers');
const { createRunner, ok, notIncludes, matches, equal, closeTo } = require('./runner');

const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { startOfDayOffset, startOfMonthOffset, formatDate, todayParts } = require('../utils/dateUtil');

const A = `reg_user_a_${Date.now()}`;
const B = `reg_user_b_${Date.now()}`;
const PW = 'Test#12345';

let ctxA = null;
let ctxB = null;

function data(res) {
    return res.body && res.body.data !== undefined ? res.body.data : (res.body || {});
}

async function run(group, test) {
    await h.startServer();
    await h.resetData();
    ctxA = await h.registerAndLogin(A, PW);
    ctxB = await h.registerAndLogin(B, PW);

    // ------------------------------------------------------------------
    await group('1. Auth and authorization', async () => {
        await test('R01 register returns a token and never echoes the password', async () => {
            const u = `reg_new_${Date.now()}`;
            const res = await h.request('POST', '/auth/register', { body: { username: u, password: PW } });
            equal(res.status, 201, '201 created');
            ok(res.body.data.token, 'token issued');
            notIncludes(JSON.stringify(res.body), PW, 'password not returned');
            equal(await User.countDocuments({ username: u }), 1, 'one user row');
        });

        await test('R02 duplicate username is rejected instead of overwriting', async () => {
            const res = await h.request('POST', '/auth/register', { body: { username: A, password: 'Other#12345' } });
            ok(res.status === 400 || res.status === 409, `4xx expected, got ${res.status}`);
            const still = await h.request('POST', '/auth/login', { body: { username: A, password: PW } });
            equal(still.status, 200, 'original credentials still work');
        });

        await test('R03 GET /auth/me resolves the token owner only', async () => {
            const me = await h.request('GET', '/auth/me', { token: ctxA.token });
            equal(me.status, 200, '200');
            equal(me.body.data.username, A, 'own username');
            const noToken = await h.request('GET', '/auth/me');
            equal(noToken.status, 401, '401 without a token');
        });

        await test('R04 logout is authenticated and harmless', async () => {
            const res = await h.request('POST', '/auth/logout', { token: ctxA.token });
            equal(res.status, 200, '200');
            const anon = await h.request('POST', '/auth/logout', {});
            equal(anon.status, 401, 'logout requires a token');
        });

        await test('R05 protected read routes reject missing and forged tokens', async () => {
            for (const route of ['/transactions', '/dashboard/summary', '/income', '/bills', '/goals', '/loans', '/notifications', '/groups']) {
                const noToken = await h.request('GET', route);
                equal(noToken.status, 401, `401 for ${route} without token`);
                const forged = await h.request('GET', route, { token: 'a.b.c' });
                equal(forged.status, 401, `401 for ${route} with a forged token`);
            }
        });

        await test('R06 one user never sees another user\'s transactions', async () => {
            await Transaction.create({ user: ctxA.userId, amount: 777, category: 'Food', date: startOfDayOffset(0), description: 'A only', type: 'EXPENSE', source: 'manual' });
            const mine = data(await h.request('GET', '/transactions', { token: ctxA.token }));
            const theirs = data(await h.request('GET', '/transactions', { token: ctxB.token }));
            ok(mine.some(t => t.amount === 777), 'owner sees the record');
            ok(!theirs.some(t => t.amount === 777), 'other user does not');
        });
    });

    // ------------------------------------------------------------------
    await group('2. Transactions, dashboard and income', async () => {
        await test('R07 POST /transactions validates input instead of returning 500', async () => {
            const bad = [
                { category: 'Food', date: formatDate(startOfDayOffset(0)) },
                { amount: -50, category: 'Food', date: formatDate(startOfDayOffset(0)) },
                { amount: 100, date: formatDate(startOfDayOffset(0)) },
                { amount: 100, category: 'Food', date: 'not-a-date' }
            ];
            for (const body of bad) {
                const res = await h.request('POST', '/transactions', { token: ctxA.token, body });
                equal(res.status, 400, `400 expected for ${JSON.stringify(body)}`);
            }
            equal(await Transaction.countDocuments({ user: ctxA.userId, amount: { $lt: 0 } }), 0, 'no invalid rows stored');
        });

        await test('R07b created transaction is stored, listed and date-correct', async () => {
            const res = await h.request('POST', '/transactions', {
                token: ctxA.token,
                body: { amount: 320, category: 'Transport', date: formatDate(startOfDayOffset(0)), description: 'Bus pass', type: 'EXPENSE' }
            });
            equal(res.status, 201, '201 created');
            const list = data(await h.request('GET', '/transactions', { token: ctxA.token }));
            const row = list.find(t => t.amount === 320);
            ok(row, 'listed');
            equal(row.date, formatDate(startOfDayOffset(0)), 'date round-trips in the app timezone');
        });

        await test('R07c payment method and notes persist, normalise, and stay optional', async () => {
            const res = await h.request('POST', '/transactions', {
                token: ctxA.token,
                body: {
                    amount: 210, category: 'Food', date: formatDate(startOfDayOffset(0)),
                    description: 'Team lunch', type: 'EXPENSE',
                    paymentMethod: ' net banking ', notes: '  Split with roommate  '
                }
            });
            equal(res.status, 201, '201 created');
            equal(res.body.data.paymentMethod, 'NetBanking', 'payment method uses ExpenseBot\'s canonical value');
            equal(res.body.data.notes, 'Split with roommate', 'notes trimmed');

            const stored = await Transaction.findOne({ user: ctxA.userId, amount: 210 }).lean();
            ok(stored, 'row stored');
            equal(stored.paymentMethod, 'NetBanking', 'persisted method');
            equal(stored.notes, 'Split with roommate', 'persisted notes');

            const list = data(await h.request('GET', '/transactions', { token: ctxA.token }));
            const row = list.find(t => t.amount === 210);
            ok(row, 'listed');
            equal(row.paymentMethod, 'NetBanking', 'listed method');
            equal(row.notes, 'Split with roommate', 'listed notes');

            // Older clients (receipt scan, bank import) send neither field.
            const minimal = await h.request('POST', '/transactions', {
                token: ctxA.token,
                body: { amount: 211, category: 'Food', date: formatDate(startOfDayOffset(0)), description: 'No extras', type: 'EXPENSE' }
            });
            equal(minimal.status, 201, 'payload without the optional fields still works');
            equal(minimal.body.data.paymentMethod, '', 'method defaults to empty');
            equal(minimal.body.data.notes, '', 'notes default to empty');

            const tooLong = await h.request('POST', '/transactions', {
                token: ctxA.token,
                body: { amount: 212, category: 'Food', date: formatDate(startOfDayOffset(0)), notes: 'x'.repeat(201) }
            });
            equal(tooLong.status, 400, 'over-long notes rejected');
            equal(await Transaction.countDocuments({ user: ctxA.userId, amount: 212 }), 0, 'rejected row not stored');
        });

        await test('R08 dashboard summary totals come from the database', async () => {
            const start = startOfMonthOffset(0);
            await Transaction.insertMany([
                { user: ctxA.userId, amount: 1500, category: 'Groceries', date: start, description: 'Monthly shop', type: 'EXPENSE', source: 'manual' },
                { user: ctxA.userId, amount: 50000, category: 'Salary', date: start, description: 'Pay', type: 'INCOME', source: 'manual' }
            ]);
            const s = data(await h.request('GET', '/dashboard/summary', { token: ctxA.token }));
            const rows = await Transaction.find({ user: ctxA.userId, type: 'EXPENSE', date: { $gte: start } });
            const expected = rows.reduce((sum, t) => sum + t.amount, 0);
            ok(rows.length > 0, 'seeded expenses exist for this month');
            closeTo(s.totalExpenses, expected, 0.01, 'expenses match the DB');
            closeTo(s.balance, s.totalIncome - s.totalExpenses, 0.01, 'balance = income - expenses');
        });

        await test('R09 category summary and trend answer with arrays', async () => {
            const cats = await h.request('GET', '/dashboard/category-summary', { token: ctxA.token });
            equal(cats.status, 200, 'category summary 200');
            ok(Array.isArray(data(cats)), 'category summary is a list');
            const trend = data(await h.request('GET', '/dashboard/trend', { token: ctxA.token }));
            ok(Array.isArray(trend) && trend.length > 0, 'trend list returned');
        });

        await test('R10 income upsert stores one record per month and reads back', async () => {
            const t = todayParts();
            const month = t.month;
            const year = t.year;
            const first = await h.request('POST', '/income', { token: ctxA.token, body: { month, year, amount: 48000 } });
            equal(first.status, 200, 'first save ok');
            await h.request('POST', '/income', { token: ctxA.token, body: { month, year, amount: 52000 } });
            const rows = data(await h.request('GET', '/income', { token: ctxA.token }));
            equal(rows.filter(r => r.month === month && r.year === year).length, 1, 'upsert, not duplicate');
            const one = data(await h.request('GET', `/income/${year}/${month}`, { token: ctxA.token }));
            closeTo(one.amount, 52000, 0.01, 'latest amount kept');
            const bad = await h.request('POST', '/income', { token: ctxA.token, body: { month, year } });
            equal(bad.status, 400, 'missing amount rejected');
        });
    });

    // ------------------------------------------------------------------
    await group('3. Bank sync, OCR route and exports', async () => {
        await test('R11 demo bank connect -> sync creates records once', async () => {
            const before = await Transaction.countDocuments({ user: ctxA.userId, source: 'mock_bank' });
            const connect = await h.request('POST', '/bank/mock/connect', { token: ctxA.token });
            equal(connect.status, 200, 'connect ok');
            const sync = await h.request('POST', '/bank/mock/sync', { token: ctxA.token });
            equal(sync.status, 200, 'sync ok');
            const after = await Transaction.countDocuments({ user: ctxA.userId, source: 'mock_bank' });
            ok(after > before, `synced rows created (${before} -> ${after})`);

            const again = data(await h.request('POST', '/bank/mock/sync', { token: ctxA.token }));
            const afterSecond = await Transaction.countDocuments({ user: ctxA.userId, source: 'mock_bank' });
            equal(afterSecond, after, 'second sync adds no duplicates');
            ok(again.duplicatesSkipped >= 1, 'duplicates reported as skipped');
        });

        await test('R12 syncing while disconnected is refused', async () => {
            await h.request('POST', '/bank/mock/disconnect', { token: ctxA.token });
            const res = await h.request('POST', '/bank/mock/sync', { token: ctxA.token });
            equal(res.status, 400, '400 when not connected');
        });

        await test('R13 receipt OCR route requires a file and is honest without a configured key', async () => {
            const noFile = await h.request('POST', '/transactions/upload-receipt', { token: ctxA.token, body: {} });
            equal(noFile.status, 400, '400 when no image is sent');

            // multipart body with an empty field set (still no file part)
            const res = await fetch(`${h.BASE_URL}/transactions/upload-receipt`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${ctxA.token}` },
                body: new FormData()
            });
            ok(res.status === 400 || res.status === 503, `no-key/no-image path returns a clean 4xx/503, got ${res.status}`);
            const body = await res.text();
            ok(!/helloworld/.test(body), 'no demo key mentioned in the response');
        });

        await test('R14 PDF and Excel exports return real downloadable files', async () => {
            for (const [route, marker] of [['/export/pdf', '%PDF'], ['/export/excel', '<']]) {
                const res = await fetch(`${h.BASE_URL}${route}`, { headers: { Authorization: `Bearer ${ctxA.token}` } });
                equal(res.status, 200, `${route} status`);
                const text = await res.text();
                ok(text.length > 200, `${route} body is not empty`);
                ok(text.includes(marker), `${route} looks like a document (${marker})`);
                ok(/attachment/i.test(res.headers.get('content-disposition') || ''), `${route} is offered as a download`);
            }
        });

        await test('R15 exports require authentication', async () => {
            for (const route of ['/export/pdf', '/export/excel']) {
                const res = await fetch(`${h.BASE_URL}${route}`);
                equal(res.status, 401, `${route} without a token`);
            }
        });
    });

    // ------------------------------------------------------------------
    await group('4. Bills, goals, loans, notifications', async () => {
        await test('R16 bill create, list and pay updates only that bill', async () => {
            const created = await h.request('POST', '/bills', {
                token: ctxA.token,
                body: { billName: 'Water Bill', amount: 900, dueDate: formatDate(startOfDayOffset(5)), category: 'Bills', recurringFrequency: 'MONTHLY' }
            });
            equal(created.status, 201, 'bill created');
            const id = data(created)._id || data(created).id;
            const list = data(await h.request('GET', '/bills', { token: ctxA.token }));
            ok(list.some(b => b.billName === 'Water Bill'), 'listed');
            const paid = await h.request(`POST`, `/bills/${id}/pay`, { token: ctxA.token });
            equal(paid.status, 200, 'mark paid ok');
            const after = data(await h.request('GET', '/bills', { token: ctxA.token }));
            equal(after.find(b => String(b._id || b.id) === String(id)).isPaid, true, 'isPaid persisted');
            const bad = await h.request('POST', '/bills', { token: ctxA.token, body: { amount: 500 } });
            equal(bad.status, 400, 'missing billName rejected');
        });

        await test('R17 savings goal create, progress fields and delete', async () => {
            const created = await h.request('POST', '/goals', {
                token: ctxA.token,
                body: { goalName: 'New Laptop', targetAmount: 80000, targetDate: formatDate(startOfDayOffset(90)) }
            });
            equal(created.status, 201, 'goal created');
            const list = data(await h.request('GET', '/goals', { token: ctxA.token }));
            const goal = list.find(g => g.goalName === 'New Laptop');
            ok(goal, 'goal listed');
            ok('progressPercentage' in goal && 'remainingAmount' in goal, 'derived progress fields present');
            const id = goal._id || goal.id;
            const del = await h.request('DELETE', `/goals/${id}`, { token: ctxA.token });
            equal(del.status, 200, 'goal deleted');
            ok(!(await h.request('GET', '/goals', { token: ctxA.token })).body.data.some(g => g.goalName === 'New Laptop'), 'gone from the list');
        });

        await test('R18 loan record, repayment math and over-repayment refused', async () => {
            const created = await h.request('POST', '/loans', {
                token: ctxA.token,
                body: { personName: 'Mano', type: 'LENT', amount: 6000, dateGivenTaken: formatDate(startOfDayOffset(0)), dueDate: formatDate(startOfDayOffset(30)) }
            });
            equal(created.status, 201, 'loan created');
            const id = data(created)._id || data(created).id;
            const repay = await h.request('POST', `/loans/${id}/repayments`, { token: ctxA.token, body: { amount: 2000 } });
            equal(repay.status, 200, 'repayment recorded');
            const totals = data(await h.request('GET', '/loans/totals', { token: ctxA.token }));
            ok(totals.totalReceive <= 4000.01 && totals.totalReceive >= 3999, `remaining is 4000, got ${totals.totalReceive}`);
            const over = await h.request('POST', `/loans/${id}/repayments`, { token: ctxA.token, body: { amount: 99999 } });
            equal(over.status, 400, 'repaying more than owed is refused');
            const bad = await h.request('POST', '/loans', { token: ctxA.token, body: { personName: 'X', type: 'GIFT', amount: 100, dateGivenTaken: formatDate(startOfDayOffset(0)) } });
            equal(bad.status, 400, 'invalid loan type rejected');
        });

        await test('R19 notifications list and mark-read', async () => {
            const list = data(await h.request('GET', '/notifications', { token: ctxA.token }));
            ok(Array.isArray(list), 'notifications is a list');
            if (list.length) {
                const id = list[0].id || list[0]._id;
                const read = await h.request('PUT', `/notifications/${id}/read`, { token: ctxA.token });
                equal(read.status, 200, 'marked read');
                equal(data(read).isRead, true, 'flag persisted');
            } else {
                const all = await h.request('PUT', '/notifications/read-all', { token: ctxA.token });
                equal(all.status, 200, 'read-all still works with an empty inbox');
            }
            const other = await h.request('PUT', '/notifications/read-all', { token: ctxB.token });
            equal(other.status, 200, 'per-user scope does not error for another user');
        });

        await test('R24 an expense added over REST fires the budget alert exactly once', async () => {
            const Budget = require('../models/Budget');
            const Notification = require('../models/Notification');
            const { year, month } = todayParts();
            await Budget.create({ user: ctxB.userId, category: null, amount: 1000, month, year });

            const crossing = await h.request('POST', '/transactions', {
                token: ctxB.token,
                body: { amount: 850, category: 'Groceries', date: formatDate(startOfDayOffset(0)), description: 'Over the line' }
            });
            equal(crossing.status, 201, 'expense stored');
            equal(await Notification.countDocuments({ user: ctxB.userId, category: 'BUDGET' }), 1, 'crossing raises one alert');

            await h.request('POST', '/transactions', {
                token: ctxB.token,
                body: { amount: 50, category: 'Groceries', date: formatDate(startOfDayOffset(0)), description: 'Still over the line' }
            });
            equal(await Notification.countDocuments({ user: ctxB.userId, category: 'BUDGET' }), 1, 'no repeat alert while still crossed');
            equal(await Notification.countDocuments({ user: ctxA.userId, category: 'BUDGET' }), 0, 'alert is scoped to its own user');
        });
    });

    // ------------------------------------------------------------------
    await group('5. Chat contract and navigation', async () => {
        await test('R20 /api/ai alias uses the same engine and auth', async () => {
            const res = await h.request('POST', '/ai/chat', { token: ctxA.token, body: { message: 'How much did I spend this month?' } });
            equal(res.status, 200, 'alias answers');
            const b = res.body || {};
            const reply = b.reply || b.data?.reply || b.data?.answer || '';
            matches(reply, /₹/, 'amount formatted in rupees');
            const anon = await h.request('POST', '/ai/chat', { body: { message: 'balance' } });
            equal(anon.status, 401, 'alias is protected too');
        });

        await test('R21 chat reset clears only this user\'s memory', async () => {
            await h.chat(ctxA.token, 'How much did I spend this month?');
            const res = await h.request('POST', '/chat/reset', { token: ctxA.token });
            equal(res.status, 200, 'reset ok');
            const anon = await h.request('POST', '/chat/reset');
            equal(anon.status, 401, 'reset requires a token');
        });

        await test('R22 unknown API route returns the JSON 404 the frontend handles', async () => {
            const res = await h.request('GET', '/definitely-not-a-route', { token: ctxA.token });
            equal(res.status, 404, '404');
            ok(res.body && res.body.success === false, 'JSON envelope, not HTML');
            matches(res.body.message || '', /not found/i, 'message present');
        });

        await test('R23 malformed ids do not leak stack traces', async () => {
            const res = await h.request('DELETE', '/goals/not-an-id', { token: ctxA.token });
            ok(res.status === 400 || res.status === 404 || res.status === 500, `handled status, got ${res.status}`);
            const body = JSON.stringify(res.body || {});
            ok(!/at .*node_modules|MongoServerError|undefined undefined/.test(body), 'no stack trace in the response');
        });
    });
}

(async () => {
    const { group, test, summary } = createRunner('Regression');
    let crashed = null;
    try {
        await run(group, test);
    } catch (fatal) {
        crashed = fatal;
    }
    const s = summary();
    if (crashed) console.error('\nSUITE CRASHED:', crashed.stack || crashed.message);
    await h.stopAll();
    process.exit(crashed ? 1 : (s.failed ? 1 : 0));
})();
