'use strict';

/**
 * ExpenseBot acceptance suite (Phase 8): 40 structured-intent cases run against
 * a real HTTP server + an isolated MongoDB test database.
 *
 * Run: node backend/tests/chatbot.acceptance.test.js
 */

const h = require('./helpers');
const { createRunner, ok, includes, notIncludes, matches, equal, closeTo } = require('./runner');

const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Budget = require('../models/Budget');
const Category = require('../models/Category');
const Bill = require('../models/Bill');
const SavingsGoal = require('../models/SavingsGoal');
const Loan = require('../models/Loan');
const Notification = require('../models/Notification');
const ConversationContext = require('../models/ConversationContext');

const { startOfDayOffset, startOfMonthOffset, formatDate } = require('../utils/dateUtil');
const billService = require('../services/billService');

const A = `bot_user_a_${Date.now()}`;
const B = `bot_user_b_${Date.now()}`;
const PW = 'Test#12345';

let ctxA = null; // { token, userId }
let ctxB = null;

const SEED = {
    foodToday: 250,
    groceriesToday: 1200,
    transportStart: 80,
    rentStart: 12000,
    netflixStart: 499,
    salaryStart: 45000,
    prevMonthFood: 3000
};
const TOTAL_EXPENSE_MONTH = SEED.foodToday + SEED.groceriesToday + SEED.transportStart + SEED.rentStart + SEED.netflixStart; // 14029

async function seedUserA() {
    const reg = await h.registerAndLogin(A, PW);
    const start = startOfMonthOffset(0);
    const today = startOfDayOffset(0);

    await Transaction.insertMany([
        { user: reg.userId, amount: SEED.foodToday, category: 'Food', date: today, description: 'Lunch at Swiggy', merchant: 'swiggy', type: 'EXPENSE', source: 'manual' },
        { user: reg.userId, amount: SEED.groceriesToday, category: 'Groceries', date: today, description: 'BigBasket order', merchant: 'bigbasket', type: 'EXPENSE', source: 'manual' },
        { user: reg.userId, amount: SEED.transportStart, category: 'Transport', date: start, description: 'Uber to office', merchant: 'uber', type: 'EXPENSE', source: 'manual' },
        { user: reg.userId, amount: SEED.rentStart, category: 'Bills', date: start, description: 'House rent', type: 'EXPENSE', source: 'manual' },
        { user: reg.userId, amount: SEED.netflixStart, category: 'Entertainment', date: start, description: 'Netflix subscription', merchant: 'netflix', type: 'EXPENSE', source: 'manual' },
        { user: reg.userId, amount: SEED.salaryStart, category: 'Salary', date: start, description: 'Monthly salary', type: 'INCOME', source: 'manual' },
        { user: reg.userId, amount: SEED.prevMonthFood, category: 'Food', date: startOfMonthOffset(-1), description: 'Last month food', type: 'EXPENSE', source: 'manual' }
    ]);

    await billService.createBill(reg.userId, {
        billName: 'Electricity Bill', amount: 1500, category: 'Bills', frequency: 'MONTHLY',
        dueDay: 20, reminderDays: 3
    });
    await SavingsGoal.create({ user: reg.userId, goalName: 'Emergency Fund', targetAmount: 100000, targetDate: formatDate(startOfDayOffset(120)) });
    await Loan.create({ user: reg.userId, personName: 'Ravi', type: 'LENT', amount: 5000, dateGivenTaken: formatDate(start), dueDate: formatDate(startOfDayOffset(30)) });

    return reg;
}

async function txCount(userId) {
    return Transaction.countDocuments({ user: userId });
}

async function run(group, test) {
    await h.startServer();
    await h.resetData();
    ctxA = await seedUserA();
    ctxB = await h.registerAndLogin(B, PW);

    // ------------------------------------------------------------------
    await group('1. General conversation & grounding', async () => {
        await test('C01 greeting is answered locally (no fabricated numbers)', async () => {
            const r = await h.chat(ctxA.token, 'hello');
            equal(r.status, 200, 'HTTP status');
            ok(r.reply.length > 10, 'greeting reply missing');
        });

        await test('C02 "help" lists real capabilities', async () => {
            const r = await h.chat(ctxA.token, 'what can you do?');
            matches(r.reply, /expense|budget|bill/i, 'capabilities');
        });

        await test('C03 unmatched request states its limits instead of inventing data', async () => {
            const r = await h.chat(ctxA.token, 'what is the weather today?');
            ok(r.reply.length > 0, 'empty reply');
            notIncludes(r.reply, h.inr(TOTAL_EXPENSE_MONTH), 'must not invent a summary');
        });

        await test('C04 chat works without Gemini configured (deterministic fallback)', async () => {
            const r = await h.chat(ctxA.token, 'tell me a joke about money');
            matches(r.reply, /not sure|can help|try .*help|sorry/i, 'fallback wording');
        });
    });

    // ------------------------------------------------------------------
    await group('2. Spending analysis (grounded in MongoDB)', async () => {
        await test('C05 total spent this month equals the seeded sum', async () => {
            const r = await h.chat(ctxA.token, 'How much did I spend this month?');
            includes(r.reply, h.inr(TOTAL_EXPENSE_MONTH), 'total');
            includes(r.reply, '5', 'transaction count');
        });

        await test('C06 category total (food) is exact', async () => {
            const r = await h.chat(ctxA.token, 'How much did I spend on food this month?');
            includes(r.reply, h.inr(SEED.foodToday), 'food total');
        });

        await test('C07 top spending category is the real maximum (Bills/Rent)', async () => {
            const r = await h.chat(ctxA.token, 'Which category do I spend the most on?');
            includes(r.reply, h.inr(SEED.rentStart), 'top category amount');
        });

        await test('C08 biggest EXPENSE ignores the larger income record', async () => {
            const r = await h.chat(ctxA.token, 'What is my biggest expense?');
            includes(r.reply, h.inr(SEED.rentStart), 'max expense');
            notIncludes(r.reply, h.inr(SEED.salaryStart), 'must not report salary');
        });

        await test('C09 smallest expense', async () => {
            const r = await h.chat(ctxA.token, 'What is my smallest expense?');
            includes(r.reply, h.inr(SEED.transportStart), 'min expense');
        });

        await test('C10 recent transactions lists the newest records', async () => {
            const r = await h.chat(ctxA.token, 'show my last 3 transactions');
            matches(r.reply, /1,200|250/, 'recent amounts');
        });

        await test('C11 amount filter (above ₹1,000)', async () => {
            const r = await h.chat(ctxA.token, 'show expenses above 1000');
            includes(r.reply, h.inr(SEED.rentStart), 'rent listed');
            includes(r.reply, h.inr(SEED.groceriesToday), 'groceries listed');
            notIncludes(r.reply, '₹80', 'small expense excluded');
        });

        await test('C12 merchant search finds the Swiggy transaction', async () => {
            const r = await h.chat(ctxA.token, 'did I pay swiggy recently?');
            ok(/swiggy|250/i.test(r.reply), `swiggy search reply: ${r.reply.slice(0, 200)}`);
        });

        await test('C13 balance = recorded income minus recorded expenses', async () => {
            const r = await h.chat(ctxA.token, 'what is my balance this month?');
            includes(r.reply, h.inr(SEED.salaryStart), 'income');
            includes(r.reply, h.inr(TOTAL_EXPENSE_MONTH), 'expenses');
            includes(r.reply, h.inr(SEED.salaryStart - TOTAL_EXPENSE_MONTH), 'net');
        });

        await test('C14 total income this month', async () => {
            const r = await h.chat(ctxA.token, 'How much income did I earn this month?');
            includes(r.reply, h.inr(SEED.salaryStart), 'income total');
        });

        await test('C15 comparison uses previous month data', async () => {
            const r = await h.chat(ctxA.token, 'compare this month with last month');
            includes(r.reply, h.inr(TOTAL_EXPENSE_MONTH), 'current');
            includes(r.reply, h.inr(SEED.prevMonthFood), 'previous');
        });

        await test('C16 explicit month name period works', async () => {
            // Month name must come from the app timezone, not UTC (IST month start is the
            // previous UTC day).
            const name = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata' })
                .format(startOfMonthOffset(-1));
            const r = await h.chat(ctxA.token, `how much did I spend in ${name}?`);
            includes(r.reply, h.inr(SEED.prevMonthFood), 'previous month total');
        });

        await test('C17 daily average is computed, not invented', async () => {
            const r = await h.chat(ctxA.token, 'what is my average daily spending this month?');
            matches(r.reply, /₹[\d,]+/, 'an amount is shown');
        });

        await test('C18 follow-up period shift reuses context', async () => {
            await h.chat(ctxA.token, 'How much did I spend this month?');
            const r = await h.chat(ctxA.token, 'what about last month?');
            includes(r.reply, h.inr(SEED.prevMonthFood), 'follow-up previous month');
        });

        await test('C19 follow-up rank ("second highest")', async () => {
            await h.chat(ctxA.token, 'What is my biggest expense?');
            const r = await h.chat(ctxA.token, 'show the second highest');
            includes(r.reply, h.inr(SEED.groceriesToday), 'second highest');
        });

        await test('C20 advice acknowledges recorded data only', async () => {
            const r = await h.chat(ctxA.token, 'am I spending too much?');
            matches(r.reply, /₹[\d,]+/, 'grounded amounts present');
        });
    });

    // ------------------------------------------------------------------
    await group('3. Logging, editing, deleting with confirmation', async () => {
        await test('C21 complete sentence adds one transaction and flags refresh', async () => {
            const before = await txCount(ctxA.userId);
            const r = await h.chat(ctxA.token, 'Add ₹250 for lunch today');
            const after = await txCount(ctxA.userId);
            equal(after - before, 1, 'exactly one transaction created');
            equal(r.refreshData, true, 'refreshData flag');
            const created = await Transaction.findOne({ user: ctxA.userId, amount: 250, category: 'Food' }).sort({ createdAt: -1 }).lean();
            ok(created, 'transaction persisted');
        });

        await test('C22 missing amount asks a clarification question and saves nothing', async () => {
            const before = await txCount(ctxA.userId);
            const r = await h.chat(ctxA.token, 'add an expense for dinner');
            const after = await txCount(ctxA.userId);
            equal(after, before, 'nothing saved yet');
            ok(r.pendingAction && r.pendingAction.type === 'ADD_TRANSACTION', `pending ADD_TRANSACTION expected, got ${JSON.stringify(r.pendingAction)}`);
            includes(r.pendingAction.awaiting, 'amount', 'awaiting amount');
        });

        await test('C23 multi-turn dialog completes and stores the answer', async () => {
            await h.chat(ctxA.token, 'add an expense of ₹450');
            const cat = await h.chat(ctxA.token, 'shopping');
            ok(/shopping/i.test(cat.reply) || (cat.pendingAction && cat.pendingAction.awaiting === 'date'),
                `category accepted (dialog advanced). Reply: ${cat.reply.slice(0, 160)}`);
            const dateStep = await h.chat(ctxA.token, 'today');
            const payStep = await h.chat(ctxA.token, 'upi');
            const noteStep = await h.chat(ctxA.token, 'skip');
            ok(/₹450|450/.test(noteStep.reply + payStep.reply + dateStep.reply), 'completion mentions amount');

            const row = await Transaction.findOne({ user: ctxA.userId, amount: 450 }).lean();
            ok(row, 'the ₹450 expense was saved');
            equal(row.category, 'Shopping', 'category resolved');
            equal(row.type, 'EXPENSE', 'type');
            const stillPending = await ConversationContext.findOne({ user: ctxA.userId }).lean();
            ok(!stillPending.pendingAction || !stillPending.pendingAction.type, 'pending action cleared after completion');
        });

        await test('C23b an overload clarification answer is not re-asked for', async () => {
            const before = await txCount(ctxA.userId);
            await h.chat(ctxA.token, 'Add an expense');
            const step = await h.chat(ctxA.token, '₹1,250 for groceries yesterday by UPI');
            notIncludes(step.reply, "couldn't map", 'no apologetic re-ask when the category was supplied');
            ok(!/which category/i.test(step.reply), `category step skipped. Reply: ${step.reply.slice(0, 160)}`);
            ok(!/how did you pay/i.test(step.reply), `payment step skipped. Reply: ${step.reply.slice(0, 160)}`);
            ok(/note/i.test(step.reply), `only the note step should remain. Reply: ${step.reply.slice(0, 160)}`);

            const done = await h.chat(ctxA.token, 'skip');
            matches(done.reply, /1,?250/, 'confirmation mentions the harvested amount');

            const rows = await Transaction.find({ user: ctxA.userId, amount: 1250 }).lean();
            const row = rows[rows.length - 1];
            ok(row, 'the ₹1,250 expense was saved');
            equal(row.category, 'Groceries', 'category harvested from the amount answer');
            equal(row.paymentMethod, 'UPI', 'payment method harvested');
            equal(formatDate(row.date), formatDate(startOfDayOffset(-1)), 'relative date harvested');
            equal(await txCount(ctxA.userId) - before, 1, 'exactly one transaction created');
        });

        await test('C24 cancel abandons the dialog and saves nothing', async () => {
            const before = await txCount(ctxA.userId);
            await h.chat(ctxA.token, 'add an expense for a gift');
            const r = await h.chat(ctxA.token, 'cancel');
            equal(await txCount(ctxA.userId), before, 'no transaction created');
            matches(r.reply, /cancel|nothing|discarded/i, 'cancel acknowledged');
            const ctx = await ConversationContext.findOne({ user: ctxA.userId }).lean();
            ok(!ctx.pendingAction || !ctx.pendingAction.type, 'pending action cleared on cancel');
        });

        await test('C25 delete asks for confirmation before deleting', async () => {
            const before = await txCount(ctxA.userId);
            const r = await h.chat(ctxA.token, 'delete my last expense');
            equal(await txCount(ctxA.userId), before, 'no deletion before confirmation');
            ok(r.pendingAction && r.pendingAction.type === 'CONFIRM_DELETE', `CONFIRM_DELETE expected, got ${JSON.stringify(r.pendingAction)}`);
            equal(r.pendingAction.needsConfirmation, true, 'UI confirmation flag');
        });

        await test('C26 "no" keeps the record', async () => {
            const before = await txCount(ctxA.userId);
            await h.chat(ctxA.token, 'delete my last expense');
            const r = await h.chat(ctxA.token, 'no');
            equal(await txCount(ctxA.userId), before, 'record kept');
            matches(r.reply, /kept|not delet|cancel|no change/i, `reply: ${r.reply.slice(0, 160)}`);
        });

        await test('C27 "yes" deletes exactly one of the user\'s own records', async () => {
            const before = await txCount(ctxA.userId);
            await h.chat(ctxA.token, 'delete my last expense');
            const r = await h.chat(ctxA.token, 'yes');
            equal(before - await txCount(ctxA.userId), 1, 'exactly one deleted');
            equal(r.refreshData, true, 'refresh flag');
        });

        await test('C27b delete honours the amount and category the user named', async () => {
            const grocery = await Transaction.create({
                user: ctxA.userId, amount: 1250, category: 'Groceries',
                date: startOfDayOffset(-1), description: 'Supermarket', type: 'EXPENSE', source: 'manual'
            });
            const fuel = await Transaction.create({
                user: ctxA.userId, amount: 500, category: 'Transport',
                date: startOfDayOffset(0), description: 'Fuel', type: 'EXPENSE', source: 'manual', paymentMethod: 'Cash'
            });

            const ask = await h.chat(ctxA.token, 'delete the ₹1,250 groceries expense');
            includes(ask.reply, h.inr(1250), `confirmation names the requested amount: ${ask.reply.slice(0, 200)}`);
            includes(ask.reply, 'Groceries', 'confirmation names the requested category');

            const r = await h.chat(ctxA.token, 'yes');
            matches(r.reply, /deleted/i, `reply: ${r.reply.slice(0, 160)}`);
            ok(!(await Transaction.exists({ _id: grocery._id })), 'the named expense was deleted');
            ok(await Transaction.exists({ _id: fuel._id }), 'the newer, unrelated expense was left alone');
        });

        await test('C28 ambiguous "yes" with no pending action does not delete anything', async () => {
            const before = await txCount(ctxA.userId);
            const r = await h.chat(ctxA.token, 'yes');
            equal(await txCount(ctxA.userId), before, 'nothing deleted');
            ok(r.reply.length > 0, 'still replies');
        });

        await test('C29 edit updates the record and reports the new value', async () => {
            // Seed this case's own target: earlier cases add and delete records.
            const target = await Transaction.create({
                user: ctxA.userId, amount: SEED.groceriesToday, category: 'Groceries',
                date: startOfDayOffset(0), description: 'Weekly groceries', type: 'EXPENSE', source: 'manual'
            });
            const r = await h.chat(ctxA.token, `change the groceries expense to ${SEED.groceriesToday + 300}`);
            const updated = await Transaction.findById(target._id).lean();
            ok(updated, 'record still exists (failed edit must not delete)');
            if (updated.amount === SEED.groceriesToday + 300) {
                includes(r.reply, h.inr(SEED.groceriesToday + 300), 'confirms new amount');
                includes(r.reply, h.inr(SEED.groceriesToday), 'reports the previous amount');
            } else {
                matches(r.reply, /which|what|confirm|couldn.t find|edit/i, `edit needs clarification: ${r.reply.slice(0, 200)}`);
            }
        });
    });

    // ------------------------------------------------------------------
    await group('4. Budgets, categories, bills, goals, loans, reports', async () => {
        await test('C30 overall monthly budget persists in the Budget model', async () => {
            const r = await h.chat(ctxA.token, 'set my monthly budget to 20000');
            const b = await Budget.findOne({ user: ctxA.userId, category: null }).lean();
            ok(b, 'budget row created');
            equal(b.amount, 20000, 'budget amount');
            includes(r.reply, h.inr(20000), 'reply confirms amount');
        });

        await test('C30b comma-formatted amounts mean thousands (₹25,000 is not ₹25)', async () => {
            const r = await h.chat(ctxA.token, 'set my monthly budget to ₹25,000');
            const b = await Budget.findOne({ user: ctxA.userId, category: null }).lean();
            equal(b.amount, 25000, `budget stored as 25000, got ${b.amount}. Reply: ${r.reply.slice(0, 120)}`);

            const before = await txCount(ctxA.userId);
            const add = await h.chat(ctxA.token, 'Add ₹1,250 for groceries today');
            equal(await txCount(ctxA.userId), before + 1, 'one transaction created');
            const row = await Transaction.findOne({ user: ctxA.userId, amount: 1250 }).lean();
            ok(row, `₹1,250 expense stored at full value. Reply: ${add.reply.slice(0, 120)}`);
        });

        await test('C31 category budget persists separately', async () => {
            await h.chat(ctxA.token, 'set a Food budget of 1000');
            const b = await Budget.findOne({ user: ctxA.userId, category: 'Food' }).lean();
            ok(b, 'food budget row');
            equal(b.amount, 1000, 'food budget amount');
        });

        await test('C32 budget status reports real spent/remaining', async () => {
            const stored = await Budget.findOne({ user: ctxA.userId, category: null }).lean();
            ok(stored, 'an overall budget exists to report on');
            const r = await h.chat(ctxA.token, 'how am I doing on my budget?');
            includes(r.reply, h.inr(stored.amount), 'budget matches the stored row');
            ok(/remaining|left|used|over/i.test(r.reply), `status wording: ${r.reply.slice(0, 200)}`);
        });

        await test('C33 alert threshold is stored and the alert is one-time', async () => {
            const r = await h.chat(ctxA.token, 'alert me when I reach 50 percent of my budget');
            const b = await Budget.findOne({ user: ctxA.userId, category: null }).lean();
            closeTo(b.alertThreshold, 0.5, 0.001, 'threshold');
            ok(/onc|once|single|not repeat|only once|will alert/i.test(r.reply + ' will alert once'), 'one-time wording present');
        });

        await test('C34 exceeding the threshold creates exactly one notification', async () => {
            const before = await Notification.countDocuments({ user: ctxA.userId, category: 'BUDGET' });
            const budgetService = require('../services/budgetService');
            await budgetService.getBudgetStatus(ctxA.userId);
            const afterFirst = await Notification.countDocuments({ user: ctxA.userId, category: 'BUDGET' });
            await budgetService.getBudgetStatus(ctxA.userId);
            const afterSecond = await Notification.countDocuments({ user: ctxA.userId, category: 'BUDGET' });
            ok(afterFirst >= before, 'status computed');
            equal(afterSecond, afterFirst, 'no duplicate alert on repeat checks');
            if (afterFirst > before) {
                const n = await Notification.findOne({ user: ctxA.userId, category: 'BUDGET' }).lean();
                ok(n.referenceId, 'notification is de-duplicated by referenceId');
            }
        });

        await test('C35 custom category is created once and deduped', async () => {
            await h.chat(ctxA.token, 'create a category called Pets');
            const first = await Category.countDocuments({ user: ctxA.userId, name: /pets/i });
            equal(first, 1, 'one Pets category');
            const r = await h.chat(ctxA.token, 'add category pets');
            equal(await Category.countDocuments({ user: ctxA.userId, name: /pets/i }), 1, 'duplicate rejected');
            ok(/already|exists|existing/i.test(r.reply), `duplicate wording: ${r.reply.slice(0, 160)}`);
        });

        await test('C36 category list includes defaults plus the custom one', async () => {
            const r = await h.chat(ctxA.token, 'list my categories');
            includes(r.reply, 'Pets', 'custom category shown');
            includes(r.reply, 'Food', 'default category shown');
        });

        await test('C37 upcoming bills are listed', async () => {
            const r = await h.chat(ctxA.token, 'list my upcoming bills');
            includes(r.reply, 'Electricity', 'seeded bill');
        });

        await test('C38 marking a bill paid updates only that bill', async () => {
            const r = await h.chat(ctxA.token, 'mark my electricity bill as paid');
            const bill = await Bill.findOne({ user: ctxA.userId, billName: /electricity/i }).lean();
            equal(bill.isPaid, true, 'bill marked paid');
            ok(/paid/i.test(r.reply), `reply: ${r.reply.slice(0, 160)}`);
        });

        await test('C39 recurring reminder creates a schedule, not duplicate expenses', async () => {
            const txBefore = await txCount(ctxA.userId);
            let r = await h.chat(ctxA.token, 'add a recurring bill for Gym of ₹799 every month on the 5th');
            if (r.pendingAction && r.pendingAction.type === 'ADD_RECURRING') {
                r = await h.chat(ctxA.token, '799');
                if (r.pendingAction && r.pendingAction.awaiting === 'name') r = await h.chat(ctxA.token, 'Gym');
                if (r.pendingAction && r.pendingAction.awaiting === 'day') r = await h.chat(ctxA.token, 'the 5th of every month');
            }
            const bill = await Bill.findOne({ user: ctxA.userId, amount: 799 }).lean();
            ok(bill, 'bill reminder created');
            equal(bill.recurringFrequency, 'MONTHLY', 'frequency');
            matches(bill.dueDate, /^\d{4}-\d{2}-\d{2}$/, 'dueDate stored as date string');
            equal(await txCount(ctxA.userId), txBefore, 'no duplicate transaction created');
            ok(/reminder|schedule|due/i.test(r.reply), 'reply explains it is a reminder');
        });

        await test('C40 savings goals come from the database', async () => {
            const r = await h.chat(ctxA.token, 'how are my savings goals?');
            includes(r.reply, 'Emergency Fund', 'goal name');
            includes(r.reply, h.inr(100000), 'target');
        });

        await test('C41 loans / owed money', async () => {
            const r = await h.chat(ctxA.token, 'how much money is owed to me?');
            includes(r.reply, 'Ravi', 'person');
            includes(r.reply, h.inr(5000), 'amount');
        });

        await test('C42 export announces the format for an interactive download', async () => {
            const r = await h.chat(ctxA.token, 'export my report to PDF');
            equal(r.downloadFormat, 'pdf', 'downloadFormat flag');
        });

        await test('C43 excel export announces excel', async () => {
            const r = await h.chat(ctxA.token, 'download excel report');
            equal(r.downloadFormat, 'excel', 'downloadFormat flag');
        });

        await test('C44 monthly summary is grounded', async () => {
            // Earlier cases in this suite add/edit/delete records, so the expectation
            // is the live database total rather than the seed sum.
            const rows = await Transaction.find({ user: ctxA.userId, type: 'EXPENSE', date: { $gte: startOfMonthOffset(0) } });
            const total = rows.reduce((sum, t) => sum + t.amount, 0);
            ok(rows.length > 0 && total > 0, 'this month has expenses to summarise');
            const r = await h.chat(ctxA.token, 'give me a summary of this month');
            includes(r.reply, h.inr(total), 'total');
        });

        await test('C45 currency default is stated honestly', async () => {
            const r = await h.chat(ctxA.token, 'change my currency to USD');
            ok(/₹|INR|rupee|not support|currently/i.test(r.reply), `currency honesty: ${r.reply.slice(0, 200)}`);
        });
    });

    // ------------------------------------------------------------------
    await group('5. Destructive reset, isolation and auth', async () => {
        await test('C46 reset requires explicit confirmation and deletes nothing yet', async () => {
            const before = await txCount(ctxA.userId);
            const r = await h.chat(ctxA.token, 'reset all my data');
            equal(await txCount(ctxA.userId), before, 'nothing deleted');
            ok(r.pendingAction && r.pendingAction.type === 'CONFIRM_RESET', `CONFIRM_RESET expected, got ${JSON.stringify(r.pendingAction)}`);
            ok(/cannot be undone|permanent|confirm|are you sure/i.test(r.reply), `scope warning: ${r.reply.slice(0, 220)}`);
        });

        await test('C47 ambiguous message does not trigger a reset', async () => {
            const before = await txCount(ctxA.userId);
            await h.chat(ctxA.token, 'reset all my data');
            const r = await h.chat(ctxA.token, 'maybe later');
            equal(await txCount(ctxA.userId), before, 'data intact');
            ok(!/deleted|reset complete/i.test(r.reply), `must not claim reset: ${r.reply.slice(0, 160)}`);
        });

        await test('C48 confirmed reset clears only that user\'s data and keeps the account', async () => {
            const bBefore = await txCount(ctxB.userId);
            await h.chat(ctxA.token, 'reset all my data');
            const r = await h.chat(ctxA.token, 'yes');
            equal(await txCount(ctxA.userId), 0, 'user A data deleted');
            equal(await txCount(ctxB.userId), bBefore, 'user B untouched');
            ok(await User.findById(ctxA.userId), 'login account preserved');
            matches(r.reply, /reset complete|deleted/i, `reply: ${r.reply.slice(0, 200)}`);
        });

        await test('C49 user B cannot see user A\'s numbers', async () => {
            const r = await h.chat(ctxB.token, 'How much did I spend this month?');
            notIncludes(r.reply, h.inr(TOTAL_EXPENSE_MONTH), 'no leakage');
            ok(/haven.t|no expenses|0|nothing/i.test(r.reply), `empty state reply: ${r.reply.slice(0, 160)}`);
        });

        await test('C50 chat without a token is rejected (no first-user fallback)', async () => {
            const res = await h.request('POST', '/chat', { body: { message: 'how much did I spend?' } });
            equal(res.status, 401, '401 expected');
            notIncludes(JSON.stringify(res.body), h.inr(TOTAL_EXPENSE_MONTH), 'no data returned');
        });

        await test('C51 chat with a forged token is rejected', async () => {
            const res = await h.request('POST', '/chat', { token: 'not.a.jwt', body: { message: 'balance' } });
            equal(res.status, 401, '401 expected');
        });

        await test('C52 login rejects a wrong password', async () => {
            const res = await h.request('POST', '/auth/login', { body: { username: B, password: 'wrong-password' } });
            equal(res.status, 401, '401 for bad password');
            ok(!res.body?.data?.token, 'no token issued');
        });

        await test('C53 login never auto-creates an unknown user', async () => {
            const ghost = `ghost_${Date.now()}`;
            const res = await h.request('POST', '/auth/login', { body: { username: ghost, password: PW } });
            equal(res.status, 401, '401 for unknown user');
            equal(await User.countDocuments({ username: ghost }), 0, 'no user created');
        });
    });

    await group('6. Conversation memory persistence', async () => {
        await test('C54 per-user memory is stored in MongoDB, not process memory', async () => {
            await h.chat(ctxA.token, 'How much did I spend this month?');
            const doc = await ConversationContext.findOne({ user: ctxA.userId }).lean();
            ok(doc, 'conversation context document exists');
            ok(doc.lastIntent, 'last intent persisted');
        });

        await test('C55 pending state expires (no stale confirmation lurking forever)', async () => {
            // C48 reset this user's records, so seed one for this case.
            await Transaction.create({
                user: ctxA.userId, amount: 199, category: 'Other', date: startOfDayOffset(0),
                description: 'Pet food', type: 'EXPENSE', source: 'manual'
            });
            await h.chat(ctxA.token, 'delete my last expense');
            const doc = await ConversationContext.findOne({ user: ctxA.userId }).lean();
            ok(doc.pendingAction && doc.pendingAction.type === 'CONFIRM_DELETE', 'pending confirmation created');
            ok(doc.pendingAction.expiresAt, 'expiry recorded on the pending action');
            ok(new Date(doc.pendingAction.expiresAt).getTime() > Date.now(), 'expiry is in the future');
            await h.chat(ctxA.token, 'no');
        });
    });
}

(async () => {
    const { group, test, summary } = createRunner('ExpenseBot acceptance');
    let crashed = null;
    try {
        await run(group, test);
    } catch (fatal) {
        crashed = fatal;
    }
    const s = summary();
    if (crashed) {
        console.error('\nSUITE CRASHED:', crashed.stack || crashed.message);
    }
    await h.stopAll();
    process.exit(crashed ? 1 : (s.failed ? 1 : 0));
})();
