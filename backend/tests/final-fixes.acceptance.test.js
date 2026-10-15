'use strict';

/**
 * Final-fixes acceptance suite: API identity/configuration, the budget REST API
 * used by the Budget Manager page, report file contents (payment method, notes,
 * timezone dates, pagination) and the frontend download wiring, the shared-expense
 * / ExpenseBot regressions the frontend depends on, and receipt upload when no
 * OCR provider is configured. Real HTTP against the isolated MongoDB test
 * database only.
 *
 * Run: node backend/tests/final-fixes.acceptance.test.js
 */

const fs = require('fs');
const path = require('path');

const h = require('./helpers');
const { createRunner, ok, includes, notIncludes, matches, equal, closeTo } = require('./runner');

const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Notification = require('../models/Notification');
const Group = require('../models/Group');
const { startOfDayOffset, startOfMonthOffset, formatDate, getZoneParts, resolvePeriod } = require('../utils/dateUtil');

const A = `fix_user_a_${Date.now()}`;
const B = `fix_user_b_${Date.now()}`;
const PW = 'Test#12345';

let ctxA = null;
let ctxB = null;

function data(res) {
    return res.body && res.body.data !== undefined ? res.body.data : (res.body || {});
}

function budgetRow(d, category = null) {
    if (category === null) return d.overall;
    return (d.categoryStatuses || []).find(s => s.category === category);
}

// The PDF is built from literal strings, so the visible text can be read back
// without a PDF library.
function pdfText(buffer) {
    const raw = buffer.toString('latin1');
    const found = [...raw.matchAll(/\(((?:[^()]|\\.)*?)\)\s*Tj/g)].map(m => m[1].replace(/\\([()\\])/g, '$1'));
    return found.join('\n');
}

async function binaryGet(route, token) {
    const res = await fetch(`${h.BASE_URL}${route}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: res.status, contentType: res.headers.get('content-type'), disposition: res.headers.get('content-disposition'), buffer: Buffer.from(await res.arrayBuffer()) };
}

async function addExpense(body, token = ctxA.token) {
    return h.request('POST', '/transactions', { token, body });
}

async function run(group, test) {
    await h.startServer();
    await h.resetData();
    ctxA = await h.registerAndLogin(A, PW);
    ctxB = await h.registerAndLogin(B, PW);

    // ------------------------------------------------------------------
    await group('1. API identity and configuration', async () => {
        await test('F01 GET /api/health is public and names the Node API', async () => {
            const res = await h.request('GET', '/health');
            equal(res.status, 200, 'no token required');
            equal(res.body.service, 'expense-tracker-node-api', 'service identity');
            equal(res.body.runtime, 'node-express', 'runtime identity');
            equal(res.body.database.connected, true, 'database connected');
        });

        await test('F02 health never leaks a credential or connection string', async () => {
            const res = await h.request('GET', '/health');
            const text = JSON.stringify(res.body);
            notIncludes(text, 'mongodb', 'no database URI');
            notIncludes(text, 'jwt_secret', 'no jwt secret');
            ok(!/[A-Za-z0-9-_]{30,}\.[A-Za-z0-9-_]{10,}/.test(text), 'no token-shaped value in the payload');
            equal(typeof res.body.capabilities.receiptOcr, 'boolean', 'ocr reported as a boolean only');
            equal(typeof res.body.capabilities.gemini, 'boolean', 'gemini reported as a boolean only');
        });

        await test('F03 login through the API base returns the Node envelope', async () => {
            const res = await h.request('POST', '/auth/login', { body: { username: A, password: PW } });
            equal(res.status, 200, 'login works on the configured port');
            equal(res.body.success, true, 'success flag');
            ok(res.body.data && res.body.data.token, 'token issued');
            const bad = await h.request('POST', '/auth/login', { body: { username: A, password: 'Wrong#12345' } });
            equal(bad.status, 401, 'wrong password refused');
        });

        await test('F04 every frontend feature route is mounted on this API', async () => {
            for (const route of ['/transactions', '/dashboard/summary', '/income', '/groups', '/goals', '/budgets', '/notifications', '/export/pdf', '/export/excel', '/bills', '/loans', '/bank/mock/accounts']) {
                const res = await h.request('GET', route, { token: ctxA.token });
                ok(res.status !== 404, `${route} is served by the Node API (got ${res.status})`);
            }
            const chat = await h.chat(ctxA.token, 'How much did I spend this month?');
            includes(chat.reply, '₹', 'chatbot answers through the same base URL');
        });
    });

    // ------------------------------------------------------------------
    await group('2. Budget REST API', async () => {
        await test('F05 budgets require authentication', async () => {
            for (const [method, route] of [['GET', '/budgets'], ['POST', '/budgets'], ['PUT', '/budgets/any'], ['DELETE', '/budgets/any']]) {
                const res = await h.request(method, route, { body: method === 'GET' || method === 'DELETE' ? undefined : {} });
                equal(res.status, 401, `${method} ${route} without a token`);
            }
        });

        await test('F06 overall and category budgets create, list and compute live spending', async () => {
            const today = startOfDayOffset(0);
            await addExpense({ amount: 1200.5, category: 'Groceries', date: formatDate(today), description: 'Weekly shopping', paymentMethod: 'UPI', notes: 'big basket' });
            await addExpense({ amount: 300, category: 'Food', date: formatDate(today), description: 'Lunch' });

            const overall = await h.request('POST', '/budgets', { token: ctxA.token, body: { amount: 5000 } });
            equal(overall.status, 201, 'overall budget created');
            equal(data(overall).budget.amount, 5000, 'amount stored and echoed back');
            equal(data(overall).budget.category, null, 'no category = overall budget');
            ok(data(overall).status, 'the full status comes back with the write');

            const cat = await h.request('POST', '/budgets', { token: ctxA.token, body: { category: 'Groceries', amount: 1000, alertThreshold: 0.9 } });
            equal(cat.status, 201, 'category budget created');
            equal(data(cat).budget.alertThreshold, 0.9, 'threshold stored');

            const list = data(await h.request('GET', '/budgets', { token: ctxA.token }));
            equal(list.hasBudgets, true, 'budgets present');
            const row = budgetRow(list, 'Groceries');
            closeTo(row.spent, 1200.5, 0.001, 'spent comes from transactions');
            closeTo(row.remaining, -200.5, 0.001, 'remaining can go negative when overspent');
            equal(row.exceeded, true, 'overspent flagged as exceeded');
            equal(row.nearLimit, false, 'a budget over the limit is not merely "near" the limit');
            equal(row.percentUsed, 120, 'percent used rounded');
            const overallRow = budgetRow(list);
            closeTo(overallRow.spent, 1500.5, 0.001, 'overall covers every category');
            equal(overallRow.exceeded, false, 'overall still inside the limit');
            equal(overallRow.nearLimit, false, '30% used is not near a 80% threshold');
        });

        await test('F07 re-posting the same category updates instead of duplicating', async () => {
            const before = await Budget.countDocuments({ user: ctxA.userId, category: 'Groceries' });
            const again = await h.request('POST', '/budgets', { token: ctxA.token, body: { category: 'Groceries', amount: 2500 } });
            equal(again.status, 200, '200 for an update, not 201');
            const after = await Budget.countDocuments({ user: ctxA.userId, category: 'Groceries' });
            equal(after, before, 'still one budget row for that category and month');
            equal(budgetRow(data(await h.request('GET', '/budgets', { token: ctxA.token })), 'Groceries').amount, 2500, 'new limit used');
        });

        await test('F08 PUT edits the limit and threshold of the addressed budget', async () => {
            const list = data(await h.request('GET', '/budgets', { token: ctxA.token }));
            const row = budgetRow(list, 'Groceries');
            const res = await h.request('PUT', `/budgets/${row.id}`, { token: ctxA.token, body: { amount: 4000, alertThreshold: 0.5 } });
            equal(res.status, 200, 'update accepted');
            const after = data(await h.request('GET', '/budgets', { token: ctxA.token }));
            const edited = budgetRow(after, 'Groceries');
            equal(edited.amount, 4000, 'limit edited');
            equal(edited.alertThreshold, 0.5, 'threshold edited');
            equal(edited.percentUsed, 30, 'progress recalculated');
        });

        await test('F09 budget input validation returns 400 with a usable message', async () => {
            const cases = [
                [{ amount: 0 }, 'zero limit'],
                [{ amount: -500 }, 'negative limit'],
                [{ amount: 'abc' }, 'non numeric limit'],
                [{ amount: 1000, alertThreshold: 5 }, 'threshold above 100%'],
                [{ amount: 1000, alertThreshold: 0 }, 'threshold below 1%']
            ];
            for (const [body, label] of cases) {
                const res = await h.request('POST', '/budgets', { token: ctxA.token, body });
                equal(res.status, 400, `400 expected for ${label}`);
                matches(res.body.message, /budget|threshold/i, `${label} explains itself`);
            }
            const emptyPut = await h.request('PUT', '/budgets', { token: ctxA.token, body: {} });
            ok(emptyPut.status === 400 || emptyPut.status === 404, `empty PUT handled (${emptyPut.status})`);
        });

        await test('F10 another user cannot read, edit or delete a budget', async () => {
            const list = data(await h.request('GET', '/budgets', { token: ctxA.token }));
            const row = budgetRow(list, 'Groceries');
            const spyGet = await h.request('GET', '/budgets', { token: ctxB.token });
            equal(data(spyGet).hasBudgets, false, "bystander list does not contain A's budgets");

            const put = await h.request('PUT', `/budgets/${row.id}`, { token: ctxB.token, body: { amount: 1 } });
            equal(put.status, 404, 'bystander PUT is a 404, not a 403 (no id enumeration)');
            const del = await h.request('DELETE', `/budgets/${row.id}`, { token: ctxB.token });
            equal(del.status, 404, 'bystander DELETE is refused');
            const still = data(await h.request('GET', '/budgets', { token: ctxA.token }));
            equal(budgetRow(still, 'Groceries').amount, 4000, "owner's budget untouched");
        });

        await test('F11 threshold alert fires once per crossing and clears with the budget', async () => {
            const fresh = `fix_alert_${Date.now()}`;
            const ctx = await h.registerAndLogin(fresh, PW);
            await addExpense({ amount: 900, category: 'Food', date: formatDate(startOfDayOffset(0)), description: 'Crossing meal' }, ctx.token);

            const created = await h.request('POST', '/budgets', { token: ctx.token, body: { amount: 1000, alertThreshold: 0.8 } });
            equal(created.status, 201, 'budget created under already-crossed spending');

            const alerts = () => Notification.countDocuments({ user: ctx.userId, category: 'BUDGET' });
            equal(await alerts(), 1, 'reading the status raised exactly one alert');
            await h.request('GET', '/budgets', { token: ctx.token });
            await h.request('GET', '/budgets', { token: ctx.token });
            equal(await alerts(), 1, 'repeat reads do not spam the alert');

            const list = data(await h.request('GET', '/budgets', { token: ctx.token }));
            equal(budgetRow(list).alertTriggered, true, 'the crossing is recorded on the budget itself');

            await h.request('POST', '/transactions', { token: ctx.token, body: { amount: 5000, category: 'Rent', date: formatDate(startOfDayOffset(0)), description: 'Big rent' } });
            equal(await alerts(), 1, 'a second crossing of the same budget does not alert again');

            const del = await h.request('DELETE', `/budgets/${budgetRow(list).id}`, { token: ctx.token });
            equal(del.status, 200, 'delete own budget');
            equal(await Budget.countDocuments({ user: ctx.userId }), 0, 'budget row removed');
            equal(await alerts(), 0, 'the orphaned alert went with it');
        });

        await test('F12 budget spending endpoint matches the transactions endpoint', async () => {
            const spend = data(await h.request('GET', '/budgets/spending', { token: ctxA.token }));
            const rows = data(await h.request('GET', '/transactions?limit=500', { token: ctxA.token }));
            const monthStart = startOfMonthOffset(0).getTime();
            const monthEnd = startOfMonthOffset(1).getTime();
            const expected = rows.filter(r => {
                const t = new Date(r.date).getTime();
                return t >= monthStart && t < monthEnd && String(r.type).toUpperCase() === 'EXPENSE';
            }).reduce((s, r) => s + Math.round(r.amount * 100), 0);
            equal(Math.round(spend.total * 100), expected, 'month-to-date total agrees with the listed rows');
            const parts = getZoneParts(new Date(spend.rangeStart));
            equal(spend.month, parts.month, 'month is the current app-timezone month');
            equal(spend.year, parts.year, 'year is the current app-timezone year');
            equal(new Date(spend.rangeEnd).getTime() >= new Date(spend.rangeStart).getTime(), true, 'range end follows range start');
            ok(Object.keys(spend.byCategory).every(c => typeof c === 'string'), 'spending is grouped by category name');
        });
    });

    // ------------------------------------------------------------------
    await group('3. PDF and Excel report contents', async () => {
        const seedForReports = async () => {
            await h.resetData();
            ctxA = await h.registerAndLogin(A, PW);
            ctxB = await h.registerAndLogin(B, PW);
            const today = startOfDayOffset(0);
            await addExpense({ amount: 1250.45, category: 'Groceries', date: formatDate(today), description: 'Weekly supermarket run', paymentMethod: 'UPI', notes: 'with (paren) & symbols' });
            await addExpense({ amount: 500, category: 'Transport', date: formatDate(today), description: 'Fuel top-up', paymentMethod: 'Cash' });
            const income = await addExpense({ amount: 45000, category: 'Salary', date: formatDate(today), description: 'Monthly salary', type: 'INCOME', paymentMethod: 'NetBanking', notes: 'October pay' });
            ok(income.status === 201, 'income seeded');
        };

        await test('F13 PDF carries payment method, notes, signed amounts and totals', async () => {
            await seedForReports();
            const today = todayForReports();
            const pdf = await binaryGet('/export/pdf?period=current_month', ctxA.token);
            equal(pdf.status, 200, 'pdf returned');
            ok(pdf.buffer.slice(0, 8).toString('latin1').startsWith('%PDF-1.'), 'real PDF header');
            ok(/attachment/i.test(pdf.disposition || '') && /\.pdf"/i.test(pdf.disposition || ''), `filename matches the PDF payload (${pdf.disposition})`);
            equal(pdf.contentType, 'application/pdf', 'MIME matches the payload');

            const text = pdfText(pdf.buffer);
            for (const needle of ['Date', 'Type', 'Category', 'Description', 'Method', 'Notes', 'Amount INR']) {
                includes(text, needle, `column header ${needle}`);
            }
            includes(text, 'UPI', 'payment method of the grocery row');
            includes(text, 'Cash', 'payment method of the fuel row');
            includes(text, 'NetBanking', 'payment method of the salary row');
            includes(text, 'October pay', 'note text carried through');
            includes(text, '(paren) & symbols', 'PDF parentheses and ampersand survive escaping');
            includes(text, formatDate(today), 'date rendered in the app timezone');
            includes(text, `Period: ${resolvePeriod('current_month').label}`, 'pdf names the reported period');
            notIncludes(text, 'T00:00:00', 'no raw ISO timestamps in the table');
            includes(text, '+45000.00', 'income signed positive');
            includes(text, '-1250.45', 'expense amount exact to the paisa');
            includes(text, 'Income INR 45000.00', 'income total rounded to paise');
            includes(text, 'Expense INR 1750.45', 'expense total rounded to paise');
            includes(text, 'Net INR 43249.55', 'net balance equals income minus expense');
        });

        await test('F14 PDF prints every transaction across pages instead of capping at 30', async () => {
            await seedForReports();
            const many = [];
            const today = startOfDayOffset(0);
            for (let i = 0; i < 55; i++) {
                many.push({ user: ctxA.userId, amount: 10 + i * 0.01, category: 'Transport', date: today, description: `Trip ${i}`, type: 'EXPENSE', source: 'manual', paymentMethod: 'Cash', notes: `note ${i}` });
            }
            await Transaction.insertMany(many);
            const pdf = await binaryGet('/export/pdf?period=current_month', ctxA.token);
            const text = pdfText(pdf.buffer);
            includes(text, 'Page 1 of', 'page footer present');
            matches(text, /Page 1 of [2-9]/, 'spills onto a second page');
            for (let i = 0; i < 55; i++) includes(text, `Trip ${i}`, `row ${i} printed`);
            notIncludes(text, 'more transactions', 'no "and N more" truncation note');
        });

        await test('F15 Excel download is SpreadsheetML labelled .xls with matching MIME', async () => {
            await seedForReports();
            const xls = await binaryGet('/export/excel?period=current_month', ctxA.token);
            equal(xls.status, 200, 'excel returned');
            const xml = xls.buffer.toString('utf8');
            ok(/\.xls"/i.test(xls.disposition || ''), `extension matches the payload (${xls.disposition})`);
            notIncludes(xls.disposition || '', '.xlsx', 'not mislabelled as xlsx');
            equal(xls.contentType, 'application/vnd.ms-excel', 'SpreadsheetML MIME');
            includes(xml, 'urn:schemas-microsoft-com:office:spreadsheet', 'SpreadsheetML namespace');

            const headerLine = xml.split('\n').find(l => l.includes('ss:StyleID="Header"'));
            ok(headerLine, 'header row present');
            const titles = [...headerLine.matchAll(/<Data ss:Type="String">([^<]*)<\/Data>/g)].map(m => m[1]);
            equal(titles.join('|'), 'Date|Type|Category|Description|Merchant|Source|Payment method|Notes|Amount (INR)', 'nine columns incl. payment method and notes');

            includes(xml, '>UPI<', 'payment method cell');
            includes(xml, '>October pay<', 'notes cell');
            includes(xml, '&amp;', 'ampersand escaped as an entity');
            includes(xml, '<Data ss:Type="Number">45000.00</Data>', 'income total as a number');
            includes(xml, '<Data ss:Type="Number">1750.45</Data>', 'expense total as a number');
            includes(xml, '<Data ss:Type="Number">43249.55</Data>', 'net balance as a number');
            includes(xml, `>${formatDate(todayForReports())}<`, 'date cell uses the app timezone date');
            for (const label of ['Total Income (INR):', 'Total Expense (INR):', 'Net Savings / Balance (INR):']) {
                includes(xml, `>${label}<`, `summary row ${label}`);
            }
            includes(xml, `Period: ${resolvePeriod('current_month').label}`, 'period label names the reported month');

            const dataRows = [...xml.matchAll(/<Row><Cell><Data ss:Type="String">2\d{3}-\d{2}-\d{2}</g)].length;
            equal(dataRows, 3, 'one row per transaction');
        });

        await test('F16 report periods and custom ranges select the right rows', async () => {
            await seedForReports();
            const lastMonth = startOfMonthOffset(-1);
            await addExpense({ amount: 777, category: 'Food', date: formatDate(lastMonth), description: 'Last month dinner' });

            const thisMonth = pdfText((await binaryGet('/export/pdf?period=current_month', ctxA.token)).buffer);
            notIncludes(thisMonth, 'Last month dinner', 'current month excludes last month');
            includes(thisMonth, 'Fuel top-up', 'current month includes this month');

            const previous = pdfText((await binaryGet('/export/pdf?period=previous_month', ctxA.token)).buffer);
            includes(previous, 'Last month dinner', 'previous month report includes it');
            notIncludes(previous, 'Fuel top-up', 'previous month excludes this month');

            const all = pdfText((await binaryGet('/export/pdf?period=all_time', ctxA.token)).buffer);
            includes(all, 'Last month dinner', 'all time includes both');
            includes(all, 'Fuel top-up', 'all time includes both');

            const day = formatDate(startOfDayOffset(0));
            const custom = pdfText((await binaryGet(`/export/pdf?period=custom&startDate=${day}&endDate=${day}`, ctxA.token)).buffer);
            includes(custom, 'Fuel top-up', 'custom range covering today includes it');
            includes(custom, `Period: ${day} to ${day}`, 'custom range echoes its own bounds');
            notIncludes(custom, 'Last month dinner', 'custom range excludes the older row');

            const swapped = pdfText((await binaryGet(`/export/pdf?period=custom&startDate=${day}&endDate=${formatDate(startOfMonthOffset(0))}`, ctxA.token)).buffer);
            includes(swapped, 'Fuel top-up', 'reversed start/end is normalised instead of returning nothing');

            const broken = await binaryGet('/export/pdf?period=custom&startDate=not-a-date&endDate=2026-13-45', ctxA.token);
            equal(broken.status, 200, 'unparseable custom bounds fall back to the default period');
            matches(pdfText(broken.buffer), /Period: /, 'and the report still says which period it used');
        });

        await test('F17 downloads stay authenticated and user scoped', async () => {
            await seedForReports();
            for (const route of ['/export/pdf', '/export/excel']) {
                const anon = await binaryGet(route, null);
                equal(anon.status, 401, `${route} refused without a token`);
            }
            const b = pdfText((await binaryGet('/export/pdf?period=all_time', ctxB.token)).buffer);
            notIncludes(b, 'Weekly supermarket run', "user B's report has none of user A's rows");
            includes(b, 'No transactions recorded for this period.', 'empty report is honest');
        });

        await test('F18 chatbot download handoff points at the authenticated export routes', async () => {
            await seedForReports();
            const pdf = await h.chat(ctxA.token, 'download my report as pdf');
            equal(pdf.downloadFormat, 'pdf', 'pdf handoff announced');
            includes(pdf.reply, 'download', 'reply tells the user a file is coming');

            const excel = await h.chat(ctxA.token, 'give me the month report in excel');
            equal(excel.downloadFormat, 'excel', 'excel handoff announced');

            const got = await binaryGet('/export/excel?period=current_month', ctxA.token);
            equal(got.status, 200, 'the announced file is actually downloadable');
        });

        await test('F28 the browser download helper uses the shared API base and sends the token', async () => {
            // The saved file is produced in the frontend, so the HTTP layer above
            // cannot prove its wiring. Assert the invariants of that one helper:
            // one API origin, auth header, honest extension, no silent error file.
            const src = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'services', 'api.js'), 'utf8');
            const body = src.slice(src.indexOf('downloadReportFile'), src.indexOf('export default api'));
            ok(body.length > 0, 'downloadReportFile exists in services/api.js');
            includes(body, 'getBaseURL()', 'the export URL comes from the single API base');
            notIncludes(body.slice(body.indexOf('const endpoint')), 'fetch(\'/api', 'no relative fetch that would bypass VITE_API_URL');
            matches(body, /Authorization:\s*token/, 'the bearer token is sent with the download');
            includes(body, 'res.ok', 'a failed response is not saved as a report');
            includes(body, "'xls'", 'excel downloads are named .xls to match the SpreadsheetML payload');
            notIncludes(body, '.xlsx', 'no fake .xlsx filename');
            for (const file of ['components/ExpenseAIChatbot.jsx', 'pages/ExportPage.jsx']) {
                const page = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', file), 'utf8');
                notIncludes(page, 'fetch(\'/api', `${file} never hand-rolls an API call`);
            }
        });
    });

    // ------------------------------------------------------------------
    await group('4. Shared expenses and ExpenseBot refresh regressions', async () => {
        const createGroup = async (body, token = ctxA.token) => data(await h.request('POST', '/groups', { token, body }));
        const addShared = async (groupId, body, token = ctxA.token) => h.request('POST', `/groups/${groupId}/expenses`, { token, body });

        await test('F19 group creation returns every member for the UI and the list endpoint agrees', async () => {
            await h.resetData();
            ctxA = await h.registerAndLogin(A, PW);
            ctxB = await h.registerAndLogin(B, PW);
            const g = await createGroup({ groupName: 'Flat 12', memberNames: `${A}, Ravi ,Priya, ravi, Sam` });
            const names = g.members.map(m => m.name);
            equal(names.join(','), `${A},Ravi,Priya,Sam`, `all parsed members in order, got ${names.join(',')}`);
            const listed = data(await h.request('GET', '/groups', { token: ctxA.token }));
            const mine = listed.find(x => x.id === g.id);
            ok(mine, 'group appears in the list');
            equal(mine.members.map(m => m.name).join(','), names.join(','), 'list shows the same members');
            equal(mine.memberNames.length, names.length, 'member count matches');
            equal(mine.members.filter(m => m.isOwner).length, 1, 'exactly one owner flagged for the UI');
        });

        await test('F20 switching between groups never shows the other group members', async () => {
            const g1 = await createGroup({ groupName: 'Flat 12', memberNames: 'Ravi, Priya' });
            const g2 = await createGroup({ groupName: 'Office Trip', memberNames: 'Somu, Tina' });

            await addShared(g1.id, { description: 'Wi-Fi', totalAmount: 900, paidByName: g1.members[0].name, members: g1.memberNames });
            await addShared(g2.id, { description: 'Bus hire', totalAmount: 600, paidByName: g2.members[0].name, members: g2.memberNames });

            const b1 = data(await h.request('GET', `/groups/${g1.id}/balances`, { token: ctxA.token }));
            const b2 = data(await h.request('GET', `/groups/${g2.id}/balances`, { token: ctxA.token }));
            const n1 = new Set(b1.flatMap(x => [x.fromMember, x.toMember]));
            const n2 = new Set(b2.flatMap(x => [x.fromMember, x.toMember]));
            ok([...n1].every(n => g1.memberNames.includes(n)), `group 1 balances only its own members: ${[...n1].join(',')}`);
            ok([...n2].every(n => g2.memberNames.includes(n)), `group 2 balances only its own members: ${[...n2].join(',')}`);
            // The owner pays in both groups, so only the other members must be disjoint.
            const others1 = [...n1].filter(n => n !== A).sort();
            const others2 = [...n2].filter(n => n !== A).sort();
            equal(others1.filter(n => others2.includes(n)).length, 0, 'no member leaks between the two groups');
            equal(others1.join(','), 'Priya,Ravi', `group 1 owes its own members: ${others1.join(',')}`);
            equal(others2.join(','), 'Somu,Tina', `group 2 owes its own members: ${others2.join(',')}`);

            const listed = data(await h.request('GET', '/groups', { token: ctxA.token }));
            const d1 = listed.find(x => x.id === g1.id);
            const d2 = listed.find(x => x.id === g2.id);
            equal(d1.expenses.length, 1, 'group 1 has one expense');
            equal(d2.expenses.length, 1, 'group 2 has one expense');
            includes(d1.expenses[0].description, 'Wi-Fi', 'group 1 shows its own expense');
            includes(d2.expenses[0].description, 'Bus hire', 'group 2 shows its own expense');
            equal(d1.members.map(m => m.name).join(','), g1.memberNames.join(','), 'group 1 member list is its own');
            equal(d2.members.map(m => m.name).join(','), g2.memberNames.join(','), 'group 2 member list is its own');
        });

        await test('F21 balances refresh after a shared expense is added', async () => {
            const g = await createGroup({ groupName: 'Refresh', memberNames: 'Ravi, Priya' });
            const before = data(await h.request('GET', `/groups/${g.id}/balances`, { token: ctxA.token }));
            equal(before.length, 0, 'nothing owed yet');

            const res = await addShared(g.id, { description: 'Dinner', totalAmount: 1000.01, paidByName: g.members[0].name, members: g.memberNames });
            equal(res.status, 200, 'shared expense stored');
            ok(data(res).expenses.length >= 1, 'the saved group with its splits comes back');
            const after = data(await h.request('GET', `/groups/${g.id}/balances`, { token: ctxA.token }));
            ok(after.length > 0, 'balances recomputed without a page reload');
            const totalPaise = after.reduce((s, b) => s + Math.round(b.amount * 100), 0);
            equal(totalPaise, 66667, `two non-payer shares of ₹1000.01 three-way = 666.67, got ${totalPaise / 100}`);

            const exp = data(res).expenses[data(res).expenses.length - 1];
            const sumPaise = exp.splits.reduce((s, x) => s + Math.round(x.amount * 100), 0);
            equal(sumPaise, 100001, 'all three splits add up to the total to the paisa');
        });

        await test('F22 settling one split leaves the others and the other group alone', async () => {
            const g = await createGroup({ groupName: 'Settle', memberNames: 'Ravi, Priya' });
            const other = await createGroup({ groupName: 'Other', memberNames: 'Somu' });
            await addShared(g.id, { description: 'Groceries', totalAmount: 999.99, paidByName: g.members[0].name, members: g.memberNames });
            await addShared(other.id, { description: 'Cab', totalAmount: 400, paidByName: other.members[0].name, members: other.memberNames });

            const balances = data(await h.request('GET', `/groups/${g.id}/balances`, { token: ctxA.token }));
            equal(balances.length, 2, 'two debts');
            const settle = balances[0];
            const res = await h.request('POST', `/groups/splits/${settle.splitId}/settle`, { token: ctxA.token });
            equal(res.status, 200, 'settlement accepted');
            const after = data(await h.request('GET', `/groups/${g.id}/balances`, { token: ctxA.token }));
            equal(after.length, 1, 'only the settled debt disappeared');
            equal(after[0].splitId !== settle.splitId, true, 'the remaining debt is a different one');
            const otherAfter = data(await h.request('GET', `/groups/${other.id}/balances`, { token: ctxA.token }));
            equal(otherAfter.length, 1, 'the other group is untouched');
            const doc = await Group.findById(g.id).lean();
            const splits = doc.expenses[0].splits;
            const payerShare = splits.find(s => s.memberName.toLowerCase() === g.members[0].name.toLowerCase());
            equal(payerShare.isSettled, true, 'the payer share is never an open debt');
            const settledDebts = splits.filter(s => s.isSettled && s !== payerShare);
            equal(settledDebts.length, 1, 'exactly one of the two debts is marked settled');
            equal(String(settledDebts[0]._id), settle.splitId, 'the settled one is the split that was addressed');
            ok(settledDebts[0].settledAt instanceof Date, 'settlement timestamp stored');
            const otherDoc = await Group.findById(other.id).lean();
            equal(otherDoc.expenses[0].splits.filter(s => s.isSettled).length, 1, "the other group's only settled share is its payer");
        });

        await test('F23 ExpenseBot add writes to MongoDB, refreshes the dashboard, and the totals agree', async () => {
            await h.resetData();
            ctxA = await h.registerAndLogin(A, PW);
            ctxB = await h.registerAndLogin(B, PW);
            const start = data(await h.request('GET', '/dashboard/summary', { token: ctxA.token }));
            const added = await h.chat(ctxA.token, 'I spent ₹640 on Food today by UPI, note team lunch');
            equal(added.refreshData, true, 'frontend told to refresh after a write');
            const rows = data(await h.request('GET', '/transactions', { token: ctxA.token }));
            equal(rows.length, 1, 'exactly one transaction written');
            equal(rows[0].amount, 640, 'amount stored');
            equal(rows[0].category, 'Food', 'category stored');
            equal(rows[0].paymentMethod, 'UPI', 'payment method stored');
            includes(rows[0].notes, 'team lunch', 'note stored');
            const after = data(await h.request('GET', '/dashboard/summary', { token: ctxA.token }));
            closeTo(after.totalExpenses - (start.totalExpenses || 0), 640, 0.001, 'dashboard expense rose by 640');
            closeTo(after.balance - (start.balance || 0), -640, 0.001, 'the same write moved the balance');
            const listed = pdfText((await binaryGet('/export/pdf?period=current_month', ctxA.token)).buffer);
            includes(listed, 'team lunch', 'the chatbot write appears in the downloaded report');
        });

        await test('F24 ExpenseBot edit changes the value and delete waits for confirmation first', async () => {
            const edited = await h.chat(ctxA.token, 'change that to 700');
            includes(edited.reply.toLowerCase(), '700', 'edit reports the new value');
            equal(edited.refreshData, true, 'edit asks the UI to refresh');
            const rows = data(await h.request('GET', '/transactions', { token: ctxA.token }));
            equal(rows.length, 1, 'an edit updates the record instead of adding one');
            equal(rows[0].amount, 700, 'record actually updated');
            equal(rows[0].category, 'Food', 'untouched fields survive the edit');

            const ask = await h.chat(ctxA.token, 'delete my last expense');
            matches(ask.reply, /(confirm|are you sure|yes\/no|yes or no|\?)/i, 'destructive action asks first');
            equal(await Transaction.countDocuments({ user: ctxA.userId }), 1, 'nothing deleted yet');

            const cancelled = await h.chat(ctxA.token, 'no');
            equal(await Transaction.countDocuments({ user: ctxA.userId }), 1, 'a refusal keeps the record');
            ok(cancelled.reply, 'the refusal is acknowledged');

            const confirmed = await h.chat(ctxA.token, 'delete my last expense');
            ok(confirmed.reply, 'the second request re-asks for confirmation');
            const yes = await h.chat(ctxA.token, 'yes');
            equal(yes.refreshData, true, 'deletion refreshes the dashboard');
            equal(await Transaction.countDocuments({ user: ctxA.userId }), 0, 'confirmed delete removed the row');
        });

        await test('F25 a forged or absent token never reaches another user data', async () => {
            const anon = await h.request('POST', '/chat', { body: { message: 'how much did I spend?' } });
            equal(anon.status, 401, 'chat requires a token');
            const forged = await h.request('POST', '/chat', { token: 'ey-JWT.forged.signature', body: { message: 'how much did I spend?' } });
            equal(forged.status, 401, 'forged token refused');
            const foreign = await h.request('POST', '/transactions', { token: ctxB.token, body: { amount: 9999, category: 'Food', date: formatDate(startOfDayOffset(0)), description: 'not mine' } });
            equal(foreign.status, 201, 'the other user can record their own expense');
            const mine = data(await h.request('GET', '/transactions', { token: ctxA.token }));
            ok(!mine.some(t => t.description === 'not mine'), "A never sees B's transaction");
        });
    });

    // ------------------------------------------------------------------
    await group('5. Receipt upload without a configured OCR provider', async () => {
        // helpers.js clears OCR_SPACE_API_KEY, so this exercises the documented
        // "provider unavailable" path instead of billing a live OCR call.
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

        const upload = async (token, file = png, name = 'receipt.png') => {
            const form = new FormData();
            if (file) form.append('file', new Blob([file], { type: 'image/png' }), name);
            const res = await fetch(`${h.BASE_URL}/transactions/upload-receipt`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: form
            });
            return { status: res.status, body: await res.json().catch(() => null) };
        };

        await test('F26 an unconfigured OCR key gives a clear 503 and saves nothing', async () => {
            equal(process.env.OCR_SPACE_API_KEY, '', 'suite runs with no provider credential');
            const before = await Transaction.countDocuments({ user: ctxA.userId });
            const res = await upload(ctxA.token);
            equal(res.status, 503, '503 — configuration problem, not a fake scan result');
            equal(res.body.success, false, 'the failure is not reported as success');
            includes(res.body.message, 'OCR_SPACE_API_KEY', 'the message names the setting to fix');
            includes(res.body.message, 'manually', 'the message offers the working alternative');
            notIncludes(JSON.stringify(res.body), 'helloworld', 'no demo/public key is suggested');
            equal(await Transaction.countDocuments({ user: ctxA.userId }), before, 'no half-read transaction was written');
        });

        await test('F27 receipt upload validates auth and the file before touching OCR', async () => {
            const anon = await upload(null);
            equal(anon.status, 401, 'anonymous upload refused');

            const empty = await h.request('POST', '/transactions/upload-receipt', { token: ctxA.token, body: {} });
            ok(empty.status === 400, `JSON body with no file part is a 400 (got ${empty.status})`);
            includes(empty.body.message || '', 'image', 'and says an image is missing');

            const noFile = await upload(ctxA.token, null);
            equal(noFile.status, 400, 'multipart request without a file part');

            const health = await h.request('GET', '/health');
            equal(health.body.capabilities.receiptOcr, false, 'health advertises OCR as unavailable');
            notIncludes(JSON.stringify(health.body), 'ocr.space', 'health does not disclose the provider endpoint');
        });
    });
}

function todayForReports() {
    return startOfDayOffset(0);
}

(async () => {
    const { group, test, summary } = createRunner('Final fixes');
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
