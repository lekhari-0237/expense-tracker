'use strict';

const Bill = require('../models/Bill');
const { todayParts, formatDate } = require('../utils/dateUtil');

function dayDiffFromToday(dateStr) {
    if (!dateStr) return null;
    const t = todayParts();
    const due = new Date(`${dateStr}T00:00:00Z`);
    const today = new Date(Date.UTC(t.year, t.month - 1, t.day));
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function computeStatus(bill) {
    if (bill.isPaid) return 'PAID';
    const diff = dayDiffFromToday(bill.dueDate);
    if (diff === null) return 'UNKNOWN';
    if (diff < 0) return 'OVERDUE';
    if (diff === 0) return 'DUE_TODAY';
    if (diff <= 7) return 'DUE_THIS_WEEK';
    return 'UPCOMING';
}

/** Next calendar date for a given day-of-month (1-31), from today, in the app timezone. */
function nextDateForDayOfMonth(day) {
    const t = todayParts();
    const d = Math.min(Math.max(1, day), 31);
    // Same month if the day is still ahead, otherwise next month
    const candidate = new Date(Date.UTC(t.year, t.month - 1, d));
    const todayUtc = new Date(Date.UTC(t.year, t.month - 1, t.day));
    if (candidate.getTime() >= todayUtc.getTime()) {
        return formatDate(candidate);
    }
    return formatDate(new Date(Date.UTC(t.year, t.month, d)));
}

function statusText(bill) {
    const status = computeStatus(bill);
    const diff = dayDiffFromToday(bill.dueDate);
    switch (status) {
        case 'PAID': return 'Paid';
        case 'OVERDUE': return `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'}`;
        case 'DUE_TODAY': return 'Due today';
        case 'DUE_THIS_WEEK': return `Due in ${diff} day${diff === 1 ? '' : 's'}`;
        case 'UPCOMING': return `Due in ${diff} days`;
        default: return 'Due date unknown';
    }
}

/**
 * Create a recurring bill / reminder.
 * Accepts dueDay (day of month) or dueDate (YYYY-MM-DD).
 */
async function createBill(userId, { billName, amount, category, frequency = 'MONTHLY', dueDay, dueDate, reminderDays = 3, notes = '' }) {
    if (!billName || !String(billName).trim()) {
        const e = new Error('Bill name is required');
        e.status = 400;
        throw e;
    }
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
        const e = new Error('Bill amount must be greater than 0');
        e.status = 400;
        throw e;
    }

    let resolvedDueDate = dueDate || null;
    if (!resolvedDueDate && dueDay) {
        resolvedDueDate = nextDateForDayOfMonth(parseInt(dueDay, 10));
    }
    if (!resolvedDueDate) {
        const e = new Error('A due date or due day is required');
        e.status = 400;
        throw e;
    }

    const bill = await Bill.create({
        user: userId,
        billName: String(billName).trim(),
        amount: amt,
        category: category || 'Bills',
        dueDate: resolvedDueDate,
        recurringFrequency: ['MONTHLY', 'WEEKLY', 'YEARLY'].includes(String(frequency).toUpperCase()) ? String(frequency).toUpperCase() : 'MONTHLY',
        reminderDays: reminderDays !== undefined ? parseInt(reminderDays, 10) : 3,
        notes: notes || ''
    });

    return serializeBill(bill);
}

function serializeBill(b) {
    return {
        id: b._id,
        billName: b.billName,
        amount: b.amount,
        category: b.category,
        dueDate: b.dueDate,
        recurringFrequency: b.recurringFrequency,
        reminderDays: b.reminderDays,
        notes: b.notes || '',
        isPaid: b.isPaid,
        status: computeStatus(b),
        statusText: statusText(b),
        daysRemaining: b.isPaid ? 0 : dayDiffFromToday(b.dueDate)
    };
}

/** All bills with statuses, sorted unpaid-first then by due date. */
async function listBills(userId) {
    const bills = await Bill.find({ user: userId }).lean();
    const serialized = bills.map(b => serializeBill(b));
    const order = { OVERDUE: 0, DUE_TODAY: 1, DUE_THIS_WEEK: 2, UPCOMING: 3, PAID: 4, UNKNOWN: 5 };
    return serialized.sort((a, b) => (order[a.status] - order[b.status]) || String(a.dueDate).localeCompare(String(b.dueDate)));
}

/** Find a bill by (partial, case-insensitive) name. */
async function findBillByName(userId, namePart) {
    if (!namePart) return null;
    const safe = namePart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Bill.findOne({
        user: userId,
        billName: { $regex: new RegExp(safe, 'i') }
    }).sort({ isPaid: 1, dueDate: 1 });
}

async function markBillPaid(userId, billId) {
    const bill = await Bill.findOne({ _id: billId, user: userId });
    if (!bill) return null;
    bill.isPaid = true;
    bill.lastPaidDate = new Date();
    await bill.save();
    return serializeBill(bill);
}

async function deleteBill(userId, billId) {
    const deleted = await Bill.findOneAndDelete({ _id: billId, user: userId });
    return deleted;
}

module.exports = {
    createBill,
    listBills,
    findBillByName,
    markBillPaid,
    deleteBill,
    computeStatus,
    statusText,
    nextDateForDayOfMonth,
    dayDiffFromToday
};
